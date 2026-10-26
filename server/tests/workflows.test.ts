import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/db.js";
import { seed } from "../../prisma/seed.js";
import { actorInclude, type Actor, grants } from "../src/access.js";
import {
  readSheet,
  saveEntries,
  submit,
  reopen,
  decide,
  requestAmendment,
  reviewTask,
} from "../src/timesheets.js";
import { monthlyReport } from "../src/reports.js";
let employee: Actor,
  manager: Actor,
  hr: Actor,
  colleague: Actor,
  admin: Actor,
  sheetId: string,
  projectId: string,
  workDate: string;
const cid = "test-correlation";
const key = () => crypto.randomUUID();
const revision = async () =>
  (await db.timesheet.findUniqueOrThrow({ where: { id: sheetId } })).revision;
const entry = () => ({
  projectId,
  workDate,
  description: "Implement tested feature",
  minutes: 90,
  category: "Development",
  billable: true,
});
const task = async (approverId: string) =>
  db.approvalTask.findFirstOrThrow({
    where: {
      approverId,
      status: "PENDING",
      instance: { timesheetId: sheetId, status: "ACTIVE" },
    },
    orderBy: { createdAt: "asc" },
  });
beforeAll(async () => {
  await seed();
  const all = await db.user.findMany({ include: actorInclude });
  employee = all.find((u) => u.name === "Aarav Mehta")!;
  manager = all.find((u) => u.name === "Priya Sharma")!;
  hr = all.find((u) => u.name === "Rohan Verma")!;
  colleague = all.find((u) => u.name === "Neha Kapoor")!;
  admin = all.find((u) => u.name === "Isha Rao")!;
  const sheet = await db.timesheet.findFirstOrThrow({
    where: { userId: employee.id },
    include: { period: true, entries: true },
  });
  sheetId = sheet.id;
  projectId = sheet.entries[0].projectId;
  workDate = sheet.period.startsOn.toISOString().slice(0, 10);
});
afterAll(() => db.$disconnect());
describe("persistent timesheet and approval workflows", () => {
  it("migrations create all requested tables", async () =>
    expect(
      (
        await db.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) FROM information_schema.tables WHERE table_schema='public'`
      )[0].count,
    ).toBeGreaterThanOrEqual(30n));
  it("prevents duplicate employee/period timesheets", async () => {
    const s = await db.timesheet.findUniqueOrThrow({ where: { id: sheetId } });
    await expect(
      db.timesheet.create({ data: { userId: s.userId, periodId: s.periodId } }),
    ).rejects.toThrow();
  });
  it("denies cross-employee access", async () =>
    expect(readSheet(colleague, sheetId)).rejects.toMatchObject({
      status: 404,
    }));
  it("allows a scoped team manager to read", async () =>
    expect((await readSheet(manager, sheetId)).id).toBe(sheetId));
  it("does not give system administrators employee-content access", async () =>
    expect(readSheet(admin, sheetId)).rejects.toMatchObject({ status: 404 }));
  it("rejects unassigned projects", async () => {
    const p = await db.project.create({
      data: {
        organizationId: employee.organizationId,
        name: "Restricted project",
        code: "RESTRICTED",
      },
    });
    await expect(
      saveEntries(
        employee,
        sheetId,
        await revision(),
        [{ ...entry(), projectId: p.id }],
        cid,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("rejects out-of-period dates", async () =>
    expect(
      saveEntries(
        employee,
        sheetId,
        await revision(),
        [{ ...entry(), workDate: "2020-01-01" }],
        cid,
      ),
    ).rejects.toMatchObject({ status: 422 }));
  it("prevents manager editing an employee draft", async () =>
    expect(
      saveEntries(manager, sheetId, await revision(), [entry()], cid),
    ).rejects.toMatchObject({ status: 403 }));
  it("saves multiple daily entries with accurate integer totals", async () => {
    const before = await revision();
    const s = await saveEntries(
      employee,
      sheetId,
      before,
      [entry(), { ...entry(), minutes: 30, billable: false }],
      cid,
    );
    expect(s.revision).toBe(before + 1);
    expect(s.entries.reduce((n, e) => n + e.minutes, 0)).toBe(120);
  });
  it("rejects a stale revision", async () =>
    expect(
      saveEntries(employee, sheetId, 0, [entry()], cid),
    ).rejects.toMatchObject({ status: 409 }));
  it("atomically snapshots submission and starts workflow", async () => {
    await submit(
      employee,
      sheetId,
      await revision(),
      "first-submission-key",
      cid,
    );
    const s = await readSheet(employee, sheetId);
    expect(s.status).toBe("IN_APPROVAL");
    expect(s.versions[0].kind).toBe("SUBMITTED");
    expect(s.approvals[0].tasks.length).toBe(2);
  });
  it("safely replays an identical idempotent submission", async () => {
    const result = await submit(
      employee,
      sheetId,
      1,
      "first-submission-key",
      cid,
    );
    expect(result).toMatchObject({ status: "IN_APPROVAL" });
    expect(
      await db.approvalInstance.count({ where: { timesheetId: sheetId } }),
    ).toBe(1);
  });
  it("rejects idempotency key reuse with changed input", async () =>
    expect(
      submit(employee, sheetId, 88, "first-submission-key", cid),
    ).rejects.toMatchObject({ status: 409 }));
  it("locks ordinary editing after submission", async () =>
    expect(
      saveEntries(employee, sheetId, await revision(), [entry()], cid),
    ).rejects.toMatchObject({ status: 409 }));
  it("rejects an out-of-order HR decision", async () =>
    expect(
      decide(
        hr,
        (await task(hr.id)).id,
        "APPROVED",
        undefined,
        await revision(),
        key(),
        cid,
      ),
    ).rejects.toMatchObject({ status: 409 }));
  it("denies deciding another approver task", async () =>
    expect(
      decide(
        employee,
        (await task(manager.id)).id,
        "APPROVED",
        undefined,
        await revision(),
        key(),
        cid,
      ),
    ).rejects.toMatchObject({ status: 404 }));
  it("requires a rejection or return reason", async () =>
    expect(
      decide(
        manager,
        (await task(manager.id)).id,
        "RETURNED",
        "",
        await revision(),
        key(),
        cid,
      ),
    ).rejects.toMatchObject({ status: 422 }));
  it("returns a submission and cancels later tasks", async () => {
    await decide(
      manager,
      (await task(manager.id)).id,
      "RETURNED",
      "Please clarify the task description",
      await revision(),
      key(),
      cid,
    );
    expect((await readSheet(employee, sheetId)).status).toBe("RETURNED");
    expect(
      await db.approvalTask.count({
        where: { instance: { timesheetId: sheetId }, status: "PENDING" },
      }),
    ).toBe(0);
  });
  it("reopens and resubmits while preserving the first snapshot", async () => {
    await reopen(employee, sheetId, await revision(), cid);
    await saveEntries(
      employee,
      sheetId,
      await revision(),
      [
        {
          ...entry(),
          description: "Clarified feature implementation",
          minutes: 150,
        },
      ],
      cid,
    );
    await submit(employee, sheetId, await revision(), key(), cid);
    const s = await readSheet(employee, sheetId);
    expect(s.versions.length).toBe(2);
    expect(
      (s.versions.find((v) => v.number === 1)!.entries as any[])[0].minutes,
    ).toBe(90);
  });
  it("advances manager approval to HR", async () => {
    await decide(
      manager,
      (await task(manager.id)).id,
      "APPROVED",
      "Reviewed",
      await revision(),
      key(),
      cid,
    );
    const s = await readSheet(employee, sheetId);
    expect(s.status).toBe("IN_APPROVAL");
    expect(s.approvals.find((i) => i.status === "ACTIVE")?.stagePosition).toBe(
      2,
    );
  });
  it("preserves in-flight workflow version when another is activated", async () => {
    const old = await db.approvalWorkflowDefinition.findFirstOrThrow({
      where: { active: true },
    });
    await db.approvalWorkflowDefinition.update({
      where: { id: old.id },
      data: { active: false },
    });
    await db.approvalWorkflowDefinition.create({
      data: {
        organizationId: old.organizationId,
        name: old.name,
        version: 2,
        active: true,
        stages: {
          create: [
            {
              position: 1,
              name: "Manager only",
              resolver: "REPORTING_MANAGER",
              config: { decisionRule: "ALL" },
            },
          ],
        },
      },
    });
    const s = await readSheet(employee, sheetId);
    expect(
      s.approvals.find((i) => i.status === "ACTIVE")?.workflow.version,
    ).toBe(1);
  });
  it("records final approval and preserves approved snapshot", async () => {
    await decide(
      hr,
      (await task(hr.id)).id,
      "APPROVED",
      undefined,
      await revision(),
      key(),
      cid,
    );
    const s = await readSheet(employee, sheetId);
    expect(s.status).toBe("APPROVED");
    expect(s.versions[0].kind).toBe("APPROVED");
    expect(s.versions.length).toBe(3);
  });
  it("cannot silently edit approved records", async () =>
    expect(
      saveEntries(employee, sheetId, await revision(), [entry()], cid),
    ).rejects.toMatchObject({ status: 409 }));
  it("creates a separately reviewed amendment", async () => {
    const s = await readSheet(employee, sheetId);
    await requestAmendment(
      employee,
      sheetId,
      s.revision,
      "Correct omitted delivery work",
      [{ ...entry(), minutes: 210 }],
      cid,
    );
    const unchanged = await readSheet(employee, sheetId);
    expect(unchanged.entries[0].minutes).toBe(150);
    expect(unchanged.currentVersion).toBe(s.currentVersion);
  });
  it("rejects conflicting open amendments", async () =>
    expect(
      requestAmendment(
        employee,
        sheetId,
        await revision(),
        "Another correction",
        [entry()],
        cid,
      ),
    ).rejects.toMatchObject({ status: 409 }));
  it("applies approved amendment and keeps prior approved version", async () => {
    await decide(
      manager,
      (await task(manager.id)).id,
      "APPROVED",
      undefined,
      await revision(),
      key(),
      cid,
    );
    const s = await readSheet(employee, sheetId);
    expect(s.status).toBe("APPROVED");
    expect(s.entries[0].minutes).toBe(210);
    expect(s.versions.length).toBe(4);
    expect(
      (s.versions.find((v) => v.kind === "APPROVED")!.entries as any[])[0]
        .minutes,
    ).toBe(150);
  });
  it("reports submitted and approved minutes from their separate snapshots", async () => {
    const s = await readSheet(employee, sheetId);
    const report = await monthlyReport(employee, s.periodId);
    expect(report.totals.recorded).toBe(210);
    expect(report.totals.submitted).toBe(150);
    expect(report.totals.approved).toBe(210);
  });
  it("prevents modifying audit history in the database", async () => {
    const event = await db.auditEvent.findFirstOrThrow();
    await expect(
      db.auditEvent.update({
        where: { id: event.id },
        data: { action: "TAMPER" },
      }),
    ).rejects.toThrow();
  });
  it("prevents modifying submitted snapshots in the database", async () => {
    const version = await db.timesheetVersion.findFirstOrThrow();
    await expect(
      db.timesheetVersion.update({
        where: { id: version.id },
        data: { kind: "TAMPER" },
      }),
    ).rejects.toThrow();
  });
  it("preserves identifiable historical actors", async () => {
    const history = await db.approvalDecision.findMany({
      include: { actor: true },
    });
    expect(history.length).toBeGreaterThan(3);
    expect(history.every((d) => !!d.actor.name)).toBe(true);
  });
  it("does not automatically grant system administrators approval rights", () =>
    expect(grants(admin, "approval.decide")).toHaveLength(0));
});
describe("scope and failure regressions", () => {
  it("blocks self-approval during approver resolution and rolls back submission", async () => {
    const s = await db.timesheet.findFirstOrThrow({
      where: { userId: colleague.id },
    });
    await db.user.update({
      where: { id: colleague.id },
      data: { managerId: colleague.id },
    });
    await expect(
      submit(colleague, s.id, s.revision, key(), cid),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      (await db.timesheet.findUniqueOrThrow({ where: { id: s.id } })).status,
    ).toBe("DRAFT");
    await db.user.update({
      where: { id: colleague.id },
      data: { managerId: manager.id },
    });
  });
  it("denies a manager outside the employee team", async () => {
    const department = await db.department.findFirstOrThrow();
    const team = await db.team.create({
      data: {
        organizationId: employee.organizationId,
        departmentId: department.id,
        name: "Separate team",
      },
    });
    const role = await db.role.findUniqueOrThrow({
      where: { name: "Manager" },
    });
    const outsider = await db.user.create({
      data: {
        organizationId: employee.organizationId,
        email: "outside@multiversetech.example",
        name: "Outside Manager",
        roles: { create: { roleId: role.id, scope: "TEAM", teamId: team.id } },
      },
      include: actorInclude,
    });
    await expect(readSheet(outsider, sheetId)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("limits project managers to their assigned project in approval review and reports", async () => {
    const s = await db.timesheet.findFirstOrThrow({
      where: { userId: colleague.id },
    });
    const projectRole = await db.role.findUniqueOrThrow({
      where: { name: "ProjectManager" },
    });
    const pm = await db.user.create({
      data: {
        organizationId: employee.organizationId,
        email: "project.manager@multiversetech.example",
        name: "Project Reviewer",
        roles: {
          create: { roleId: projectRole.id, scope: "PROJECT", projectId },
        },
      },
      include: actorInclude,
    });
    await db.project.update({
      where: { id: projectId },
      data: { managerId: pm.id },
    });
    await db.approvalWorkflowDefinition.updateMany({
      where: { active: true },
      data: { active: false },
    });
    await db.approvalWorkflowDefinition.create({
      data: {
        organizationId: employee.organizationId,
        name: "Project review",
        version: 1,
        active: true,
        stages: {
          create: {
            position: 1,
            name: "Project review",
            resolver: "PROJECT_MANAGER",
            config: { decisionRule: "ALL" },
          },
        },
      },
    });
    await submit(colleague, s.id, s.revision, key(), cid);
    const t = await db.approvalTask.findFirstOrThrow({
      where: { approverId: pm.id, status: "PENDING" },
    });
    const reviewed = await reviewTask(pm, t.id);
    expect(reviewed.entries.length).toBeGreaterThan(0);
    expect(reviewed.entries.every((e) => e.projectId === projectId)).toBe(true);
    await expect(readSheet(pm, s.id)).rejects.toMatchObject({ status: 404 });
    const report = await monthlyReport(pm, s.periodId);
    expect(report.projectScoped).toBe(true);
    expect(report.projects.every((p) => p.id === projectId)).toBe(true);
  });
  it("keeps approved version intact after amendment rejection", async () => {
    await db.approvalWorkflowDefinition.updateMany({
      where: { active: true },
      data: { active: false },
    });
    const old = await db.approvalWorkflowDefinition.findFirstOrThrow({
      where: { version: 2 },
    });
    await db.approvalWorkflowDefinition.update({
      where: { id: old.id },
      data: { active: true },
    });
    const before = await readSheet(employee, sheetId);
    await requestAmendment(
      employee,
      sheetId,
      before.revision,
      "Proposed correction for review",
      [{ ...entry(), minutes: 300 }],
      cid,
    );
    await decide(
      manager,
      (await task(manager.id)).id,
      "REJECTED",
      "Correction is not supported by the work record",
      await revision(),
      key(),
      cid,
    );
    const after = await readSheet(employee, sheetId);
    expect(after.currentVersion).toBe(before.currentVersion);
    expect(after.entries[0].minutes).toBe(before.entries[0].minutes);
    expect(after.amendments.some((a) => a.status === "REJECTED")).toBe(true);
  });
});
