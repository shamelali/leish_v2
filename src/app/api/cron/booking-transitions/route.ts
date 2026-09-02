import { NextResponse } from "next/server";
import { runAllAutoTransitions } from "@/server/booking-transitions";
import { tryRoute } from "@/server/http";
import { authorizeCron } from "@/server/cron-auth";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/cron/booking-transitions
 *
 * Automatically transitions bookings that no longer require manual action:
 *
 *   1. Confirmed bookings whose event date has passed → "completed"
 *   2. Requested bookings waiting on artist response for >48h → "cancelled"
 *
 * Owner notifications (email) are sent for both transitions. This runs every
 * hour via Vercel Cron (see vercel.json) to keep calendars and payout
 * timelines accurate without admin intervention.
 *
 * Guarded by CRON_SECRET (Vercel Cron Bearer token or x-cron-secret header).
 */
const handler = tryRoute(
  async function run(request: Request) {
    const unauthorized = authorizeCron(request);
    if (unauthorized) return unauthorized;

    const result = await runAllAutoTransitions();

    logger.info(
      {
        autoCompleted: result.completed,
        autoCancelled: result.cancelled,
        notified: result.notified,
      },
      "booking transition sweep complete",
    );

    return NextResponse.json({
      completed: result.completed,
      cancelled: result.cancelled,
      notified: result.notified,
    });
  },
  { route: "/api/cron/booking-transitions" },
);

export const GET = handler;
export const POST = handler;
