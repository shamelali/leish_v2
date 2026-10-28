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
  if (process.env.NODE_ENV !== "production") return false;
  // Vercel preview/dev deployments also run with NODE_ENV=production. Only the
  // production environment is held to the strict contract, otherwise every PR
  // preview would have to carry production credentials to boot.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return false;
  return true;
}

export function validateEnv(): void {
  if (!isProductionRuntime()) return;

  const missing: string[] = [];
  for (const key of [
    "SESSION_SECRET",
    "DATABASE_URL",
    "NEXT_PUBLIC_SITE_URL",
    "CRON_SECRET",
  ] as const) {
    if (!process.env[key]) missing.push(key);
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s) in production: ${missing.join(", ")}. ` +
        "See .env.example for the full list.",
    );
  }

  // Payments are the one integration where a partial configuration is worse
  // than none: with either Billplz value missing the app silently falls back to
  // the `dev` provider, which records payments without collecting money.
  const hasKey = Boolean(process.env.BILLPLZ_API_KEY);
  const hasCollection = Boolean(process.env.BILLPLZ_COLLECTION_ID);
  if (hasKey !== hasCollection) {
    throw new Error(
      "BILLPLZ_API_KEY and BILLPLZ_COLLECTION_ID must be set together (only one was found).",
    );
  }
  if (!hasKey && process.env.PAYMENTS_ALLOW_DEV !== "1") {
    throw new Error(
      "Billplz is not configured. Set BILLPLZ_API_KEY + BILLPLZ_COLLECTION_ID, " +
        "or set PAYMENTS_ALLOW_DEV=1 to explicitly run without collecting payments.",
    );
  }

  // Email is how customers verify accounts and receive booking confirmations.
  // With no provider configured the app writes to the dev outbox and sends
  // nothing — which looks like success until a real customer never gets a link.
  // Mirrors the payment opt-out pattern above.
  const explicitEmail = process.env.EMAIL_PROVIDER;
  const hasEmailCredential = Boolean(
    process.env.RESEND_API_KEY || process.env.POSTMARK_SERVER_TOKEN || process.env.BREVO_API_KEY,
  );
  const emailIsDev = explicitEmail === "dev" || (!explicitEmail && !hasEmailCredential);
  if (emailIsDev && process.env.EMAIL_ALLOW_DEV !== "1") {
    throw new Error(
      "No email provider configured. Set EMAIL_PROVIDER (resend | postmark | brevo) with its " +
        "API key, or set EMAIL_ALLOW_DEV=1 to explicitly run without sending email.",
    );
  }

  // Best-effort hygiene: these never block a boot, but a silent absence is how
  // observability and email quietly stop working in production.
  const recommended = ["EMAIL_FROM", "PEPPER_SECRET", "SENTRY_DSN", "ERROR_WEBHOOK_URL"].filter(
    (key) => !process.env[key],
  );
  if (recommended.length > 0) {
    console.warn(`[env] Recommended environment variable(s) not set: ${recommended.join(", ")}`);
  }
}

/**
 * Get an environment variable or throw if missing.
 * Use for vars that are absolutely required at runtime.
 */
export function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
};
