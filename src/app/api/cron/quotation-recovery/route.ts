import { NextResponse } from "next/server";
import { runQuotationRecoverySweep } from "@/server/quotation-recovery";
import { tryRoute } from "@/server/http";
import { authorizeCron } from "@/server/cron-auth";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/cron/quotation-recovery
 * Re-engages clients whose quotation expired (one recovery email) and later
 * releases slots for bookings the client never completed. Guarded by
 * CRON_SECRET so only the scheduler can run it.
 *
 * Vercel Cron (configured in vercel.json) issues a GET with
 * `Authorization: Bearer <CRON_SECRET>`; manual callers may use the
 * `x-cron-secret` header instead.
 */
const handler = tryRoute(
  async function run(request: Request) {
    const unauthorized = authorizeCron(request);
    if (unauthorized) return unauthorized;

    const result = await runQuotationRecoverySweep();
    logger.info(
      { route: "/api/cron/quotation-recovery", ...result },
      "quotation recovery sweep complete",
    );
    return NextResponse.json(result);
  },
  { route: "/api/cron/quotation-recovery" },
);

export const GET = handler;
export const POST = handler;
