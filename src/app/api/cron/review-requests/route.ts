import { NextResponse } from "next/server";
import { runReviewRequestSweep } from "@/server/review-requests";
import { tryRoute } from "@/server/http";
import { authorizeCron } from "@/server/cron-auth";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/cron/review-requests
 * Automatically send review requests for completed bookings (24h after the
 * event). Guarded by CRON_SECRET (Vercel Cron Bearer token or x-cron-secret
 * header).
 */
const handler = tryRoute(
  async function run(request: Request) {
    const unauthorized = authorizeCron(request);
    if (unauthorized) return unauthorized;

    const result = await runReviewRequestSweep();

    logger.info(
      {
        requested: result.requested,
        skipped: result.skipped,
        errors: result.errors,
      },
      "review request sweep complete",
    );

    return NextResponse.json(result);
  },
  { route: "/api/cron/review-requests" },
);

export const GET = handler;
export const POST = handler;
