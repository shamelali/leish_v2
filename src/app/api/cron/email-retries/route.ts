import { NextResponse } from "next/server";
import { retryFailedEmails } from "@/server/email";
import { logger } from "@/server/logger";

/**
 * GET /api/cron/email-retries
 * Cron job to retry failed emails.
 * Protected by CRON_SECRET or INTERNAL_API_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const internalSecret = process.env.INTERNAL_API_SECRET;

  const isValid =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (internalSecret && authHeader === `Bearer ${internalSecret}`);

  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await retryFailedEmails();
    logger.info(result, "email retry cron completed");
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, "email retry cron failed");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
