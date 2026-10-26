import "dotenv/config";
import { spawn } from "node:child_process";
const api = spawn(
  process.execPath,
  ["--import", "tsx", "server/src/index.ts"],
  { stdio: "inherit" },
);
const web = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--config",
    "web/vite.config.ts",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    api.kill(signal);
    web.kill(signal);
    process.exit(0);
  });
api.on("exit", (code) => {
  web.kill();
  process.exit(code ?? 1);
});
web.on("exit", (code) => {
  api.kill();
  process.exit(code ?? 1);
});
