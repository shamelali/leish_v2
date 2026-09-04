import { getToken } from "@vercel/connect";
import { logger } from "./logger";

/**
 * Vercel Connect token helper.
 *
 * Wraps @vercel/connect to fetch short-lived provider tokens at runtime.
 * No provider API keys live in environment variables — Connect manages them.
 *
 * Setup (one-time, in Vercel dashboard):
 *   1. Create a connector (e.g. Slack, GitHub, or Custom OAuth/API-key)
 *   2. Link the connector to this project + environment
 *   3. Use the connector UID here when calling getToken()
 *
 * Local dev: run `vercel link && vercel env pull` to get a dev OIDC token.
 */

const CONNECT_CONNECTOR_SLACK = process.env.CONNECT_SLACK_CONNECTOR ?? "slack/leish-slack";

export interface ConnectTokenOptions {
  /** Connector UID (e.g. "slack/leish-slack"). Defaults to the Slack connector. */
  connector?: string;
  /** Token subject type. Defaults to "app" (acts as the bot, not a user). */
  subject?: { type: "app" } | { type: "user"; id: string; issuer?: string };
  /** OAuth scopes to request. Use ["*"] for connector defaults. */
  scopes?: string[];
}

/**
 * Get a short-lived provider access token from Vercel Connect.
 * Returns null if Connect is not configured or the request fails.
 */
export async function getConnectToken(options: ConnectTokenOptions = {}): Promise<string | null> {
  const connector = options.connector ?? CONNECT_CONNECTOR_SLACK;

  try {
    const token = await getToken(connector, {
      subject: options.subject ?? { type: "app" },
      scopes: options.scopes ?? ["*"],
    });
    return token;
  } catch (err) {
    // Don't throw — notifications are best-effort. Log and return null.
    logger.warn(
      { connector, err: err instanceof Error ? err.message : String(err) },
      "failed to get Connect token — notification skipped",
    );
    return null;
  }
}
