import { NextResponse } from "next/server";
import { retryFailedEmails } from "@/server/email";
import { logger } from "@/server/logger";
import { authorizeCron } from "@/server/cron-auth";

/**
 * GET /api/cron/email-retries
 * Cron job to retry failed emails.
 *
 * Uses the shared `authorizeCron` guard so every cron route answers the same
 * way — including failing closed in production when no secret is configured.
 */
export async function GET(request: Request) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await retryFailedEmails();
    logger.info(result, "email retry cron completed");
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, "email retry cron failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
