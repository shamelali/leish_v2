import { NextResponse } from "next/server";
import { authorizeCron } from "@/server/cron-auth";
import { runPayoutAutomation } from "@/server/payout-automation";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/**
 * Cron: Payout Auto-Settlement
 * Schedule: daily at 02:00 UTC (runs after booking-transitions cron)
 *
 * Auto-settles payouts that are `pending` and past their `settleable_at`
 * date (24h after the event). Artists are notified by email; a summary
 * is posted to Slack.
 */
export async function POST(request: Request) {
  const authError = await authorizeCron(request);
  if (authError) return authError;

  try {
    const result = await runPayoutAutomation();
    logger.info(result, "payout automation cron complete");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "payout automation cron failed",
    );
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, status: "Use POST to run payout automation" });
}
