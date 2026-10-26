import { app } from "./app.js";
import { db, embeddedDevelopment } from "./db.js";
if (embeddedDevelopment) {
  const { seed } = await import("../../prisma/seed.js");
  await seed();
}
const server = app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0", () =>
  console.log("KSRcodes pvt.ltd API listening"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
  });
