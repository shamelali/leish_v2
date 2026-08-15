/**
 * Validate required environment variables at start time.
 * Secrets are enforced when the server actually runs (production),
 * but not during static builds (next build sets NODE_ENV=production yet
 * does not need runtime secrets).
 */
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const required =
  !isBuild && process.env.NODE_ENV === "production" ? (["SESSION_SECRET"] as const) : ([] as const);

export function validateEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}
