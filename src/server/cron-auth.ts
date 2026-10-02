import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Authorize a cron invocation.
 *
 * Supports both callers:
 *  - Vercel Cron: issues a GET with `Authorization: Bearer <CRON_SECRET>`
 *    (and an `x-vercel-cron: 1` header on the platform).
 *  - Manual/self-hosted schedulers: may send `x-cron-secret: <CRON_SECRET>`.
 *
 * Fails closed: when `CRON_SECRET` is unset the request is rejected with 500,
 * except in local development (`NODE_ENV === "development"`) so the endpoints
 * remain callable without configuration.
 *
 * Returns a 401/500 response when the caller is not authorized, otherwise `null`.
 */
export function authorizeCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "development") return null;
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  const header = request.headers.get("x-cron-secret");

  if (safeEqual(bearer, secret) || safeEqual(header, secret)) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function safeEqual(candidate: string | null, secret: string): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
