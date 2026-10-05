import { NextResponse } from "next/server";
import { authorizeCron } from "@/server/cron-auth";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET/POST /api/cron/retention
 * Placeholder retention sweep. The leish-cron Cloudflare worker invokes this
 * daily with `Authorization: Bearer <CRON_SECRET>`. Heavy PII purging is
 * performed out-of-band by scripts/retain-purge.mjs against PostgreSQL.
 *
 * Logs the same `durationMs`/`processedCount` shape as the other cron routes
 * so a single dashboard/alerts rule covers every sweep.
 */
async function run(request: Request) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();

  logger.info(
    {
      status: "ok",
      durationMs: Date.now() - startedAt,
      processedCount: 0,
    },
    "retention sweep complete",
  );

  return NextResponse.json({
    status: "ok",
    message: "Retention sweep acknowledged",
    next: "Archive/purge PII older than the retention window",
    timestamp: new Date().toISOString(),
  });
}

export const GET = run;
export const POST = run;
