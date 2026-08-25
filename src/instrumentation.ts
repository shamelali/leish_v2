export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/env");
    validateEnv();

    // Guard rail: the e2e-only escape hatches (exposed verification links,
    // relaxed rate limits) must never run against a real database. The
    // playwright webServer forces SQLite via an empty DATABASE_URL; if both
    // a backend URL and an e2e flag are present, this is a misconfiguration —
    // fail loudly instead of silently testing against production data.
    const e2eFlag = process.env.E2E_EXPOSE_VERIFY_URL === "1" || process.env.E2E_TEST_MODE === "1";
    const { isPostgres } = await import("@/server/db");
    if (e2eFlag && isPostgres()) {
      throw new Error(
        "[e2e guard] E2E flags are set but DATABASE_URL points at a real database. " +
          "Unset DATABASE_URL (playwright.config.ts does this) so tests use isolated SQLite.",
      );
    }
  }
}
