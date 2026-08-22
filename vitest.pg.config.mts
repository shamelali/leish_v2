import { defineConfig } from "vitest/config";

/**
 * Integration tests that run against a real PostgreSQL instance.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... pnpm vitest run --config vitest.pg.config.mts
 *
 * CI: uses a PostgreSQL service container (see .github/workflows/ci.yml).
 */
export default defineConfig({
  test: {
    include: ["src/server/__integration__/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ["verbose"],
  },
});
