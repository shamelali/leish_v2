import { logger } from "./logger";

/**
 * Cloudflare Turnstile server-side verification.
 *
 * - When TURNSTILE_SECRET_KEY is configured, every protected auth route
 *   requires a valid `turnstileToken` in the request body.
 * - When it is NOT configured (local dev, e2e, pre-launch), verification is
 *   skipped with a log line — the app never hard-depends on the widget.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstileToken(
  token: unknown,
  ip: string | null,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    logger.debug("turnstile skipped (TURNSTILE_SECRET_KEY not set)");
    return true;
  }
  if (typeof token !== "string" || token.length === 0) {
    logger.warn({ ip }, "turnstile token missing");
    return false;
  }

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip ?? "" }),
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success) return true;
    logger.warn({ ip, codes: data["error-codes"] }, "turnstile verification failed");
    return false;
  } catch (err) {
    // Fail closed on network errors — a bot-friendly outage is worse than a
    // brief human inconvenience.
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "turnstile siteverify error");
    return false;
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    ""
  );
}
