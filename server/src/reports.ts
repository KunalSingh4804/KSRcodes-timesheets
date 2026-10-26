import { db } from "./db.js";
import {
  employeeScope,
  grants,
  requirePermission,
  type Actor,
} from "./access.js";
import { AppError, expectedMinutes, policySchema, csvCell } from "./domain.js";
import { transact, audit } from "./timesheets.js";
export async function monthlyReport(a: Actor, periodId: string) {
  requirePermission(a, "report.read");
  const period = await db.reportingPeriod.findFirst({
    where: { id: periodId, organizationId: a.organizationId },
    include: { policy: { include: { calendar: true } } },
  });
  if (!period) throw new AppError(404, "Reporting period not found");
  const g = grants(a, "report.read"),
    projectIds = g
      .filter((x) => x.scope === "PROJECT" && x.projectId)
      .map((x) => x.projectId!);
  const projectOnly =
    projectIds.length > 0 &&
    !g.some((x) => ["ORGANIZATION", "TEAM"].includes(x.scope));
  const users = await db.user.findMany({
    where: projectOnly
      ? {
          organizationId: a.organizationId,
          active: true,
          assignments: {
            some: {
              projectId: { in: projectIds },
              startsOn: { lte: period.endsOn },
              OR: [{ endsOn: null }, { endsOn: { gte: period.startsOn } }],
            },
          },
        }
      : employeeScope(a, "report.read"),
    include: {
      timesheets: {
        where: { periodId },
        include: {
          entries: { include: { project: true } },
          versions: { orderBy: { number: "desc" } },
        },
      },
    },
    orderBy: { name: "asc" },
    take: 1000,
  });
  const projects = await db.project.findMany({
    where: {
      organizationId: a.organizationId,
      ...(projectOnly ? { id: { in: projectIds } } : {}),
    },
  });
  const projectTotals = new Map<
    string,
    {
      id: string;
      name: string;
      color: string;
      recorded: number;
      approved: number;
    }
  >();
  const rows = users.map((u) => {
    const s = u.timesheets[0];
    const entries = (s?.entries ?? []).filter(
      (e) => !projectOnly || projectIds.includes(e.projectId),
    );
    const snapshot = (kind: string) => {
      const v = s?.versions.find((v) =>
        kind === "SUBMITTED"
          ? v.kind === "SUBMITTED"
          : ["APPROVED", "AMENDMENT_APPROVED"].includes(v.kind),
      );
      return (
        (v?.entries ?? []) as Array<{
          projectId: string;
          minutes: number;
          billable: boolean;
        }>
      ).filter((e) => !projectOnly || projectIds.includes(e.projectId));
    };
    const submitted = snapshot("SUBMITTED"),
      approved = snapshot("APPROVED");
    for (const e of entries) {
      const p = projects.find((p) => p.id === e.projectId);
      if (!p) continue;
      const t = projectTotals.get(p.id) ?? {
        id: p.id,
        name: p.name,
        color: p.color,
        recorded: 0,
        approved: 0,
      };
      t.recorded += e.minutes;
      projectTotals.set(p.id, t);
    }
    for (const e of approved) {
      const p = projects.find((p) => p.id === e.projectId);
      if (!p) continue;
      const t = projectTotals.get(p.id) ?? {
        id: p.id,
        name: p.name,
        color: p.color,
        recorded: 0,
        approved: 0,
      };
      t.approved += e.minutes;
      projectTotals.set(p.id, t);
    }
    return {
      userId: u.id,
      name: u.name,
      status: s?.status ?? "MISSING",
      timesheetId: s?.id,
      recorded: entries.reduce((n, e) => n + e.minutes, 0),
      submitted: submitted.reduce((n, e) => n + e.minutes, 0),
      approved: approved.reduce((n, e) => n + e.minutes, 0),
      billable: entries
        .filter((e) => e.billable)
        .reduce((n, e) => n + e.minutes, 0),
      nonBillable: entries
        .filter((e) => !e.billable)
        .reduce((n, e) => n + e.minutes, 0),
      overdue:
        !!period.deadline &&
        period.deadline < new Date() &&
        (!s || ["DRAFT", "RETURNED", "REJECTED"].includes(s.status)),
    };
  });
  const totals = rows.reduce(
    (t, r) => ({
      recorded: t.recorded + r.recorded,
      submitted: t.submitted + r.submitted,
      approved: t.approved + r.approved,
      billable: t.billable + r.billable,
      nonBillable: t.nonBillable + r.nonBillable,
    }),
    { recorded: 0, submitted: 0, approved: 0, billable: 0, nonBillable: 0 },
  );
  const expected = projectOnly
    ? null
    : expectedMinutes(
        period.startsOn,
        period.endsOn,
        policySchema.parse(period.policy.config),
        period.policy.calendar.holidays as string[],
      );
  return {
    period,
    rows,
    totals,
    projects: [...projectTotals.values()],
    expectedPerEmployee: expected,
    projectScoped: projectOnly,
  };
}
export async function exportCsv(a: Actor, periodId: string, cid: string) {
  requirePermission(a, "export.create");
  const report = await monthlyReport(a, periodId);
  await transact(async (tx) => {
    const job = await tx.exportJob.create({
      data: {
        userId: a.id,
        periodId,
        status: "COMPLETED",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await audit(tx, a, "EXPORT_CREATED", job.id, cid, {
      periodId,
      rows: report.rows.length,
    });
  });
  return [
    [
      "Employee",
      "Status",
      "Recorded minutes",
      "Submitted minutes",
      "Approved minutes",
      "Billable minutes",
      "Non-billable minutes",
    ],
    ...report.rows.map((r) => [
      r.name,
      r.status,
      r.recorded,
      r.submitted,
      r.approved,
      r.billable,
      r.nonBillable,
    ]),
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}
