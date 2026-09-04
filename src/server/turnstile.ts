import { logger } from "./logger";
import { reportError } from "./errors";

/**
 * Cloudflare Turnstile server-side verification.
 *
 * - When TURNSTILE_SECRET_KEY is configured with a well-formed key, every
 *   protected auth route requires a valid `turnstileToken` in the request body.
 * - When it is NOT configured (local dev, e2e, pre-launch), verification is
 *   skipped with a log line — the app never hard-depends on the widget.
 *
 * ## Failure policy: closed for users, OPEN for our own misconfiguration
 *
 * These two cases look identical at the call site but must behave differently:
 *
 *   1. The *user* fails the challenge (bad/expired/replayed token, or a network
 *      error talking to Cloudflare). Fail CLOSED — reject the request. A
 *      bot-friendly outage is worse than a brief human inconvenience.
 *
 *   2. *We* configured the secret wrongly (not a Cloudflare-issued key, or
 *      siteverify replies `invalid-input-secret`). Failing closed here rejects
 *      100% of logins and registrations — every user locked out of the product
 *      until someone notices. Verification cannot possibly succeed with a bad
 *      secret, so the real choice is "no bot protection" vs "no users". We
 *      degrade to the unconfigured behaviour (skip) and raise a loud alert.
 *
 * Case 2 is not hypothetical: a secret generated locally with `openssl rand`
 * is syntactically plausible, non-empty, and rejected by Cloudflare every time.
 * Auth routes remain rate-limited while in this degraded state, so the blast
 * radius is loss of bot protection, not loss of all protection.
 *
 * Cloudflare-issued secrets look like `0x...`; the documented testing keys use
 * the `1x`/`2x`/`3x` prefixes. Anything else never came from Turnstile.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const SECRET_KEY_PATTERN = /^[0-3]x[A-Za-z0-9_-]{20,}$/;

/** True when the secret looks like a key Cloudflare could have issued. */
export function isValidSecretKeyFormat(secret: string): boolean {
  return SECRET_KEY_PATTERN.test(secret);
}

/**
 * True when Turnstile is configured AND usable. A malformed secret reports
 * false so callers treat it as "not configured" rather than "always fails".
 */
export function isTurnstileConfigured(): boolean {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  return Boolean(secret) && isValidSecretKeyFormat(secret as string);
}

/** Alert once per process per reason; a broken secret would otherwise alert on every login. */
const alerted = new Set<string>();

async function alertOnce(reason: string, message: string, metadata: Record<string, unknown>) {
  if (alerted.has(reason)) return;
  alerted.add(reason);
  await reportError(new Error(message), {
    route: "server/turnstile",
    metadata: { reason, ...metadata },
  });
}

/** Test-only: clear the once-per-process alert latch. */
export function __resetTurnstileAlerts() {
  alerted.clear();
}

export async function verifyTurnstileToken(token: unknown, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    logger.debug("turnstile skipped (TURNSTILE_SECRET_KEY not set)");
    return true;
  }

  // Misconfiguration (case 2): degrade to skip rather than lock everyone out.
  if (!isValidSecretKeyFormat(secret)) {
    logger.error(
      { ip },
      "TURNSTILE_SECRET_KEY is not a Cloudflare-issued key — verification disabled",
    );
    await alertOnce(
      "malformed_secret",
      "TURNSTILE_SECRET_KEY is malformed; Turnstile verification is disabled",
      {
        secretLength: secret.length,
        hint: "Cloudflare secrets start with 0x. A self-generated value (e.g. openssl rand) is never valid — rotate it in the Cloudflare dashboard.",
      },
    );
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

    const codes = data["error-codes"] ?? [];

    // Cloudflare telling us our own secret is wrong — same reasoning as above.
    if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
      logger.error({ ip, codes }, "turnstile rejected our secret — verification disabled");
      await alertOnce(
        "invalid_input_secret",
        "Cloudflare rejected TURNSTILE_SECRET_KEY; Turnstile verification is disabled",
        {
          codes,
          hint: "The key is well-formed but not valid for this site. Confirm it matches NEXT_PUBLIC_TURNSTILE_SITE_KEY's widget.",
        },
      );
      return true;
    }

    logger.warn({ ip, codes }, "turnstile verification failed");
    return false;
  } catch (err) {
    // Fail closed on network errors — a bot-friendly outage is worse than a
    // brief human inconvenience.
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "turnstile siteverify error",
    );
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
