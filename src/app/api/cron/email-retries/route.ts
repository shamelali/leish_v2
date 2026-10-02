import { NextResponse } from "next/server";
import { authorizeCron } from "@/server/cron-auth";
import { countPendingEmailRetries, retryFailedEmails } from "@/server/email";
import { tryRoute } from "@/server/http";
import { logger } from "@/server/logger";
import {
  EMAIL_RETRY_BACKLOG_THRESHOLD,
  notifySlackEmailRetryBacklog,
} from "@/server/notifications";

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

    const startedAt = Date.now();
    const result = await retryFailedEmails();
    const pending = await countPendingEmailRetries();
    const backlog = pending > EMAIL_RETRY_BACKLOG_THRESHOLD;

    logger.info(
      {
        ...result,
        pending,
        backlog,
        durationMs: Date.now() - startedAt,
        processedCount: result.retried,
      },
      "email retry cron completed",
    );

    if (backlog) {
      logger.warn(
        { pending, threshold: EMAIL_RETRY_BACKLOG_THRESHOLD },
        "email retry backlog exceeds threshold — alerting Slack",
      );
      await notifySlackEmailRetryBacklog({ pending });
    }

    return NextResponse.json({ ...result, pending, backlog });
  },
  { route: "/api/cron/email-retries" },
);

export const GET = handler;
export const POST = handler;
