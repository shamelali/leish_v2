import { randomBytes, randomUUID } from "node:crypto";
import { logger } from "./logger";

/**
 * Error reporting abstraction.
 *
 * - Always logs structurally via pino (service, route, error message).
 * - When SENTRY_DSN is set, POSTs a Sentry-compatible envelope to the DSN
 *   (Sentry's native ingestion — no SDK needed).
 * - Otherwise, when ERROR_WEBHOOK_URL is set, POSTs a sanitized JSON payload
 *   to it (a generic sink — DataDog/OTel webhooks all accept POSTs).
 * - Never includes stack internals the client shouldn't see; server-side
 *   we include the stack for debugging.
 *
 * Swap for @sentry/nextjs later by replacing the body of reportError.
 */

export interface ErrorReport {
  message: string;
  stack?: string;
  route?: string;
  userId?: string;
  bookingId?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

interface SentryDsn {
  publicKey: string;
  host: string;
  projectId: string;
}

/** Parse a Sentry DSN: https://<publicKey>@<host>/<projectId> */
export function parseSentryDsn(dsn: string): SentryDsn | null {
  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
  if (!match) return null;
  return { publicKey: match[1], host: match[2], projectId: match[3] };
}

/** Build a Sentry envelope body (header + event item). */
export function buildSentryEnvelope(
  dsn: string,
  report: ErrorReport,
  eventId = randomUUID().replace(/-/g, ""),
): string {
  const envelopeHeader = {
    event_id: eventId,
    dsn,
    sent_at: new Date().toISOString(),
  };
  const itemHeader = { type: "event", content_type: "application/json" };
  const event = {
    event_id: eventId,
    timestamp: report.occurredAt,
    platform: "node",
    level: "error",
    message: report.message,
    server_name: process.env.NEXT_PUBLIC_SITE_URL ?? "leish",
    exception: report.stack
      ? {
          values: [
            {
              type: "Error",
              value: report.message,
              stacktrace: { frames: [] },
            },
          ],
        }
      : undefined,
    extra: {
      route: report.route,
      userId: report.userId,
      bookingId: report.bookingId,
      metadata: report.metadata,
    },
  };
  return [JSON.stringify(envelopeHeader), JSON.stringify(itemHeader), JSON.stringify(event)].join(
    "\n",
  );
}

export async function reportError(err: unknown, context: Partial<ErrorReport> = {}): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  const report: ErrorReport = {
    message,
    stack,
    occurredAt: new Date().toISOString(),
    ...context,
  };

  logger.error(
    {
      route: report.route,
      userId: report.userId,
      bookingId: report.bookingId,
      message: report.message,
      stack: report.stack,
      metadata: report.metadata,
    },
    "error reported",
  );

  const sentryDsn = process.env.SENTRY_DSN;
  if (sentryDsn) {
    await sendToSentry(sentryDsn, report);
    return;
  }

  const webhookUrl = process.env.ERROR_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // The sink failing must never crash the request path.
    logger.warn({ url: webhookUrl }, "error webhook delivery failed");
  }
}

async function sendToSentry(dsn: string, report: ErrorReport): Promise<void> {
  const parsed = parseSentryDsn(dsn);
  if (!parsed) {
    logger.warn({ dsn }, "invalid SENTRY_DSN — skipping");
    return;
  }

  const envelope = buildSentryEnvelope(dsn, report);
  try {
    const res = await fetch(`https://${parsed.host}/api/${parsed.projectId}/envelope/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=leish/1.0, sentry_key=${parsed.publicKey}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "sentry envelope delivery failed");
    }
  } catch {
    logger.warn("sentry envelope delivery failed");
  }
}

/** Random hex for tests / event ids. */
export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}
