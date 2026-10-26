import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["server/tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: "test",
      DEV_DATABASE: "pglite",
      PGLITE_DATA_DIR: "memory://",
      AUTH_MODE: "development",
      APP_ORIGIN: "http://localhost:5173",
    },
    reporters: ["default", "json"],
    outputFile: { json: ".local/test-results.json" },
  },
});
