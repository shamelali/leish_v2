import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

/**
 * Authorize a cron invocation.
 *
 * Supports both callers:
 *  - Vercel Cron: issues a GET with `Authorization: Bearer <CRON_SECRET>`
 *    (and an `x-vercel-cron: 1` header on the platform).
 *  - Manual/self-hosted schedulers: may send `x-cron-secret: <SECRET>`.
 *  - Internal callers: `Authorization: Bearer <INTERNAL_API_SECRET>`.
 *
 * FAIL CLOSED. These endpoints send email, expire quotations and drive
 * payouts, so "no secret configured" must never mean "publicly triggerable".
 * In production an unconfigured secret produces a 503 instead of an open
 * endpoint; the no-op dev bypass keeps `npm run dev` and tests frictionless.
 */

function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function authorizeCron(request: Request): NextResponse | null {
  const secrets = [process.env.CRON_SECRET, process.env.INTERNAL_API_SECRET].filter(
    (value): value is string => Boolean(value && value.length > 0),
  );

  if (secrets.length === 0) {
    if (process.env.NODE_ENV === "production") {
      logger.error({}, "cron invoked without CRON_SECRET configured — refusing request");
      return NextResponse.json({ error: "Cron authentication is not configured" }, { status: 503 });
    }
    return null;
  }

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const provided = bearer ?? request.headers.get("x-cron-secret");

  if (provided && secrets.some((secret) => safeEqual(provided, secret))) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
