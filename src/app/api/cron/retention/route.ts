import { NextResponse } from "next/server";
import { authorizeCron } from "@/server/cron-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/retention
 * Placeholder retention sweep. Vercel Cron (see vercel.json) invokes this
 * daily with `Authorization: Bearer <CRON_SECRET>`. Heavy PII purging is
 * performed out-of-band by scripts/retain-purge.mjs against PostgreSQL.
 */
export async function GET(req: Request) {
  const unauthorized = authorizeCron(req);
  if (unauthorized) return unauthorized;

  return NextResponse.json({
    status: "ok",
    message: "Retention sweep acknowledged",
    next: "Archive/purge PII older than the retention window",
    timestamp: new Date().toISOString(),
  });
}
