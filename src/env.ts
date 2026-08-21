/**
 * Lightweight environment validation, invoked from `instrumentation.ts` at
 * server startup and via `npm run env:check`.
 *
 * The app runs in two modes:
 *  - PostgreSQL when `DATABASE_URL` is set (production / staging)
 *  - Node's built-in SQLite otherwise (local dev / tests)
 *
 * So `DATABASE_URL` is only *required* in a real production runtime. We warn
 * rather than throw for optional-but-recommended vars so previews still boot.
 */

function isProductionRuntime(): boolean {
  // Skip during the build phase — env is injected at runtime on Vercel.
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  if (process.env.SKIP_ENV_VALIDATION) return false;
  return process.env.NODE_ENV === "production";
}

export function validateEnv(): void {
  if (!isProductionRuntime()) return;

  const missing: string[] = [];

  // SESSION_SECRET is required to sign session cookies in production.
  if (!process.env.SESSION_SECRET) missing.push("SESSION_SECRET");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s) in production: ${missing.join(", ")}`,
    );
  }

  // Recommended but non-fatal: warn so operators notice misconfiguration.
  const recommended = ["DATABASE_URL", "NEXT_PUBLIC_SITE_URL"];
  const missingRecommended = recommended.filter((key) => !process.env[key]);
  if (missingRecommended.length > 0) {
    console.warn(
      `[env] Recommended environment variable(s) not set: ${missingRecommended.join(", ")}`,
    );
  }
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
};
