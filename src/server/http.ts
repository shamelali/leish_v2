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

/** Return the first value from a possibly comma-separated proxy header. */
function firstHeaderValue(request: Request, name: string): string | null {
  const value = request.headers.get(name);
  return value?.split(",")[0]?.trim() || null;
}

/** Normalize an origin so configured values may include a trailing slash. */
function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Resolve the origin the browser used to reach the app. In the hosted preview
 * the request URL can point at the internal Next.js server, while the browser
 * Origin points at the public proxy host. Prefer the standard forwarded host
 * and protocol headers before falling back to Host/request.url.
 */
export function requestOrigin(request: Request): string {
  const forwardedHost = firstHeaderValue(request, "x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host")?.trim();
  const forwardedProto = firstHeaderValue(request, "x-forwarded-proto");

  if (host) {
    const protocol = forwardedProto ?? new URL(request.url).protocol.replace(":", "");
    const resolved = normalizeOrigin(`${protocol}://${host}`);
    if (resolved) return resolved;
  }

  return new URL(request.url).origin;
}

/** The configured app origin used to validate cross-origin requests. */
export function appOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return (configured && normalizeOrigin(configured)) || requestOrigin(request);
}

/**
 * CSRF protection for state-changing routes. Rejects requests whose Origin
 * header doesn't match the configured app origin, the public request origin,
 * an explicitly allowed origin, or the current Vercel deployment URL.
 * Requests without an Origin header — same-origin navigation and
 * server-to-server callers like webhooks/cron — are allowed through.
 */
export function enforceSameOrigin(request: Request): NextResponse | null {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return null;

  const origin = normalizeOrigin(rawOrigin.trim());
  const allowed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => normalizeOrigin(value.trim()))
    .filter((value): value is string => Boolean(value));
  const expected = new Set([appOrigin(request), requestOrigin(request), ...allowed]);

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    const vercelOrigin = normalizeOrigin(
      vercelUrl.startsWith("http://") || vercelUrl.startsWith("https://")
        ? vercelUrl
        : `https://${vercelUrl}`,
    );
    if (vercelOrigin) expected.add(vercelOrigin);
  }

  // Arena's browser preview is an HTTPS proxy around the local dev server.
  // It may not forward Host in every environment, so allow only the platform's
  // well-defined preview hostname while running outside production.
  const isArenaPreview =
    process.env.NODE_ENV !== "production" &&
    origin !== null &&
    (() => {
      try {
        const parsed = new URL(origin);
        return parsed.protocol === "https:" && /^\d+-[a-z0-9-]+\.e2b\.app$/i.test(parsed.hostname);
      } catch {
        return false;
      }
    })();

  if (origin && (expected.has(origin) || isArenaPreview)) return null;
  logger.warn({ origin: rawOrigin.trim() }, "cross-origin state-changing request blocked");
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
