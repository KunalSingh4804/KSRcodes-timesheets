import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
export const embeddedDevelopment = process.env.DEV_DATABASE === "pglite";
if (embeddedDevelopment && process.env.NODE_ENV === "production")
  throw new Error("PGlite is only permitted for development and tests");
async function adapter() {
  if (!embeddedDevelopment)
    return new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const { PGlite } = await import("@electric-sql/pglite");
  const { PrismaPGlite } = await import("pglite-prisma-adapter");
  const directory = process.env.PGLITE_DATA_DIR ?? ".local/pglite";
  if (directory !== "memory://") mkdirSync(directory, { recursive: true });
  const pg = new PGlite(directory === "memory://" ? undefined : directory);
  await pg.waitReady;
  await pg.exec(
    "CREATE TABLE IF NOT EXISTS _development_migrations (name TEXT PRIMARY KEY)",
  );
  for (const name of readdirSync("prisma/migrations")
    .filter((n) => /^\d/.test(n))
    .sort()) {
    const done = await pg.query(
      "SELECT name FROM _development_migrations WHERE name=$1",
      [name],
    );
    if (done.rows.length) continue;
    await pg.transaction(async (tx) => {
      await tx.exec(
        readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"),
      );
      await tx.query("INSERT INTO _development_migrations (name) VALUES ($1)", [
        name,
      ]);
    });
  }
  return new PrismaPGlite(pg);
}
export const db = new PrismaClient({ adapter: await adapter() });
