import { logger } from "./logger";

/**
 * Provider token helper — environment variables only.
 *
 * Vercel Connect was removed when the project migrated off Vercel to
 * Cloudflare. API keys now live in env vars (locally `.env.local` /
 * `.dev.vars`, in production Cloudflare secrets via `wrangler secret put`).
 *
 * The `getConnectToken` name and options shape are kept so existing callers
 * (`src/server/email.ts`, `src/server/notifications.ts`) work unchanged:
 * connector UIDs resolve to their env-var equivalent, falling back to null
 * when unconfigured (callers treat null as "provider unavailable").
 */

const CONNECTOR_ENV: Record<string, string> = {
  "api-key/resend": "RESEND_API_KEY",
  "api-key/postmark": "POSTMARK_SERVER_TOKEN",
  "api-key/brevo": "BREVO_API_KEY",
  "slack/leish-slack": "SLACK_BOT_TOKEN",
};

export interface ConnectTokenOptions {
  /** Connector UID (e.g. "slack/leish-slack"). Defaults to the Slack connector. */
  connector?: string;
  /** Kept for call-site compatibility; unused (no per-subject tokens). */
  subject?: { type: "app" } | { type: "user"; id: string; issuer?: string };
  /** Kept for call-site compatibility; unused (env tokens carry fixed scopes). */
  scopes?: string[];
}

/**
 * Resolve a provider token from the environment.
 * Returns null when the backing env var is not configured.
 */
export async function getConnectToken(options: ConnectTokenOptions = {}): Promise<string | null> {
  const connector = options.connector ?? "slack/leish-slack";
  const envKey = CONNECTOR_ENV[connector];
  if (!envKey) {
    logger.warn({ connector }, "unknown connector UID — no env mapping");
    return null;
  }
  return process.env[envKey] ?? null;
}
