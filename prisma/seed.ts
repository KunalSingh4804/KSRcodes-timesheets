import "dotenv/config";
import { db } from "../server/src/db.js";
import { rolePermissions } from "../server/src/permissions.js";
export async function seed() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Fictional seed data is forbidden in production");
  if (await db.organization.count()) return;
  const org = await db.organization.create({
    data: { name: "MultiverseTech Solutions", timezone: "Asia/Kolkata" },
  });
  const permissionCodes = [
    "timesheet.read",
    "timesheet.write",
    "approval.decide",
    "organization.read",
    "organization.write",
    "configuration.write",
    "access.write",
    "audit.read",
    "report.read",
    "export.create",
  ];
  const permissions = await Promise.all(
    permissionCodes.map((code) => db.permission.create({ data: { code } })),
  );

  const roles: Record<string, string> = {};
  for (const [name, codes] of Object.entries(rolePermissions)) {
    const role = await db.role.create({
      data: {
        name,
        permissions: {
          create: permissions
            .filter((p) => codes.includes(p.code))
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });
    roles[name] = role.id;
  }
  const department = await db.department.create({
    data: { name: "Engineering", organizationId: org.id },
  });
  const team = await db.team.create({
    data: {
      name: "Product Engineering",
      departmentId: department.id,
      organizationId: org.id,
    },
  });
  const createUser = (name: string, email: string) =>
    db.user.create({ data: { name, email, organizationId: org.id } });
  const manager = await createUser(
    "Priya Sharma",
    "priya@multiversetech.example",
  );
  const employee = await db.user.create({
    data: {
      name: "Aarav Mehta",
      email: "aarav@multiversetech.example",
      organizationId: org.id,
      managerId: manager.id,
    },
  });
  const colleague = await db.user.create({
    data: {
      name: "Neha Kapoor",
      email: "neha@multiversetech.example",
      organizationId: org.id,
      managerId: manager.id,
    },
  });
  const hr = await createUser("Rohan Verma", "rohan.hr@multiversetech.example");
  const system = await createUser(
    "Isha Rao",
    "isha.admin@multiversetech.example",
  );
  for (const u of [employee, colleague, manager, hr, system])
    await db.userRole.create({
      data: { userId: u.id, roleId: roles.Employee, scope: "SELF" },
    });
  await db.userRole.createMany({
    data: [
      {
        userId: manager.id,
        roleId: roles.Manager,
        scope: "TEAM",
        teamId: team.id,
      },
      { userId: hr.id, roleId: roles.HR, scope: "ORGANIZATION" },
      { userId: system.id, roleId: roles.SystemAdmin, scope: "ORGANIZATION" },
    ],
  });
  for (const u of [employee, colleague])
    await db.teamMembership.create({
      data: { userId: u.id, teamId: team.id, startsOn: new Date("2026-01-01") },
    });
  const projects = [];
  for (const [name, code, color] of [
    ["Customer Experience Platform", "CXP", "#15a389"],
    ["Cloud Infrastructure", "CLD", "#6395e8"],
    ["Internal Operations", "INT", "#ac83d2"],
  ])
    projects.push(
      await db.project.create({
        data: {
          name,
          code,
          color,
          organizationId: org.id,
          managerId: manager.id,
        },
      }),
    );
  for (const u of [employee, colleague, manager])
    for (const p of projects)
      await db.projectAssignment.create({
        data: {
          userId: u.id,
          projectId: p.id,
          startsOn: new Date("2026-01-01"),
        },
      });
  const calendar = await db.companyCalendar.create({
    data: {
      name: "Sample calendar — confirm before production",
      organizationId: org.id,
      holidays: [],
    },
  });
  const policy = await db.workPolicy.create({
    data: {
      organizationId: org.id,
      calendarId: calendar.id,
      name: "Sample work policy — not approved company policy",
      version: 1,
      config: {
        workingDays: [1, 2, 3, 4, 5],
        targetMinutes: 480,
        maxDailyMinutes: null,
        categories: ["Development", "Meetings", "Research", "Support"],
        allowLate: true,
        allowFuture: false,
      },
    },
  });
  const workflow = await db.approvalWorkflowDefinition.create({
    data: {
      name: "Sample manager → HR approval",
      organizationId: org.id,
      version: 1,
      active: true,
    },
  });
  await db.approvalStageDefinition.createMany({
    data: [
      {
        workflowId: workflow.id,
        position: 1,
        name: "Reporting manager",
        resolver: "REPORTING_MANAGER",
        config: { decisionRule: "ALL", delegationEnabled: false },
      },
      {
        workflowId: workflow.id,
        position: 2,
        name: "HR review",
        resolver: "HR_GROUP",
        config: { decisionRule: "ALL", delegationEnabled: false },
      },
    ],
  });
  const now = new Date(),
    year = now.getUTCFullYear(),
    month = now.getUTCMonth();
  for (const offset of [-1, 0, 1]) {
    const start = new Date(Date.UTC(year, month + offset, 1)),
      end = new Date(Date.UTC(year, month + offset + 1, 0));
    const period = await db.reportingPeriod.create({
      data: {
        organizationId: org.id,
        startsOn: start,
        endsOn: end,
        policyId: policy.id,
      },
    });
    if (offset !== 0) continue;
    for (const u of [employee, colleague]) {
      const s = await db.timesheet.create({
        data: { userId: u.id, periodId: period.id },
      });
      for (let day = 1; day <= Math.min(now.getUTCDate() - 1, 20); day++) {
        const d = new Date(Date.UTC(year, month, day));
        if ([0, 6].includes(d.getUTCDay())) continue;
        await db.workEntry.createMany({
          data: [
            {
              timesheetId: s.id,
              projectId: projects[0].id,
              workDate: d,
              description:
                day % 2
                  ? "Customer portal implementation"
                  : "API integration and review",
              minutes: 300,
              category: "Development",
              billable: true,
            },
            {
              timesheetId: s.id,
              projectId: projects[1].id,
              workDate: d,
              description: "Infrastructure improvements",
              minutes: 120,
              category: "Development",
              billable: true,
            },
            {
              timesheetId: s.id,
              projectId: projects[2].id,
              workDate: d,
              description: "Team planning and collaboration",
              minutes: 60,
              category: "Meetings",
              billable: false,
            },
          ],
        });
      }
    }
  }
  await db.notification.create({
    data: {
      userId: employee.id,
      message:
        "Welcome to your workspace. Review the sample entries and try your first monthly submission.",
    },
  });
  console.log(
    "Created fictional development organization, five identities, three projects and sample work entries.",
  );
}
if (process.argv[1]?.endsWith("seed.ts"))
  seed().finally(() => db.$disconnect());
