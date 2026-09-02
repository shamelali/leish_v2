import { NextResponse } from "next/server";
import { runBalanceReminderSweep } from "@/server/balance-reminders";
import { tryRoute } from "@/server/http";
import { authorizeCron } from "@/server/cron-auth";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/cron/balance-reminders
 * Automatically remind clients whose remaining balance is due soon (3 days
 * before the event, per the business rule) and escalate completed bookings
 * with an unpaid balance. Guarded by CRON_SECRET (Vercel Cron Bearer token
 * or x-cron-secret header).
 */
const handler = tryRoute(
  async function run(request: Request) {
    const unauthorized = authorizeCron(request);
    if (unauthorized) return unauthorized;

    const result = await runBalanceReminderSweep();

    logger.info(
      {
        candidates: result.candidates,
        reminded: result.reminded,
        escalated: result.escalated,
        skipped: result.skipped,
      },
      "balance reminder sweep complete",
    );

    return NextResponse.json(result);
  },
  { route: "/api/cron/balance-reminders" },
);

export const GET = handler;
export const POST = handler;
