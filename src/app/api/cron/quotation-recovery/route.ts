import { NextResponse } from "next/server";
import { runQuotationRecoverySweep } from "@/server/quotation-recovery";
import { tryRoute } from "@/server/http";
import { authorizeCron } from "@/server/cron-auth";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET/POST /api/cron/quotation-recovery
 * Re-engages clients whose quotation expired (one recovery email) and later
 * releases slots for bookings the client never completed. Guarded by
 * CRON_SECRET so only the scheduler can run it.
 *
 * The leish-cron Cloudflare worker issues a GET with
 * `Authorization: Bearer <CRON_SECRET>`; manual callers may use the
 * `x-cron-secret` header instead.
 */
const handler = tryRoute(
  async function run(request: Request) {
    const unauthorized = authorizeCron(request);
    if (unauthorized) return unauthorized;

    const startedAt = Date.now();
    const result = await runQuotationRecoverySweep();
    logger.info(
      {
        route: "/api/cron/quotation-recovery",
        ...result,
        durationMs: Date.now() - startedAt,
        processedCount: result.recovered + result.released,
      },
      "quotation recovery sweep complete",
    );
    return NextResponse.json(result);
  },
  { route: "/api/cron/quotation-recovery" },
);

export const GET = handler;
export const POST = handler;
