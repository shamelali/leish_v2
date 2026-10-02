import { NextResponse } from "next/server";
import { authorizeCron } from "@/server/cron-auth";
import { retryFailedEmails } from "@/server/email";
import { tryRoute } from "@/server/http";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET/POST /api/cron/email-retries
 * Cron job to retry failed emails.
 * Guarded by CRON_SECRET (Vercel Cron Bearer token or x-cron-secret header).
 */
const handler = tryRoute(
  async function run(request: Request) {
    const unauthorized = authorizeCron(request);
    if (unauthorized) return unauthorized;

    const result = await retryFailedEmails();
    logger.info(result, "email retry cron completed");
    return NextResponse.json(result);
  },
  { route: "/api/cron/email-retries" },
);

export const GET = handler;
export const POST = handler;
