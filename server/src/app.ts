import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db.js";
import { authRouter, authenticate, devAuth } from "./auth.js";
import {
  canConfigure,
  employeeScope,
  requirePermission,
  grants,
} from "./access.js";
import { AppError, assertPeriod, dateSchema, policySchema } from "./domain.js";
import {
  readSheet,
  saveEntries,
  submit,
  reopen,
  requestAmendment,
  decide,
  reviewTask,
  transact,
  audit,
  json,
} from "./timesheets.js";
import { monthlyReport, exportCsv } from "./reports.js";
export const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
      },
    },
  }),
);
app.use((req, res, next) => {
  req.correlationId = randomUUID();
  res.set("X-Correlation-ID", req.correlationId);
  next();
});
app.use(express.json({ limit: "1mb" }), cookieParser());
app.use(
  "/auth",
  rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  authRouter,
);
app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
app.get("/health/ready", async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: "ready" });
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
  authenticate,
  (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  },
);
const api = express.Router();
app.use("/api/v1", api);
const uuid = (v: unknown) => z.uuid().parse(v);
const revSchema = z.number().int().nonnegative();
const key = (req: express.Request) =>
  z.string().min(8).max(128).parse(req.get("Idempotency-Key"));
const pagination = (q: Record<string, unknown>) => {
  const page = z.coerce.number().int().min(1).default(1).parse(q.page),
    limit = z.coerce.number().int().min(1).max(100).default(25).parse(q.limit);
  return { page, limit, skip: (page - 1) * limit };
};
api.get("/me", (req, res) =>
  res.json({
    data: {
      id: req.actor.id,
      name: req.actor.name,
      email: req.actor.email,
      organization: req.actor.organization,
      roles: req.actor.roles.map((r) => r.role.name),
      permissions: [
        ...new Set(
          req.actor.roles.flatMap((r) =>
            r.role.permissions.map((p) => p.permission.code),
          ),
        ),
      ],
      development: devAuth,
    },
  }),
);
api.get("/reporting-periods", async (req, res) =>
  res.json({
    data: await db.reportingPeriod.findMany({
      where: { organizationId: req.actor.organizationId },
      include: { policy: { include: { calendar: true } } },
      orderBy: { startsOn: "desc" },
      take: 36,
    }),
  }),
);
api.get("/projects", async (req, res) => {
  const admin = grants(req.actor, "organization.write").some(
    (x) => x.scope === "ORGANIZATION",
  );
  res.json({
    data: await db.project.findMany({
      where: {
        organizationId: req.actor.organizationId,
        ...(admin
          ? {}
          : {
              OR: [
                { assignments: { some: { userId: req.actor.id } } },
                { managerId: req.actor.id },
              ],
            }),
      },
      include: { assignments: { where: { userId: req.actor.id } } },
      orderBy: { name: "asc" },
    }),
  });
});
api.get("/timesheets", async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const status = req.query.status
    ? z
        .enum(["DRAFT", "IN_APPROVAL", "APPROVED", "RETURNED", "REJECTED"])
        .parse(req.query.status)
    : undefined;
  const where: Prisma.TimesheetWhereInput = {
    user: employeeScope(req.actor),
    ...(req.query.mine === "true" ? { userId: req.actor.id } : {}),
    ...(req.query.periodId ? { periodId: uuid(req.query.periodId) } : {}),
    ...(status ? { status } : {}),
  };
  const [data, total] = await Promise.all([
    db.timesheet.findMany({
      where,
      include: {
        user: { select: { name: true } },
        period: true,
        entries: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    db.timesheet.count({ where }),
  ]);
  res.json({ data, meta: { page, limit, total } });
});
api.post("/timesheets", async (req, res) => {
  requirePermission(req.actor, "timesheet.write");
  const periodId = uuid(req.body.periodId);
  const period = await db.reportingPeriod.findFirst({
    where: { id: periodId, organizationId: req.actor.organizationId },
  });
  if (!period) throw new AppError(404, "Reporting period not found");
  const s = await transact(async (tx) => {
    const existing = await tx.timesheet.findUnique({
      where: { userId_periodId: { userId: req.actor.id, periodId } },
    });
    if (existing) return existing;
    const made = await tx.timesheet.create({
      data: { userId: req.actor.id, periodId },
    });
    await audit(tx, req.actor, "DRAFT_CREATED", made.id, req.correlationId);
    return made;
  });
  res.status(201).json({ data: s });
});
api.get("/timesheets/:id", async (req, res) =>
  res.json({ data: await readSheet(req.actor, uuid(req.params.id)) }),
);
api.put("/timesheets/:id/entries", async (req, res) => {
  requirePermission(req.actor, "timesheet.write");
  res.json({
    data: await saveEntries(
      req.actor,
      uuid(req.params.id),
      revSchema.parse(req.body.revision),
      req.body.entries,
      req.correlationId,
    ),
  });
});
api.post("/timesheets/:id/submit", async (req, res) =>
  res.json({
    data: await submit(
      req.actor,
      uuid(req.params.id),
      revSchema.parse(req.body.revision),
      key(req),
      req.correlationId,
    ),
  }),
);
api.post("/timesheets/:id/reopen", async (req, res) =>
  res.json({
    data: await reopen(
      req.actor,
      uuid(req.params.id),
      revSchema.parse(req.body.revision),
      req.correlationId,
    ),
  }),
);
api.get("/timesheets/:id/amendments", async (req, res) => {
  const s = await readSheet(req.actor, uuid(req.params.id));
  res.json({ data: s.amendments });
});
api.post("/timesheets/:id/amendments", async (req, res) => {
  const reason = z.string().trim().min(5).max(2000).parse(req.body.reason);
  res.status(201).json({
    data: await requestAmendment(
      req.actor,
      uuid(req.params.id),
      revSchema.parse(req.body.revision),
      reason,
      req.body.entries,
      req.correlationId,
    ),
  });
});
api.get("/approvals/inbox", async (req, res) => {
  requirePermission(req.actor, "approval.decide");
  const { page, limit, skip } = pagination(req.query);
  const tasks = await db.approvalTask.findMany({
    where: {
      approverId: req.actor.id,
      status: "PENDING",
      instance: {
        status: "ACTIVE",
        timesheet: { user: { organizationId: req.actor.organizationId } },
      },
    },
    include: {
      stage: true,
      instance: {
        include: {
          timesheet: {
            include: { user: { select: { name: true } }, period: true },
          },
          amendment: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const active = tasks.filter(
    (t) => t.stage.position === t.instance.stagePosition,
  );
  res.json({
    data: active.slice(skip, skip + limit).map((t) => ({
      id: t.id,
      employee: t.instance.timesheet.user.name,
      period: t.instance.timesheet.period,
      stage: t.stage.name,
      kind: t.instance.amendmentId ? "AMENDMENT" : "TIMESHEET",
      createdAt: t.createdAt,
    })),
    meta: { page, limit, total: active.length },
  });
});
api.get("/approvals/:taskId", async (req, res) =>
  res.json({ data: await reviewTask(req.actor, uuid(req.params.taskId)) }),
);
for (const [path, action] of [
  ["approve", "APPROVED"],
  ["reject", "REJECTED"],
  ["return", "RETURNED"],
] as const) {
  api.post(`/approvals/:taskId/${path}`, async (req, res) =>
    res.json({
      data: await decide(
        req.actor,
        uuid(req.params.taskId),
        action,
        z.string().trim().max(2000).optional().parse(req.body.reason),
        revSchema.parse(req.body.revision),
        key(req),
        req.correlationId,
      ),
    }),
  );
}
for (const [path, action] of [
  ["approve", "APPROVED"],
  ["reject", "REJECTED"],
] as const) {
  api.post(`/amendments/:id/${path}`, async (req, res) => {
    const task = await db.approvalTask.findFirst({
      where: {
        approverId: req.actor.id,
        status: "PENDING",
        instance: { amendmentId: uuid(req.params.id), status: "ACTIVE" },
      },
      include: { stage: true, instance: true },
    });
    if (!task || task.stage.position !== task.instance.stagePosition)
      throw new AppError(404, "Active amendment approval task not found");
    res.json({
      data: await decide(
        req.actor,
        task.id,
        action,
        z.string().trim().max(2000).optional().parse(req.body.reason),
        revSchema.parse(req.body.revision),
        key(req),
        req.correlationId,
      ),
    });
  });
}
api.get("/reports/monthly", async (req, res) =>
  res.json({ data: await monthlyReport(req.actor, uuid(req.query.periodId)) }),
);
api.post("/exports", async (req, res) => {
  const csv = await exportCsv(
    req.actor,
    uuid(req.body.periodId),
    req.correlationId,
  );
  res.type("text/csv").attachment("multiverse-timesheets.csv").send(csv);
});
api.get("/audit-events", async (req, res) => {
  requirePermission(req.actor, "audit.read");
  const { page, limit, skip } = pagination(req.query);
  const targetId = req.query.targetId ? uuid(req.query.targetId) : undefined;
  const organizationWide = grants(req.actor, "audit.read").some(
    (g) => g.scope === "ORGANIZATION",
  );
  if (!organizationWide) {
    if (!targetId)
      throw new AppError(
        403,
        "Select an authorized timesheet to view its history",
      );
    await readSheet(req.actor, targetId);
  }
  const where: Prisma.AuditEventWhereInput = {
    actor: { organizationId: req.actor.organizationId },
    ...(targetId ? { targetId } : {}),
  };
  const [data, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip,
    }),
    db.auditEvent.count({ where }),
  ]);
  res.json({ data, meta: { page, limit, total } });
});
api.get("/notifications", async (req, res) =>
  res.json({
    data: await db.notification.findMany({
      where: { userId: req.actor.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  }),
);
api.post("/notifications/:id/read", async (req, res) => {
  await db.notification.updateMany({
    where: { id: uuid(req.params.id), userId: req.actor.id },
    data: { readAt: new Date() },
  });
  res.json({ data: { ok: true } });
});
api.get("/organization/teams", async (req, res) => {
  requirePermission(req.actor, "organization.read");
  const all = grants(req.actor, "organization.read").some(
    (g) => g.scope === "ORGANIZATION",
  );
  res.json({
    data: await db.team.findMany({
      where: {
        organizationId: req.actor.organizationId,
        ...(all
          ? {}
          : {
              id: {
                in: req.actor.roles.flatMap((g) =>
                  g.teamId ? [g.teamId] : [],
                ),
              },
            }),
      },
      include: {
        department: true,
        memberships: {
          include: { user: { select: { id: true, name: true, active: true } } },
        },
      },
    }),
  });
});
api.get("/employee-options", async (req, res) => {
  requirePermission(req.actor, "organization.read");
  const data = await db.user.findMany({
    where: employeeScope(req.actor, "organization.read"),
    select: { id: true, name: true, email: true, active: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
  res.json({ data });
});
api.get("/employees", async (req, res) => {
  requirePermission(req.actor, "organization.read");
  const { page, limit, skip } = pagination(req.query);
  const search = z.string().max(100).optional().parse(req.query.search);
  const where: Prisma.UserWhereInput = {
    ...employeeScope(req.actor, "organization.read"),
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
  };
  const [data, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        managerId: true,
        roles: { select: { role: { select: { name: true } }, scope: true } },
      },
      orderBy: { name: "asc" },
      take: limit,
      skip,
    }),
    db.user.count({ where }),
  ]);
  res.json({ data, meta: { page, limit, total } });
});
api.post("/employees", async (req, res) => {
  requirePermission(req.actor, "organization.write");
  if (
    !grants(req.actor, "organization.write").some(
      (g) => g.scope === "ORGANIZATION",
    )
  )
    throw new AppError(403, "Organization scope required");
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      email: z.email(),
      entraTenantId: z.uuid().optional(),
      entraObjectId: z.uuid().optional(),
    })
    .strict()
    .parse(req.body);
  if (!!input.entraTenantId !== !!input.entraObjectId)
    throw new AppError(422, "Tenant ID and object ID are required together");
  const user = await transact(async (tx) => {
    const u = await tx.user.create({
      data: { ...input, organizationId: req.actor.organizationId },
    });
    const role = await tx.role.findUniqueOrThrow({
      where: { name: "Employee" },
    });
    await tx.userRole.create({
      data: { userId: u.id, roleId: role.id, scope: "SELF" },
    });
    await audit(tx, req.actor, "EMPLOYEE_CREATED", u.id, req.correlationId);
    return u;
  });
  res.status(201).json({ data: user });
});
api.patch("/employees/:id", async (req, res) => {
  requirePermission(req.actor, "organization.write");
  if (
    !grants(req.actor, "organization.write").some(
      (g) => g.scope === "ORGANIZATION",
    )
  )
    throw new AppError(403, "Organization scope required");
  const data = z
    .object({
      active: z.boolean().optional(),
      managerId: z.uuid().nullable().optional(),
    })
    .strict()
    .parse(req.body);
  const id = uuid(req.params.id);
  if (id === req.actor.id && data.active === false)
    throw new AppError(422, "You cannot deactivate your own account");
  if (data.managerId === id)
    throw new AppError(422, "Employee cannot report to themselves");
  await transact(async (tx) => {
    if (
      !(await tx.user.findFirst({
        where: { id, organizationId: req.actor.organizationId },
      }))
    )
      throw new AppError(404, "Employee not found");
    if (
      data.managerId &&
      !(await tx.user.findFirst({
        where: {
          id: data.managerId,
          organizationId: req.actor.organizationId,
          active: true,
        },
      }))
    )
      throw new AppError(422, "Invalid manager");
    await tx.user.update({ where: { id }, data });
    if (data.active === false)
      await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, req.actor, "EMPLOYEE_UPDATED", id, req.correlationId, data);
  });
  res.json({ data: { ok: true } });
});
api.post("/projects", async (req, res) => {
  requirePermission(req.actor, "organization.write");
  if (
    !grants(req.actor, "organization.write").some(
      (g) => g.scope === "ORGANIZATION",
    )
  )
    throw new AppError(403, "Organization scope required");
  const data = z
    .object({
      name: z.string().trim().min(2).max(100),
      code: z.string().regex(/^[A-Z0-9-]{2,20}$/),
      managerId: z.uuid().optional(),
    })
    .strict()
    .parse(req.body);
  if (
    data.managerId &&
    !(await db.user.findFirst({
      where: {
        id: data.managerId,
        organizationId: req.actor.organizationId,
        active: true,
      },
    }))
  )
    throw new AppError(422, "Invalid manager");
  const project = await transact(async (tx) => {
    const p = await tx.project.create({
      data: { ...data, organizationId: req.actor.organizationId },
    });
    await audit(tx, req.actor, "PROJECT_CREATED", p.id, req.correlationId);
    return p;
  });
  res.status(201).json({ data: project });
});
api.post("/project-assignments", async (req, res) => {
  requirePermission(req.actor, "organization.write");
  if (
    !grants(req.actor, "organization.write").some(
      (g) => g.scope === "ORGANIZATION",
    )
  )
    throw new AppError(403, "Organization scope required");
  const input = z
    .object({
      userId: z.uuid(),
      projectId: z.uuid(),
      startsOn: dateSchema,
      endsOn: dateSchema.nullable().optional(),
    })
    .strict()
    .parse(req.body);
  if (input.endsOn && input.endsOn < input.startsOn)
    throw new AppError(422, "Assignment end precedes start");
  const result = await transact(async (tx) => {
    const user = await tx.user.findFirst({
        where: {
          id: input.userId,
          organizationId: req.actor.organizationId,
          active: true,
        },
      }),
      project = await tx.project.findFirst({
        where: {
          id: input.projectId,
          organizationId: req.actor.organizationId,
          active: true,
        },
      });
    if (!user || !project)
      throw new AppError(
        422,
        "Employee and project must belong to this organization",
      );
    const assignment = await tx.projectAssignment.create({
      data: {
        ...input,
        startsOn: new Date(input.startsOn),
        endsOn: input.endsOn ? new Date(input.endsOn) : null,
      },
    });
    await audit(
      tx,
      req.actor,
      "PROJECT_ASSIGNED",
      project.id,
      req.correlationId,
      { userId: user.id },
    );
    return assignment;
  });
  res.status(201).json({ data: result });
});
api.get("/admin/configuration", async (req, res) => {
  if (!canConfigure(req.actor))
    throw new AppError(403, "Configuration permission required");
  const [workflows, policies, calendars, roles] = await Promise.all([
    db.approvalWorkflowDefinition.findMany({
      where: { organizationId: req.actor.organizationId },
      include: { stages: { orderBy: { position: "asc" } } },
    }),
    db.workPolicy.findMany({
      where: { organizationId: req.actor.organizationId },
    }),
    db.companyCalendar.findMany({
      where: { organizationId: req.actor.organizationId },
    }),
    db.role.findMany({
      include: { permissions: { include: { permission: true } } },
    }),
  ]);
  res.json({ data: { workflows, policies, calendars, roles } });
});
api.post("/admin/workflows", async (req, res) => {
  if (!canConfigure(req.actor))
    throw new AppError(403, "Configuration permission required");
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      stages: z
        .array(
          z
            .object({
              name: z.string().min(2).max(100),
              resolver: z.enum([
                "REPORTING_MANAGER",
                "PROJECT_MANAGER",
                "HR_GROUP",
              ]),
            })
            .strict(),
        )
        .min(1)
        .max(6),
    })
    .strict()
    .parse(req.body);
  const workflow = await transact(async (tx) => {
    const last = await tx.approvalWorkflowDefinition.findFirst({
      where: { organizationId: req.actor.organizationId, name: input.name },
      orderBy: { version: "desc" },
    });
    await tx.approvalWorkflowDefinition.updateMany({
      where: { organizationId: req.actor.organizationId, active: true },
      data: { active: false },
    });
    const w = await tx.approvalWorkflowDefinition.create({
      data: {
        organizationId: req.actor.organizationId,
        name: input.name,
        version: (last?.version ?? 0) + 1,
        active: true,
        stages: {
          create: input.stages.map((s, i) => ({
            ...s,
            position: i + 1,
            config: { decisionRule: "ALL", delegationEnabled: false },
          })),
        },
      },
    });
    await audit(tx, req.actor, "WORKFLOW_PUBLISHED", w.id, req.correlationId, {
      version: w.version,
    });
    return w;
  });
  res.status(201).json({ data: workflow });
});
api.post("/admin/policies", async (req, res) => {
  if (!canConfigure(req.actor))
    throw new AppError(403, "Configuration permission required");
  const input = z
    .object({
      name: z.string().min(2).max(100),
      calendarId: z.uuid(),
      config: policySchema,
    })
    .strict()
    .parse(req.body);
  const p = await transact(async (tx) => {
    if (
      !(await tx.companyCalendar.findFirst({
        where: {
          id: input.calendarId,
          organizationId: req.actor.organizationId,
        },
      }))
    )
      throw new AppError(422, "Calendar not found");
    const last = await tx.workPolicy.findFirst({
      where: { name: input.name, organizationId: req.actor.organizationId },
      orderBy: { version: "desc" },
    });
    const p = await tx.workPolicy.create({
      data: {
        ...input,
        organizationId: req.actor.organizationId,
        version: (last?.version ?? 0) + 1,
        config: json(input.config),
      },
    });
    await audit(tx, req.actor, "POLICY_CREATED", p.id, req.correlationId);
    return p;
  });
  res.status(201).json({ data: p });
});
api.post("/admin/calendars", async (req, res) => {
  if (!canConfigure(req.actor))
    throw new AppError(403, "Configuration permission required");
  const input = z
    .object({
      name: z.string().min(2).max(100),
      holidays: z.array(dateSchema).max(366),
    })
    .strict()
    .parse(req.body);
  const data = await transact(async (tx) => {
    const c = await tx.companyCalendar.create({
      data: { ...input, organizationId: req.actor.organizationId },
    });
    await audit(tx, req.actor, "CALENDAR_CREATED", c.id, req.correlationId);
    return c;
  });
  res.status(201).json({ data });
});
api.post("/admin/reporting-periods", async (req, res) => {
  if (!canConfigure(req.actor))
    throw new AppError(403, "Configuration permission required");
  const input = z
    .object({
      startsOn: dateSchema,
      endsOn: dateSchema,
      policyId: z.uuid(),
      deadline: z.iso.datetime().nullable(),
    })
    .strict()
    .parse(req.body);
  assertPeriod(new Date(input.startsOn), new Date(input.endsOn));
  const data = await transact(async (tx) => {
    if (
      !(await tx.workPolicy.findFirst({
        where: { id: input.policyId, organizationId: req.actor.organizationId },
      }))
    )
      throw new AppError(422, "Policy not found");
    const p = await tx.reportingPeriod.create({
      data: {
        ...input,
        startsOn: new Date(input.startsOn),
        endsOn: new Date(input.endsOn),
        deadline: input.deadline ? new Date(input.deadline) : null,
        organizationId: req.actor.organizationId,
      },
    });
    await audit(tx, req.actor, "PERIOD_CREATED", p.id, req.correlationId);
    return p;
  });
  res.status(201).json({ data });
});
api.post("/admin/roles", async (req, res) => {
  requirePermission(req.actor, "access.write");
  const input = z
    .object({
      userId: z.uuid(),
      roleId: z.uuid(),
      scope: z.enum(["SELF", "TEAM", "PROJECT", "ORGANIZATION"]),
      teamId: z.uuid().optional(),
      projectId: z.uuid().optional(),
    })
    .strict()
    .parse(req.body);
  const result = await transact(async (tx) => {
    if (
      !(await tx.user.findFirst({
        where: { id: input.userId, organizationId: req.actor.organizationId },
      }))
    )
      throw new AppError(422, "Employee not found");
    if (
      input.scope === "TEAM" &&
      (!input.teamId ||
        !(await tx.team.findFirst({
          where: { id: input.teamId, organizationId: req.actor.organizationId },
        })))
    )
      throw new AppError(422, "Team scope requires a company team");
    if (
      input.scope === "PROJECT" &&
      (!input.projectId ||
        !(await tx.project.findFirst({
          where: {
            id: input.projectId,
            organizationId: req.actor.organizationId,
          },
        })))
    )
      throw new AppError(422, "Project scope requires a company project");
    const role = await tx.role.findUnique({ where: { id: input.roleId } });
    if (!role) throw new AppError(422, "Role not found");
    const valid: Record<string, string[]> = {
      Employee: ["SELF"],
      Manager: ["TEAM"],
      ProjectManager: ["PROJECT"],
      HR: ["ORGANIZATION", "TEAM"],
      SystemAdmin: ["ORGANIZATION"],
      Auditor: ["ORGANIZATION", "TEAM"],
    };
    if (!valid[role.name]?.includes(input.scope))
      throw new AppError(422, "This role does not support the selected scope");
    const r = await tx.userRole.create({
      data: {
        ...input,
        teamId: input.scope === "TEAM" ? input.teamId : null,
        projectId: input.scope === "PROJECT" ? input.projectId : null,
      },
    });
    await audit(
      tx,
      req.actor,
      "ROLE_GRANTED",
      input.userId,
      req.correlationId,
      { role: role.name, scope: input.scope },
    );
    return r;
  });
  res.status(201).json({ data: result });
});
api.get("/admin/access-directory", async (req, res) => {
  requirePermission(req.actor, "access.write");
  const [employees, teams, projects] = await Promise.all([
    db.user.findMany({
      where: { organizationId: req.actor.organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        entraTenantId: true,
        entraObjectId: true,
        roles: { include: { role: true, team: true, project: true } },
      },
    }),
    db.team.findMany({
      where: { organizationId: req.actor.organizationId },
      select: { id: true, name: true },
    }),
    db.project.findMany({
      where: { organizationId: req.actor.organizationId },
      select: { id: true, name: true },
    }),
  ]);
  res.json({ data: { employees, teams, projects } });
});
api.patch("/admin/identities/:id", async (req, res) => {
  requirePermission(req.actor, "access.write");
  const input = z
    .object({ entraTenantId: z.uuid(), entraObjectId: z.uuid() })
    .strict()
    .parse(req.body);
  if (input.entraTenantId !== process.env.ENTRA_TENANT_ID && !devAuth)
    throw new AppError(
      422,
      "Identity must belong to the configured company tenant",
    );
  await transact(async (tx) => {
    const u = await tx.user.findFirst({
      where: {
        id: uuid(req.params.id),
        organizationId: req.actor.organizationId,
      },
    });
    if (!u) throw new AppError(404, "Employee not found");
    await tx.user.update({ where: { id: u.id }, data: input });
    await tx.session.deleteMany({ where: { userId: u.id } });
    await audit(tx, req.actor, "IDENTITY_MAPPED", u.id, req.correlationId);
  });
  res.json({ data: { ok: true } });
});
api.post("/organization/teams", async (req, res) => {
  requirePermission(req.actor, "organization.write");
  if (
    !grants(req.actor, "organization.write").some(
      (g) => g.scope === "ORGANIZATION",
    )
  )
    throw new AppError(403, "Organization scope required");
  const input = z
    .object({
      name: z.string().min(2).max(100),
      department: z.string().min(2).max(100),
    })
    .strict()
    .parse(req.body);
  const team = await transact(async (tx) => {
    const department = await tx.department.upsert({
      where: {
        organizationId_name: {
          organizationId: req.actor.organizationId,
          name: input.department,
        },
      },
      update: {},
      create: {
        organizationId: req.actor.organizationId,
        name: input.department,
      },
    });
    const t = await tx.team.create({
      data: {
        organizationId: req.actor.organizationId,
        departmentId: department.id,
        name: input.name,
      },
    });
    await audit(tx, req.actor, "TEAM_CREATED", t.id, req.correlationId);
    return t;
  });
  res.status(201).json({ data: team });
});
api.post("/organization/teams/:id/memberships", async (req, res) => {
  requirePermission(req.actor, "organization.write");
  if (
    !grants(req.actor, "organization.write").some(
      (g) => g.scope === "ORGANIZATION",
    )
  )
    throw new AppError(403, "Organization scope required");
  const input = z
    .object({
      userId: z.uuid(),
      startsOn: dateSchema,
      endsOn: dateSchema.nullable().optional(),
    })
    .strict()
    .parse(req.body);
  if (input.endsOn && input.endsOn < input.startsOn)
    throw new AppError(422, "Membership end precedes start");
  const data = await transact(async (tx) => {
    const team = await tx.team.findFirst({
        where: {
          id: uuid(req.params.id),
          organizationId: req.actor.organizationId,
        },
      }),
      user = await tx.user.findFirst({
        where: { id: input.userId, organizationId: req.actor.organizationId },
      });
    if (!team || !user)
      throw new AppError(
        422,
        "Team and employee must belong to this organization",
      );
    const membership = await tx.teamMembership.create({
      data: {
        teamId: team.id,
        userId: user.id,
        startsOn: new Date(input.startsOn),
        endsOn: input.endsOn ? new Date(input.endsOn) : null,
      },
    });
    await audit(
      tx,
      req.actor,
      "TEAM_MEMBERSHIP_CREATED",
      team.id,
      req.correlationId,
      { userId: user.id },
    );
    return membership;
  });
  res.status(201).json({ data });
});
api.post("/admin/identities", async (req, res) => {
  requirePermission(req.actor, "access.write");
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      email: z.email(),
      entraTenantId: z.uuid().optional(),
      entraObjectId: z.uuid().optional(),
    })
    .strict()
    .parse(req.body);
  if (!!input.entraTenantId !== !!input.entraObjectId)
    throw new AppError(422, "Supply both tenant ID and object ID");
  if (
    input.entraTenantId &&
    !devAuth &&
    input.entraTenantId !== process.env.ENTRA_TENANT_ID
  )
    throw new AppError(422, "Identity must belong to the company tenant");
  const data = await transact(async (tx) => {
    const role = await tx.role.findUniqueOrThrow({
      where: { name: "Employee" },
    });
    const user = await tx.user.create({
      data: {
        ...input,
        organizationId: req.actor.organizationId,
        roles: { create: { roleId: role.id, scope: "SELF" } },
      },
      select: { id: true, name: true, email: true },
    });
    await audit(
      tx,
      req.actor,
      "IDENTITY_PROVISIONED",
      user.id,
      req.correlationId,
    );
    return user;
  });
  res.status(201).json({ data });
});
api.delete("/admin/roles/:id", async (req, res) => {
  requirePermission(req.actor, "access.write");
  await transact(async (tx) => {
    const assignment = await tx.userRole.findFirst({
      where: {
        id: uuid(req.params.id),
        user: { organizationId: req.actor.organizationId },
      },
      include: { role: true },
    });
    if (!assignment) throw new AppError(404, "Role assignment not found");
    if (assignment.role.name === "SystemAdmin") {
      const remaining = await tx.userRole.count({
        where: {
          id: { not: assignment.id },
          roleId: assignment.roleId,
          user: { organizationId: req.actor.organizationId, active: true },
          scope: "ORGANIZATION",
        },
      });
      if (!remaining)
        throw new AppError(
          409,
          "The last active system administrator cannot be removed",
        );
    }
    await tx.userRole.delete({ where: { id: assignment.id } });
    await audit(
      tx,
      req.actor,
      "ROLE_REVOKED",
      assignment.userId,
      req.correlationId,
      { role: assignment.role.name, scope: assignment.scope },
    );
  });
  res.json({ data: { ok: true } });
});
app.use(express.static(resolve("dist")));
app.get("/{*path}", (req, res) => {
  if (req.path.startsWith("/api/") || req.path.startsWith("/auth/"))
    return res.status(404).json({ error: { message: "Not found" } });
  res.sendFile(resolve("dist/index.html"));
});
app.use(
  (
    error: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    let status = 500,
      message = "An unexpected error occurred";
    if (error instanceof AppError) {
      status = error.status;
      message = error.message;
    } else if (error instanceof z.ZodError) {
      status = 422;
      message = error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    ) {
      status = 409;
      message = "The record changed or already exists. Refresh and retry";
    } else if (error instanceof SyntaxError) {
      status = 400;
      message = "Invalid request JSON";
    }
    if (status === 500)
      console.error(
        JSON.stringify({
          event: "request_failed",
          correlationId: req.correlationId,
          errorType: error instanceof Error ? error.name : "Unknown",
        }),
      );
    res
      .status(status)
      .json({ error: { message, correlationId: req.correlationId } });
  },
);
