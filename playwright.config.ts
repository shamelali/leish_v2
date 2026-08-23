import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests. Browsers are installed in CI
 * (`npx playwright install --with-deps chromium`); the sandbox blocks the
 * browser CDN, so run these via GitHub Actions (see .github/workflows/ci.yml).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start",
    env: {
      // `next start` runs with NODE_ENV=production, where src/env.ts requires
      // SESSION_SECRET (build is exempt). CI does not set it, so provide a
      // throwaway value here — it never leaves the test machine.
      SESSION_SECRET: "e2e-test-secret",
      PORT: "3100",
      // Lets the register route return devVerifyUrl so e2e specs can verify
      // their accounts (booking creation requires a verified email), and
      // raises auth rate limits so multi-registration flows don't 429.
      E2E_EXPOSE_VERIFY_URL: "1",
      E2E_TEST_MODE: "1",
    },
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
