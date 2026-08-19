import { NextResponse } from "next/server";
import { logger } from "./logger";
import { getClientIp, rateLimit } from "./ratelimit";
import { reportError } from "./errors";

/**
 * Shared HTTP helpers for API routes: consistent JSON errors and
 * rate-limit enforcement with Retry-After support.
 */

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Enforce the rate limit for a request; returns a 429 response when hit. */
export async function enforceRateLimit(
  request: Request,
  options?: { limit?: number; windowMs?: number },
): Promise<NextResponse | null> {
  const key = `auth:${getClientIp(request)}`;
  const result = await rateLimit(key, options?.limit, options?.windowMs);
  if (!result.allowed) {
    logger.warn({ ip: getClientIp(request) }, "rate limit exceeded");
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) } },
    );
  }
  return null;
}

/** Parse a JSON body, returning a discriminated result that narrows cleanly. */
export async function readJson<T>(
  request: Request,
): Promise<{ ok: true; data: T } | { ok: false; error: NextResponse }> {
  try {
    const body = (await request.json()) as T;
    return { ok: true, data: body };
  } catch {
    return { ok: false, error: jsonError("Invalid JSON body", 400) };
  }
}

/**
 * Wrap a route handler so unhandled errors are logged structurally and the
 * client gets a sanitized 500 (no internal details leaked). `context` is
 * attached to the log line for correlation.
 */
export function tryRoute<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
  context: Record<string, unknown> = {},
): (...args: A) => Promise<NextResponse> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      logger.error(
        { ...context, err: err instanceof Error ? err.message : String(err) },
        "unhandled route error",
      );
      await reportError(err, { ...context, route: String(context.route ?? "") });
      return jsonError("Something went wrong. Please try again.", 500);
    }
  };
}

// ── CSRF / origin protection ────────────────────────────────────────────────

/** The app origin used to validate cross-origin requests. */
export function appOrigin(request: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
}

/**
 * CSRF protection for state-changing routes. Rejects requests whose Origin
 * header doesn't match the app origin (or ALLOWED_ORIGINS). Requests without
 * an Origin header — same-origin navigation and server-to-server callers like
 * webhooks/cron — are allowed through.
 */
export function enforceSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origin === appOrigin(request) || allowed.includes(origin)) return null;
  logger.warn({ origin }, "cross-origin state-changing request blocked");
  return jsonError("Invalid origin", 403);
}

/** Wrap a state-changing handler with the origin check. */
export function csrf<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args) => {
    const blocked = enforceSameOrigin(args[0] as Request);
    if (blocked) return blocked;
    return fn(...args);
  };
}

/** tryRoute + CSRF in one — for state-changing API routes. */
export function statefulRoute<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
  context: Record<string, unknown> = {},
): (...args: A) => Promise<NextResponse> {
  return csrf(tryRoute(fn, context));
}
