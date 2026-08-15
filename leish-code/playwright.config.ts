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
    command: "npm run build && PORT=3100 npm run start",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
