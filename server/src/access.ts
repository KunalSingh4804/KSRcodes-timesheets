import { Prisma } from "@prisma/client";
import { AppError } from "./domain.js";
export const actorInclude = {
  organization: true,
  roles: {
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  },
} satisfies Prisma.UserInclude;
export type Actor = Prisma.UserGetPayload<{ include: typeof actorInclude }>;
export function grants(a: Actor, permission: string) {
  return a.roles.filter((g) =>
    g.role.permissions.some((p) => p.permission.code === permission),
  );
}
export function requirePermission(a: Actor, permission: string) {
  if (!grants(a, permission).length)
    throw new AppError(403, "This action is outside your permissions");
}
export function employeeScope(
  a: Actor,
  permission = "timesheet.read",
): Prisma.UserWhereInput {
  const g = grants(a, permission);
  const branches: Prisma.UserWhereInput[] = [{ id: a.id }];
  if (g.some((x) => x.scope === "ORGANIZATION"))
    branches.push({ organizationId: a.organizationId });
  const teams = g
    .filter((x) => x.scope === "TEAM" && x.teamId)
    .map((x) => x.teamId!);
  if (teams.length)
    branches.push({
      memberships: {
        some: {
          teamId: { in: teams },
          startsOn: { lte: new Date() },
          OR: [{ endsOn: null }, { endsOn: { gte: new Date() } }],
        },
      },
    });
  return { organizationId: a.organizationId, OR: branches };
}
export function canConfigure(a: Actor) {
  return grants(a, "configuration.write").some(
    (x) => x.scope === "ORGANIZATION",
  );
}
