/**
 * Validate required environment variables at start time.
 * Secrets are enforced when the server actually runs (production),
 * but not during static builds (next build sets NODE_ENV=production yet
 * does not need runtime secrets).
 */
const isBuild =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build" ||
  process.argv.some((arg) => arg.includes("build"));
const required =
  !isBuild && process.env.NODE_ENV === "production" ? (["SESSION_SECRET"] as const) : ([] as const);

export function validateEnv() {
  // During build, don't throw - let the app build successfully
  // Validation happens at runtime via instrumentation
  if (isBuild) {
    return; // allow build to complete
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}

/** Fail-closed: in production, ensure POSTGRES_URL is set. */
function checkPostgresUrl(): void {
  if (process.env.NODE_ENV === "production" && !process.env.POSTGRES_URL) {
    throw new Error(
      "POSTGRES_URL is required in production. Set it in Vercel/Supabase env vars."
    );
  }
}

/** Call checkPostgresUrl at module init for runtime validation only */
if (!isBuild) {
  checkPostgresUrl();
}

/** S3 bucket encryption at rest — use SSE-KMS with alias leish/s3-key for PDPA compliance. */
export const S3_BUCKET = "leish-files";
export const S3_ENCRYPTION = "SSE-KMS";
export const S3_KMS_KEY_ALIAS = "leish/s3-key";
