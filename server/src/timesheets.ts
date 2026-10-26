import { Prisma, type Timesheet } from "@prisma/client";
import { createHash } from "node:crypto";
import { db } from "./db.js";
import { actorInclude, employeeScope, grants, type Actor } from "./access.js";
import {
  AppError,
  dateOnly,
  entriesSchema,
  policySchema,
  validateEntries,
  type EntryInput,
} from "./domain.js";
type Tx = Prisma.TransactionClient;
const detailInclude = {
  entries: {
    include: { project: true },
    orderBy: { workDate: "asc" as const },
  },
  period: { include: { policy: { include: { calendar: true } } } },
  user: { select: { id: true, name: true, email: true } },
  versions: { orderBy: { number: "desc" as const } },
  approvals: {
    include: {
      workflow: true,
      tasks: {
        include: {
          stage: true,
          approver: { select: { name: true } },
          decision: true,
        },
      },
    },
  },
  amendments: true,
} satisfies Prisma.TimesheetInclude;
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
export function audit(
  tx: Tx,
  a: Actor,
  action: string,
  targetId: string,
  correlationId: string,
  summary: unknown = {},
) {
  return tx.auditEvent.create({
    data: {
      actorId: a.id,
      action,
      targetType: "Timesheet",
      targetId,
      correlationId,
      summary: json(summary),
    },
  });
}
export async function transact<T>(fn: (tx: Tx) => Promise<T>) {
  return db.$transaction(fn, {
    isolationLevel: "Serializable",
    timeout: 20000,
  });
}
async function visible(tx: Tx, a: Actor, id: string) {
  const sheet = await tx.timesheet.findFirst({
    where: { id, user: employeeScope(a) },
    include: detailInclude,
  });
  if (!sheet) throw new AppError(404, "Timesheet not found");
  return sheet;
}
export async function readSheet(a: Actor, id: string) {
  return visible(db, a, id);
}
export async function revision(tx: Tx, s: Timesheet, expected: number) {
  if (expected !== s.revision)
    throw new AppError(409, "This timesheet changed. Refresh and try again");
  const changed = await tx.timesheet.updateMany({
    where: { id: s.id, revision: expected },
    data: { revision: { increment: 1 } },
  });
  if (changed.count !== 1)
    throw new AppError(409, "Concurrent update detected");
}
async function assignedEntries(
  tx: Tx,
  a: Actor,
  userId: string,
  period: { startsOn: Date; endsOn: Date; policy: { config: unknown } },
  entries: EntryInput[],
) {
  const policy = policySchema.parse(period.policy.config);
  validateEntries(
    entries,
    period.startsOn,
    period.endsOn,
    policy,
    a.organization.timezone,
  );
  const assignments = await tx.projectAssignment.findMany({
    where: {
      userId,
      project: { organizationId: a.organizationId, active: true },
    },
  });
  for (const entry of entries) {
    if (
      !assignments.some(
        (x) =>
          x.projectId === entry.projectId &&
          dateOnly(x.startsOn) <= entry.workDate &&
          (!x.endsOn || dateOnly(x.endsOn) >= entry.workDate),
      )
    )
      throw new AppError(
        422,
        "A project is not assigned on the selected work date",
      );
  }
}
const storedEntries = (entries: EntryInput[]) =>
  entries.map((e) => ({ ...e, workDate: new Date(e.workDate + "T00:00:00Z") }));
export async function saveEntries(
  a: Actor,
  id: string,
  expected: number,
  raw: unknown,
  cid: string,
) {
  const entries = entriesSchema.parse(raw);
  return transact(async (tx) => {
    const s = await visible(tx, a, id);
    if (s.userId !== a.id)
      throw new AppError(403, "Only the owner can edit this draft");
    if (s.status !== "DRAFT")
      throw new AppError(409, "Only draft timesheets can be edited");
    await assignedEntries(tx, a, s.userId, s.period, entries);
    await revision(tx, s, expected);
    await tx.workEntry.deleteMany({ where: { timesheetId: id } });
    await tx.workEntry.createMany({
      data: storedEntries(entries).map((e) => ({ ...e, timesheetId: id })),
    });
    await audit(tx, a, "ENTRIES_SAVED", id, cid, {
      count: entries.length,
      minutes: entries.reduce((n, e) => n + e.minutes, 0),
    });
    return tx.timesheet.findUniqueOrThrow({
      where: { id },
      include: detailInclude,
    });
  });
}
function normalize(entries: unknown): EntryInput[] {
  return entriesSchema.parse(
    (entries as Array<Record<string, unknown>>).map((e) => ({
      projectId: e.projectId,
      workDate:
        typeof e.workDate === "string"
          ? e.workDate.slice(0, 10)
          : dateOnly(e.workDate as Date),
      description: e.description,
      minutes: e.minutes,
      category: e.category,
      billable: e.billable,
      taskId: e.taskId ?? undefined,
      remarks: e.remarks ?? undefined,
    })),
  );
}
export async function allowedTaskActor(
  tx: Tx,
  a: Actor,
  employeeId: string,
  scopeKey: string,
) {
  if (employeeId === a.id) return false;
  const rules = grants(a, "approval.decide");
  if (rules.some((g) => g.scope === "ORGANIZATION")) return true;
  if (
    scopeKey !== "ALL" &&
    rules.some((g) => g.scope === "PROJECT" && g.projectId === scopeKey)
  )
    return true;
  const teams = rules
    .filter((g) => g.scope === "TEAM" && g.teamId)
    .map((g) => g.teamId!);
  return !!(await tx.teamMembership.findFirst({
    where: {
      userId: employeeId,
      teamId: { in: teams },
      startsOn: { lte: new Date() },
      OR: [{ endsOn: null }, { endsOn: { gte: new Date() } }],
    },
  }));
}
async function startApproval(
  tx: Tx,
  a: Actor,
  s: Timesheet,
  versionId: string,
  entries: EntryInput[],
  amendmentId?: string,
) {
  const workflows = await tx.approvalWorkflowDefinition.findMany({
    where: { organizationId: a.organizationId, active: true },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  if (workflows.length !== 1 || !workflows[0].stages.length)
    throw new AppError(
      422,
      "Exactly one active approval workflow with stages is required",
    );
  const w = workflows[0];
  if (w.stages.some((stage, i) => stage.position !== i + 1))
    throw new AppError(422, "Workflow stages must be consecutive");
  const employee = await tx.user.findUniqueOrThrow({ where: { id: s.userId } });
  const tasks: Array<{
    stageId: string;
    approverId: string;
    scopeKey: string;
  }> = [];
  for (const stage of w.stages) {
    const candidates: Array<{ id: string; scopeKey: string }> = [];
    if (stage.resolver === "REPORTING_MANAGER") {
      if (employee.managerId)
        candidates.push({ id: employee.managerId, scopeKey: "ALL" });
    } else if (stage.resolver === "PROJECT_MANAGER") {
      for (const projectId of [...new Set(entries.map((e) => e.projectId))]) {
        const p = await tx.project.findFirst({
          where: {
            id: projectId,
            organizationId: a.organizationId,
            active: true,
          },
        });
        if (!p?.managerId)
          throw new AppError(422, "A project has no active approval manager");
        candidates.push({ id: p.managerId, scopeKey: projectId });
      }
    } else if (stage.resolver === "HR_GROUP") {
      const users = await tx.user.findMany({
        where: {
          organizationId: a.organizationId,
          active: true,
          roles: { some: { role: { name: "HR" }, scope: "ORGANIZATION" } },
        },
      });
      candidates.push(...users.map((u) => ({ id: u.id, scopeKey: "ALL" })));
    } else throw new AppError(422, "Unsupported approver resolver");
    if (!candidates.length)
      throw new AppError(422, `No approver resolved for ${stage.name}`);
    for (const c of candidates) {
      const approver = await tx.user.findFirst({
        where: { id: c.id, organizationId: a.organizationId, active: true },
        include: actorInclude,
      });
      if (
        !approver ||
        !(await allowedTaskActor(tx, approver, s.userId, c.scopeKey))
      )
        throw new AppError(
          422,
          `Approver for ${stage.name} is inactive, unpermitted or would self-approve`,
        );
      tasks.push({ ...c, approverId: c.id, stageId: stage.id });
    }
  }
  const instance = await tx.approvalInstance.create({
    data: {
      timesheetId: s.id,
      versionId,
      workflowId: w.id,
      amendmentId,
      stagePosition: 1,
    },
  });
  for (const task of tasks) {
    await tx.approvalTask.create({
      data: {
        instanceId: instance.id,
        stageId: task.stageId,
        approverId: task.approverId,
        scopeKey: task.scopeKey,
      },
    });
  }
  const first = tasks.filter((t) => t.stageId === w.stages[0].id);
  await tx.notification.createMany({
    data: first.map((t) => ({
      userId: t.approverId,
      message: `A ${amendmentId ? "timesheet amendment" : "monthly timesheet"} is ready for your review.`,
      targetId: s.id,
    })),
  });
  return instance;
}
export async function idempotent(
  tx: Tx,
  a: Actor,
  key: string,
  fingerprint: string,
  fn: () => Promise<unknown>,
) {
  const digest = createHash("sha256").update(fingerprint).digest("hex");
  const old = await tx.idempotencyRecord.findUnique({
    where: { userId_key: { userId: a.id, key } },
  });
  if (old) {
    if (old.fingerprint !== digest)
      throw new AppError(
        409,
        "Idempotency key was already used for another request",
      );
    return old.response;
  }
  const result = await fn();
  await tx.idempotencyRecord.create({
    data: { userId: a.id, key, fingerprint: digest, response: json(result) },
  });
  return result;
}
export async function submit(
  a: Actor,
  id: string,
  expected: number,
  key: string,
  cid: string,
) {
  return transact((tx) =>
    idempotent(
      tx,
      a,
      key,
      JSON.stringify({ action: "submit", id, expected }),
      async () => {
        const s = await visible(tx, a, id);
        if (s.userId !== a.id)
          throw new AppError(403, "Only the owner can submit");
        if (s.status !== "DRAFT")
          throw new AppError(409, "This timesheet is not a draft");
        const entries = normalize(s.entries);
        if (!entries.length)
          throw new AppError(
            422,
            "Add at least one work entry before submitting",
          );
        await assignedEntries(tx, a, s.userId, s.period, entries);
        const policy = policySchema.parse(s.period.policy.config);
        if (
          s.period.deadline &&
          s.period.deadline < new Date() &&
          !policy.allowLate
        )
          throw new AppError(422, "The submission deadline has passed");
        await revision(tx, s, expected);
        const version = await tx.timesheetVersion.create({
          data: {
            timesheetId: id,
            number: s.currentVersion + 1,
            kind: "SUBMITTED",
            entries: json(entries),
            policySnapshot: json({
              config: policy,
              holidays: s.period.policy.calendar.holidays,
              timezone: a.organization.timezone,
            }),
          },
        });
        await audit(tx, a, "SUBMITTED", id, cid, { version: version.number });
        await startApproval(tx, a, s, version.id, entries);
        await tx.timesheet.update({
          where: { id },
          data: { status: "IN_APPROVAL", currentVersion: version.number },
        });
        await audit(tx, a, "IN_APPROVAL", id, cid, { version: version.number });
        return { id, status: "IN_APPROVAL", revision: expected + 1 };
      },
    ),
  );
}
export async function reopen(
  a: Actor,
  id: string,
  expected: number,
  cid: string,
) {
  return transact(async (tx) => {
    const s = await visible(tx, a, id);
    if (s.userId !== a.id) throw new AppError(403, "Only the owner can reopen");
    if (!["RETURNED", "REJECTED"].includes(s.status))
      throw new AppError(
        409,
        "Only returned or rejected timesheets can be reopened",
      );
    await revision(tx, s, expected);
    await tx.timesheet.update({ where: { id }, data: { status: "DRAFT" } });
    await audit(tx, a, "REOPENED", id, cid);
    return { id, status: "DRAFT" };
  });
}
export async function requestAmendment(
  a: Actor,
  id: string,
  expected: number,
  reason: string,
  raw: unknown,
  cid: string,
) {
  const entries = entriesSchema.min(1).parse(raw);
  return transact(async (tx) => {
    const s = await visible(tx, a, id);
    if (s.userId !== a.id)
      throw new AppError(403, "Only the owner can request an amendment");
    if (s.status !== "APPROVED" || s.revision !== expected)
      throw new AppError(
        409,
        "The approved timesheet changed. Refresh before requesting a correction",
      );
    if (
      await tx.amendmentRequest.count({
        where: { timesheetId: id, status: "IN_REVIEW" },
      })
    )
      throw new AppError(409, "An amendment is already in review");
    await assignedEntries(tx, a, s.userId, s.period, entries);
    const base = await tx.timesheetVersion.findUniqueOrThrow({
      where: {
        timesheetId_number: { timesheetId: id, number: s.currentVersion },
      },
    });
    const amendment = await tx.amendmentRequest.create({
      data: {
        timesheetId: id,
        baseVersionId: base.id,
        baseRevision: expected,
        requesterId: a.id,
        reason,
        proposedEntries: json(entries),
      },
    });
    await startApproval(tx, a, s, base.id, entries, amendment.id);
    await audit(tx, a, "AMENDMENT_REQUESTED", id, cid, {
      amendmentId: amendment.id,
      reason,
      baseVersion: base.number,
    });
    return amendment;
  });
}
export async function decide(
  a: Actor,
  taskId: string,
  action: "APPROVED" | "REJECTED" | "RETURNED",
  reason: string | undefined,
  expected: number,
  key: string,
  cid: string,
) {
  if (action !== "APPROVED" && !reason?.trim())
    throw new AppError(422, "A reason is required");
  return transact((tx) =>
    idempotent(
      tx,
      a,
      key,
      JSON.stringify({ taskId, action, reason, expected }),
      async () => {
        const task = await tx.approvalTask.findFirst({
          where: {
            id: taskId,
            approverId: a.id,
            instance: {
              timesheet: { user: { organizationId: a.organizationId } },
            },
          },
          include: {
            stage: true,
            instance: {
              include: {
                timesheet: true,
                version: true,
                amendment: true,
                workflow: { include: { stages: true } },
              },
            },
          },
        });
        if (!task) throw new AppError(404, "Approval task not found");
        const i = task.instance,
          s = i.timesheet;
        if (!(await allowedTaskActor(tx, a, s.userId, task.scopeKey)))
          throw new AppError(403, "Approval authority is no longer valid");
        if (
          task.status !== "PENDING" ||
          i.status !== "ACTIVE" ||
          task.stage.position !== i.stagePosition
        )
          throw new AppError(
            409,
            "This task is no longer awaiting your decision",
          );
        if (i.amendmentId && action === "RETURNED")
          throw new AppError(422, "Amendments can be approved or rejected");
        if (
          (!i.amendmentId && s.status !== "IN_APPROVAL") ||
          (i.amendmentId && s.status !== "APPROVED")
        )
          throw new AppError(409, "Timesheet state changed");
        await revision(tx, s, expected);
        await tx.approvalTask.update({
          where: { id: taskId },
          data: { status: action },
        });
        await tx.approvalDecision.create({
          data: { taskId, actorId: a.id, action, reason },
        });
        await audit(tx, a, `DECISION_${action}`, s.id, cid, {
          taskId,
          amendmentId: i.amendmentId,
          reason,
        });
        if (action !== "APPROVED") {
          await tx.approvalTask.updateMany({
            where: { instanceId: i.id, status: "PENDING" },
            data: { status: "CANCELLED" },
          });
          await tx.approvalInstance.update({
            where: { id: i.id },
            data: { status: action },
          });
          if (i.amendmentId)
            await tx.amendmentRequest.update({
              where: { id: i.amendmentId },
              data: { status: "REJECTED" },
            });
          else
            await tx.timesheet.update({
              where: { id: s.id },
              data: { status: action },
            });
        } else {
          const outstanding = await tx.approvalTask.count({
            where: {
              instanceId: i.id,
              stageId: task.stageId,
              status: "PENDING",
            },
          });
          if (!outstanding) {
            const next = i.workflow.stages.find(
              (x) => x.position === i.stagePosition + 1,
            );
            if (next) {
              await tx.approvalInstance.update({
                where: { id: i.id },
                data: { stagePosition: next.position },
              });
              const tasks = await tx.approvalTask.findMany({
                where: { instanceId: i.id, stageId: next.id },
              });
              await tx.notification.createMany({
                data: tasks.map((t) => ({
                  userId: t.approverId,
                  message: "A timesheet is ready for your review.",
                  targetId: s.id,
                })),
              });
            } else {
              await tx.approvalInstance.update({
                where: { id: i.id },
                data: { status: "APPROVED" },
              });
              if (i.amendment) {
                const base = await tx.timesheetVersion.findUniqueOrThrow({
                  where: { id: i.amendment.baseVersionId },
                });
                if (s.currentVersion !== base.number)
                  throw new AppError(
                    409,
                    "The original approved version changed",
                  );
                const corrected = normalize(i.amendment.proposedEntries);
                const version = await tx.timesheetVersion.create({
                  data: {
                    timesheetId: s.id,
                    number: s.currentVersion + 1,
                    kind: "AMENDMENT_APPROVED",
                    entries: json(corrected),
                    policySnapshot: json(i.version.policySnapshot),
                  },
                });
                await tx.workEntry.deleteMany({ where: { timesheetId: s.id } });
                await tx.workEntry.createMany({
                  data: storedEntries(corrected).map((e) => ({
                    ...e,
                    timesheetId: s.id,
                  })),
                });
                await tx.timesheet.update({
                  where: { id: s.id },
                  data: { currentVersion: version.number },
                });
                await tx.amendmentRequest.update({
                  where: { id: i.amendment.id },
                  data: { status: "APPROVED" },
                });
                await audit(tx, a, "AMENDMENT_APPLIED", s.id, cid, {
                  amendmentId: i.amendment.id,
                  oldVersion: base.number,
                  newVersion: version.number,
                });
              } else {
                const approved = await tx.timesheetVersion.create({
                  data: {
                    timesheetId: s.id,
                    number: s.currentVersion + 1,
                    kind: "APPROVED",
                    entries: json(i.version.entries),
                    policySnapshot: json(i.version.policySnapshot),
                  },
                });
                await tx.timesheet.update({
                  where: { id: s.id },
                  data: { status: "APPROVED", currentVersion: approved.number },
                });
                await audit(tx, a, "APPROVED", s.id, cid, {
                  version: approved.number,
                });
              }
            }
          }
        }
        await tx.notification.create({
          data: {
            userId: s.userId,
            message: `An approval decision was recorded: ${action.toLowerCase()}.`,
            targetId: s.id,
          },
        });
        return { id: s.id, action, revision: expected + 1 };
      },
    ),
  );
}
export async function reviewTask(a: Actor, id: string) {
  const task = await db.approvalTask.findFirst({
    where: {
      id,
      approverId: a.id,
      instance: { timesheet: { user: { organizationId: a.organizationId } } },
    },
    include: {
      stage: true,
      decision: true,
      instance: {
        include: {
          version: true,
          amendment: true,
          timesheet: {
            include: {
              period: true,
              user: { select: { name: true } },
              entries: { include: { project: true } },
            },
          },
        },
      },
    },
  });
  if (
    !task ||
    !(await allowedTaskActor(
      db,
      a,
      task.instance.timesheet.userId,
      task.scopeKey,
    ))
  )
    throw new AppError(404, "Approval task not found");
  const entries = normalize(
    task.instance.amendment?.proposedEntries ?? task.instance.version.entries,
  ).filter((e) => task.scopeKey === "ALL" || e.projectId === task.scopeKey);
  const projects = await db.project.findMany({
    where: {
      id: { in: entries.map((e) => e.projectId) },
      organizationId: a.organizationId,
    },
  });
  return {
    id: task.id,
    status: task.status,
    stage: task.stage.name,
    scopeKey: task.scopeKey,
    amendmentReason: task.instance.amendment?.reason,
    employee: task.instance.timesheet.user.name,
    period: task.instance.timesheet.period,
    revision: task.instance.timesheet.revision,
    entries: entries.map((e) => ({
      ...e,
      project: projects.find((p) => p.id === e.projectId),
    })),
    originalEntries: task.instance.amendment
      ? normalize(task.instance.version.entries).filter(
          (e) => task.scopeKey === "ALL" || e.projectId === task.scopeKey,
        )
      : null,
    decision: task.decision,
  };
}
