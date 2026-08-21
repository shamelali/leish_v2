import { NextResponse } from "next/server";

/**
 * Authorize a cron invocation.
 *
 * Supports both callers:
 *  - Vercel Cron: issues a GET with `Authorization: Bearer <CRON_SECRET>`
 *    (and an `x-vercel-cron: 1` header on the platform).
 *  - Manual/self-hosted schedulers: may send `x-cron-secret: <CRON_SECRET>`.
 *
 * When `CRON_SECRET` is unset (local dev), the check is skipped so the
 * endpoints remain callable without configuration. Returns a 401 response
 * when the caller is not authorized, otherwise `null`.
 */
export function authorizeCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;

  const authHeader = request.headers.get("authorization");
  const bearerOk = authHeader === `Bearer ${secret}`;
  const headerOk = request.headers.get("x-cron-secret") === secret;
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";

  if (bearerOk || headerOk || (isVercelCron && bearerOk)) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
