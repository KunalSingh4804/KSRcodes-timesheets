import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { db } from "./db.js";
import { actorInclude, type Actor } from "./access.js";
import { AppError } from "./domain.js";
export const production = process.env.NODE_ENV === "production";
export const devAuth = process.env.AUTH_MODE === "development" && !production;
export const origin = process.env.APP_ORIGIN ?? "http://localhost:5173";
if (production && process.env.AUTH_MODE !== "entra")
  throw new Error("Production requires AUTH_MODE=entra");
// Express exposes request augmentation through its global namespace.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor: Actor;
      correlationId: string;
      sessionHash: string;
    }
  }
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookieOptions = {
  httpOnly: true,
  secure: production,
  sameSite: "lax" as const,
  path: "/",
};
export async function newSession(res: Response, userId: string) {
  const token = randomBytes(32).toString("base64url"),
    csrf = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      tokenHash: hash(token),
      csrfHash: hash(csrf),
      userId,
      expiresAt: new Date(Date.now() + 8 * 3600000),
    },
  });
  res.cookie("mv_session", token, { ...cookieOptions, maxAge: 8 * 3600000 });
  res.cookie("mv_csrf", csrf, {
    ...cookieOptions,
    httpOnly: false,
    maxAge: 8 * 3600000,
  });
}
export function verifyOrigin(req: Request) {
  if (req.get("origin") !== origin)
    throw new AppError(403, "Request origin is not allowed");
}
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = req.cookies.mv_session;
    if (!token) throw new AppError(401, "Please sign in");
    const session = await db.session.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: { include: actorInclude } },
    });
    if (!session || session.expiresAt < new Date() || !session.user.active)
      throw new AppError(401, "Your session has expired");
    req.actor = session.user;
    req.sessionHash = session.tokenHash;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      verifyOrigin(req);
      const csrf = req.get("x-csrf-token") ?? "";
      if (!equal(hash(csrf), session.csrfHash))
        throw new AppError(403, "Invalid CSRF token");
    }
    next();
  } catch (e) {
    next(e);
  }
}
export const authRouter = Router();
authRouter.get("/config", (_req, res) =>
  res.json({
    data: {
      mode: devAuth ? "development" : "entra",
      company: "KSRcodes pvt.ltd",
      configured:
        devAuth ||
        !!(
          process.env.ENTRA_TENANT_ID &&
          process.env.ENTRA_CLIENT_ID &&
          process.env.ENTRA_CLIENT_SECRET
        ),
    },
  }),
);
authRouter.get("/development/users", async (_req, res) => {
  if (!devAuth) throw new AppError(404, "Not found");
  res.json({
    data: await db.user.findMany({
      where: { active: true, email: { endsWith: ".example" } },
      select: {
        id: true,
        name: true,
        email: true,
        roles: { select: { role: { select: { name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
  });
});
authRouter.post("/development/login", async (req, res) => {
  if (!devAuth) throw new AppError(404, "Not found");
  verifyOrigin(req);
  const user = await db.user.findFirst({
    where: {
      id: String(req.body.userId),
      active: true,
      email: { endsWith: ".example" },
    },
  });
  if (!user) throw new AppError(403, "Development identity is unavailable");
  await newSession(res, user.id);
  res.json({ data: { ok: true } });
});
function client() {
  const {
    ENTRA_TENANT_ID: t,
    ENTRA_CLIENT_ID: c,
    ENTRA_CLIENT_SECRET: s,
  } = process.env;
  if (!t || !c || !s)
    throw new AppError(503, "Company SSO has not been configured");
  return new ConfidentialClientApplication({
    auth: {
      clientId: c,
      authority: `https://login.microsoftonline.com/${t}`,
      clientSecret: s,
    },
  });
}
authRouter.get("/login", async (_req, res) => {
  const msal = client(),
    state = randomBytes(32).toString("base64url"),
    nonce = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  await db.authRequest.create({
    data: {
      stateHash: hash(state),
      nonce,
      verifier,
      expiresAt: new Date(Date.now() + 10 * 60000),
    },
  });
  res.cookie("mv_oauth", state, { ...cookieOptions, maxAge: 600000 });
  res.redirect(
    await msal.getAuthCodeUrl({
      scopes: ["openid", "profile", "email"],
      redirectUri: process.env.ENTRA_REDIRECT_URI!,
      state,
      nonce,
      codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
      codeChallengeMethod: "S256",
      responseMode: "query",
    }),
  );
});
authRouter.get("/callback", async (req, res) => {
  const state = String(req.query.state ?? "");
  if (!state || !req.cookies.mv_oauth || !equal(state, req.cookies.mv_oauth))
    throw new AppError(401, "Invalid sign-in state");
  const pending = await db.authRequest.findUnique({
    where: { stateHash: hash(state) },
  });
  if (!pending || pending.expiresAt < new Date())
    throw new AppError(401, "Sign-in request expired");
  const consumed = await db.authRequest.deleteMany({
    where: { stateHash: hash(state) },
  });
  if (consumed.count !== 1)
    throw new AppError(401, "Sign-in request already used");
  res.clearCookie("mv_oauth", cookieOptions);
  const result = await client().acquireTokenByCode({
    code: String(req.query.code ?? ""),
    redirectUri: process.env.ENTRA_REDIRECT_URI!,
    scopes: ["openid", "profile", "email"],
    codeVerifier: pending.verifier,
  });
  if (!result?.idToken) throw new AppError(401, "Sign-in failed");
  const tenant = process.env.ENTRA_TENANT_ID!;
  const { payload } = await jwtVerify(
    result.idToken,
    createRemoteJWKSet(
      new URL(
        `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
      ),
    ),
    {
      audience: process.env.ENTRA_CLIENT_ID!,
      issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
      algorithms: ["RS256"],
    },
  );
  if (
    payload.tid !== tenant ||
    payload.nonce !== pending.nonce ||
    typeof payload.oid !== "string"
  )
    throw new AppError(401, "Invalid company identity");
  const user = await db.user.findUnique({
    where: {
      entraTenantId_entraObjectId: {
        entraTenantId: tenant,
        entraObjectId: payload.oid,
      },
    },
  });
  if (!user?.active)
    throw new AppError(403, "Your company account has not been provisioned");
  await newSession(res, user.id);
  res.redirect("/dashboard");
});
authRouter.post("/logout", authenticate, async (req, res) => {
  await db.session.deleteMany({ where: { tokenHash: req.sessionHash } });
  res.clearCookie("mv_session", cookieOptions);
  res.clearCookie("mv_csrf", { ...cookieOptions, httpOnly: false });
  res.json({ data: { ok: true } });
});
