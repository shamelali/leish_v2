import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = import.meta.dirname;

/**
 * Integration tests that run against a real PostgreSQL instance.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... pnpm vitest run --config vitest.pg.config.mts
 *
 * CI: uses a PostgreSQL service container (see .github/workflows/ci.yml).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
    },
  },
  test: {
    include: ["src/server/__integration__/**/*.test.ts"],
    environment: "node",
    globals: false,
    reporters: ["verbose"],
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
