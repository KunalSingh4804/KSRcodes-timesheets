import { describe, it, beforeAll, afterAll, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { seed } from "../../prisma/seed.js";
const origin = "http://localhost:5173";
let employeeId: string,
  colleagueSheet: string,
  sheetId: string,
  csrfToken: string;
const employee = request.agent(app);
beforeAll(async () => {
  await seed();
  const users = await db.user.findMany();
  employeeId = users.find((u) => u.name === "Aarav Mehta")!.id;
  colleagueSheet = (
    await db.timesheet.findFirstOrThrow({
      where: { userId: users.find((u) => u.name === "Neha Kapoor")!.id },
    })
  ).id;
  sheetId = (
    await db.timesheet.findFirstOrThrow({ where: { userId: employeeId } })
  ).id;
  const response = await employee
    .post("/auth/development/login")
    .set("Origin", origin)
    .send({ userId: employeeId });
  csrfToken = decodeURIComponent(
    (response.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("mv_csrf="))!
      .split(";")[0]
      .slice(8),
  );
});
afterAll(() => db.$disconnect());
describe("HTTP authentication and authorization", () => {
  it("requires authentication", async () =>
    expect((await request(app).get("/api/v1/me")).status).toBe(401));
  it("rejects development sign-in from an unexpected origin", async () =>
    expect(
      (
        await request(app)
          .post("/auth/development/login")
          .set("Origin", "https://untrusted.example")
          .send({ userId: employeeId })
      ).status,
    ).toBe(403));
  it("maps the authenticated session to its active employee", async () => {
    const response = await employee.get("/api/v1/me");
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(employeeId);
  });
  it("prevents IDOR through timesheet IDs", async () =>
    expect(
      (await employee.get(`/api/v1/timesheets/${colleagueSheet}`)).status,
    ).toBe(404));
  it("requires CSRF on writes", async () =>
    expect(
      (
        await employee
          .put(`/api/v1/timesheets/${sheetId}/entries`)
          .set("Origin", origin)
          .send({ revision: 0, entries: [] })
      ).status,
    ).toBe(403));
  it("rejects a client-supplied employee identity", async () => {
    const response = await employee
      .put(`/api/v1/timesheets/${sheetId}/entries`)
      .set("Origin", origin)
      .set("X-CSRF-Token", csrfToken)
      .send({ revision: 0, entries: [{ userId: employeeId }] });
    expect(response.status).toBe(422);
  });
  it("denies unauthorized administration", async () =>
    expect((await employee.get("/api/v1/admin/configuration")).status).toBe(
      403,
    ));
  it("includes a correlation ID without leaking server traces", async () => {
    const response = await employee.get("/api/v1/timesheets/not-an-id");
    expect(response.status).toBe(422);
    expect(response.headers["x-correlation-id"]).toBeTruthy();
    expect(response.body.error.stack).toBeUndefined();
  });
  it("sets security headers", async () => {
    const response = await request(app).get("/health/live");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
  it("blocks deactivated users even with an existing session", async () => {
    await db.user.update({
      where: { id: employeeId },
      data: { active: false },
    });
    expect((await employee.get("/api/v1/me")).status).toBe(401);
    await db.user.update({ where: { id: employeeId }, data: { active: true } });
  });
});
describe("identity administration and pagination", () => {
  const admin = request.agent(app);
  let adminCsrf: string, newId: string;
  beforeAll(async () => {
    const u = await db.user.findFirstOrThrow({ where: { name: "Isha Rao" } });
    const response = await admin
      .post("/auth/development/login")
      .set("Origin", origin)
      .send({ userId: u.id });
    adminCsrf = (response.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("mv_csrf="))!
      .split(";")[0]
      .slice(8);
  });
  it("prevents employees reading the access administration directory", async () =>
    expect((await employee.get("/api/v1/admin/access-directory")).status).toBe(
      403,
    ));
  it("lets system administrators read identity metadata without employee work content", async () => {
    const response = await admin.get("/api/v1/admin/access-directory");
    expect(response.status).toBe(200);
    expect(
      response.body.data.employees.every((u: any) => !("timesheets" in u)),
    ).toBe(true);
  });
  it("provisions a separate identity with only the employee role", async () => {
    const response = await admin
      .post("/api/v1/admin/identities")
      .set("Origin", origin)
      .set("X-CSRF-Token", adminCsrf)
      .send({
        name: "New Employee",
        email: "new.employee@multiversetech.example",
      });
    expect(response.status).toBe(201);
    newId = response.body.data.id;
    const roles = await db.userRole.findMany({
      where: { userId: newId },
      include: { role: true },
    });
    expect(roles.map((r) => r.role.name)).toEqual(["Employee"]);
  });
  it("rejects mass-assignment of unvalidated privilege fields", async () =>
    expect(
      (
        await admin
          .post("/api/v1/admin/identities")
          .set("Origin", origin)
          .set("X-CSRF-Token", adminCsrf)
          .send({
            name: "Other Employee",
            email: "other@multiversetech.example",
            roles: ["SystemAdmin"],
          })
      ).status,
    ).toBe(422));
  it("does not permit a manager role with organization-wide scope", async () => {
    const role = await db.role.findUniqueOrThrow({
      where: { name: "Manager" },
    });
    expect(
      (
        await admin
          .post("/api/v1/admin/roles")
          .set("Origin", origin)
          .set("X-CSRF-Token", adminCsrf)
          .send({ userId: newId, roleId: role.id, scope: "ORGANIZATION" })
      ).status,
    ).toBe(422);
  });
  it("can deliberately grant and revoke HR authority with audit history", async () => {
    const role = await db.role.findUniqueOrThrow({ where: { name: "HR" } });
    const granted = await admin
      .post("/api/v1/admin/roles")
      .set("Origin", origin)
      .set("X-CSRF-Token", adminCsrf)
      .send({ userId: newId, roleId: role.id, scope: "ORGANIZATION" });
    expect(granted.status).toBe(201);
    expect(
      (
        await admin
          .delete(`/api/v1/admin/roles/${granted.body.data.id}`)
          .set("Origin", origin)
          .set("X-CSRF-Token", adminCsrf)
      ).status,
    ).toBe(200);
    expect(
      await db.auditEvent.count({
        where: {
          targetId: newId,
          action: { in: ["ROLE_GRANTED", "ROLE_REVOKED"] },
        },
      }),
    ).toBe(2);
  });
  it("protects the last active system administrator", async () => {
    const grant = await db.userRole.findFirstOrThrow({
      where: { role: { name: "SystemAdmin" } },
    });
    expect(
      (
        await admin
          .delete(`/api/v1/admin/roles/${grant.id}`)
          .set("Origin", origin)
          .set("X-CSRF-Token", adminCsrf)
      ).status,
    ).toBe(409);
  });
  it("paginates the employee directory with bounded page sizes", async () => {
    const hrUser = await db.user.findFirstOrThrow({
      where: { name: "Rohan Verma" },
    });
    const hrAgent = request.agent(app);
    await hrAgent
      .post("/auth/development/login")
      .set("Origin", origin)
      .send({ userId: hrUser.id });
    const first = await hrAgent.get("/api/v1/employees?page=1&limit=2");
    const next = await hrAgent.get("/api/v1/employees?page=2&limit=2");
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.total).toBeGreaterThan(2);
    expect(first.body.data[0].id).not.toBe(next.body.data[0].id);
  });
});
