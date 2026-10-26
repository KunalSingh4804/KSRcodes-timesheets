import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { db } from "../server/src/db.js";
import { rolePermissions } from "../server/src/permissions.js";
const input = z
  .object({
    company: z.string().min(2),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    tenantId: z.uuid(),
    adminObjectId: z.uuid(),
    adminName: z.string().min(2),
    adminEmail: z.email(),
  })
  .strict()
  .parse(JSON.parse(readFileSync(0, "utf8")));
try {
  await db.$transaction(async (tx) => {
    if (await tx.organization.count())
      throw new Error(
        "Bootstrap only supports an empty database; use authorized administration for changes",
      );
    const org = await tx.organization.create({
      data: { name: input.company, timezone: input.timezone },
    });
    const roles: Record<string, string> = {};
    for (const [name, codes] of Object.entries(rolePermissions)) {
      const role = await tx.role.create({ data: { name } });
      roles[name] = role.id;
      for (const code of codes) {
        const p = await tx.permission.upsert({
          where: { code },
          update: {},
          create: { code },
        });
        await tx.rolePermission.create({
          data: { roleId: role.id, permissionId: p.id },
        });
      }
    }
    const admin = await tx.user.create({
      data: {
        organizationId: org.id,
        name: input.adminName,
        email: input.adminEmail,
        entraTenantId: input.tenantId,
        entraObjectId: input.adminObjectId,
        roles: { create: { roleId: roles.SystemAdmin, scope: "ORGANIZATION" } },
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: admin.id,
        action: "ORGANIZATION_BOOTSTRAPPED",
        targetType: "Organization",
        targetId: org.id,
        correlationId: crypto.randomUUID(),
        summary: { timezone: input.timezone },
      },
    });
  });
  console.log(
    "Organization and initial system administrator provisioned. No work policies or business approval rights were created.",
  );
} finally {
  await db.$disconnect();
}
