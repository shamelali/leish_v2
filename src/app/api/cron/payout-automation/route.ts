import { NextResponse } from "next/server";
import { authorizeCron } from "@/server/cron-auth";
import { tryRoute } from "@/server/http";
import { runPayoutAutomation } from "@/server/payout-automation";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET/POST /api/cron/payout-automation
 * Schedule: daily at 03:00 UTC (runs after booking-transitions cron)
 *
 * Auto-settles payouts that are `pending` and past their `settleable_at`
 * date (24h after the event). Artists are notified by email; a summary
 * is posted to Slack. Guarded by CRON_SECRET (Vercel Cron Bearer token or
 * x-cron-secret header).
 */
const handler = tryRoute(
  async function run(request: Request) {
    const unauthorized = authorizeCron(request);
    if (unauthorized) return unauthorized;

    const result = await runPayoutAutomation();
    logger.info(result, "payout automation cron complete");
    return NextResponse.json({ ok: true, ...result });
  },
  { route: "/api/cron/payout-automation" },
);

export const GET = handler;
export const POST = handler;
