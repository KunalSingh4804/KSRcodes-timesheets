import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["server/tests/http.integration.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: "test",
      AUTH_MODE: "development",
      APP_ORIGIN: "http://localhost:5173",
      ...(process.env.TEST_NATIVE_POSTGRES === "1"
        ? { DEV_DATABASE: "" }
        : { DEV_DATABASE: "pglite", PGLITE_DATA_DIR: "memory://" }),
    },
  },
});
