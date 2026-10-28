import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. Browsers are installed in CI
 * (`npx playwright install --with-deps chromium`); the sandbox blocks the
 * browser CDN, so run these via GitHub Actions (see .github/workflows/ci.yml).
 */
export default defineConfig({
  testDir: "./e2e",
  // Sequential: several specs book the same catalog artist's slots, so
  // parallel workers collide on the unique (artist, date, time) index.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The catalog has no demo seed, so one step writes the fixture artists and
    // studios into a throwaway SQLite file (plus a state file the specs read)
    // before the server boots. Both run in this command so the env below applies.
    command:
      "node --experimental-strip-types e2e/support/seed-fixtures.ts && npm run build && npm run start",
    env: {
      // The server runs with NODE_ENV=production, where src/env.ts enforces the
      // production contract (and src/server/db.ts refuses SQLite). Provide
      // throwaway values + explicit local opt-outs here; nothing leaves the
      // test machine.
      SESSION_SECRET: "e2e-test-secret",
      CRON_SECRET: "e2e-cron-secret",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
      // The suite runs the production build but deliberately NOT the production
      // env contract (no real DATABASE_URL/Billplz/email here). Without this the
      // boot depends on a developer's untracked .env.local happening to set it,
      // which is also why ci.yml sets it at job level.
      SKIP_ENV_VALIDATION: "1",
      PAYMENTS_ALLOW_DEV: "1",
      // Production requires a real email provider; e2e deliberately keeps the
      // dev outbox so no mail can leave the machine.
      EMAIL_PROVIDER: "dev",
      EMAIL_ALLOW_DEV: "1",
      PORT: "3100",
      // Hard isolation: force the local SQLite backend so tests can NEVER touch
      // a real database via an inherited DATABASE_URL (.env.local). Empty
      // string is falsy, so src/server/db.ts falls back to SQLite — with
      // SKIP_DB_GUARD allowing that fallback outside development. A file (not
      // :memory:) is required because the fixture step is a separate process.
      DATABASE_URL: "",
      SKIP_DB_GUARD: "1",
      LEISH_DB_PATH: "./data/e2e.db",
      // Lets the register route return devVerifyUrl so e2e specs can verify
      // their accounts (booking creation requires a verified email), and
      // raises auth rate limits so multi-registration flows don't 429.
      E2E_EXPOSE_VERIFY_URL: "1",
      E2E_TEST_MODE: "1",
    },
    url: "http://localhost:3100",
    reuseExistingServer: false,
    // The command builds the app before starting it, so allow well over a
    // bare boot: a cold `next build` alone can take a couple of minutes.
    timeout: 300_000,
  },
});
