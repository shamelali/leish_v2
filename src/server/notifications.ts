import { getConnectToken } from "./connect";
import { logger } from "./logger";
import type { BookingStatus } from "./bookings";

/**
 * Slack notifications via bot token.
 *
 * Posts booking lifecycle events to a configured Slack channel.
 *
 * Required env:
 *   SLACK_CHANNEL_ID — target channel (e.g. "C01ABC123")
 *   SLACK_BOT_TOKEN  — Slack bot token (xoxb-...)
 */

const SLACK_CHANNEL = process.env.SLACK_CHANNEL_ID;

async function postToSlack(message: Record<string, unknown>): Promise<boolean> {
  if (!SLACK_CHANNEL) return false;

  const token = await getConnectToken({ scopes: ["chat:write"] });
  if (!token) return false;

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: SLACK_CHANNEL, ...message }),
    });

    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      logger.warn({ error: data.error }, "slack post failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "slack post failed");
    return false;
  }
}

const STATUS_EMOJI: Record<BookingStatus, string> = {
  requested: "📩",
  accepted: "✅",
  confirmed: "🎉",
  completed: "🏁",
  cancelled: "❌",
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "New booking request",
  accepted: "Booking accepted",
  confirmed: "Booking confirmed (deposit paid)",
  completed: "Booking completed",
  cancelled: "Booking cancelled",
};

export async function notifySlackBookingStatus(params: {
  bookingId: string;
  artistName: string;
  service: string;
  date: string;
  time: string;
  status: BookingStatus;
  clientName?: string;
  price?: number;
}): Promise<void> {
  const emoji = STATUS_EMOJI[params.status];
  const label = STATUS_LABEL[params.status];
  const ref = `#${params.bookingId.slice(0, 8)}`;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://leish.my"}/admin/bookings`;

  await postToSlack({
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${emoji} ${label}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Artist:*\n${params.artistName}` },
          { type: "mrkdwn", text: `*Service:*\n${params.service}` },
          { type: "mrkdwn", text: `*Date:*\n${params.date} at ${params.time}` },
          { type: "mrkdwn", text: `*Reference:*\n${ref}` },
          ...(params.clientName
            ? [{ type: "mrkdwn" as const, text: `*Client:*\n${params.clientName}` }]
            : []),
          ...(params.price != null
            ? [{ type: "mrkdwn" as const, text: `*Price:*\nRM ${(params.price / 100).toFixed(2)}` }]
            : []),
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View in Admin", emoji: true },
            url: dashboardUrl,
          },
        ],
      },
    ],
    text: `${emoji} ${label}: ${params.artistName} — ${params.service} (${params.date}) ${ref}`,
  });
}

export async function notifySlackPayment(params: {
  bookingId: string;
  artistName: string;
  amountSen: number;
  type: "deposit" | "balance";
}): Promise<void> {
  const label = params.type === "deposit" ? "Deposit received" : "Balance payment received";
  const ref = `#${params.bookingId.slice(0, 8)}`;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://leish.my"}/admin/bookings`;

  await postToSlack({
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `💰 ${label}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Artist:*\n${params.artistName}` },
          { type: "mrkdwn", text: `*Amount:*\nRM ${(params.amountSen / 100).toFixed(2)}` },
          { type: "mrkdwn", text: `*Type:*\n${params.type}` },
          { type: "mrkdwn", text: `*Reference:*\n${ref}` },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View in Admin", emoji: true },
            url: dashboardUrl,
          },
        ],
      },
    ],
    text: `💰 ${label}: ${params.artistName} — RM ${(params.amountSen / 100).toFixed(2)} (${params.type}) ${ref}`,
  });
}

export async function notifySlackOverdueBalance(params: {
  bookingId: string;
  artistName: string;
  service: string;
  clientName?: string;
  balanceAmount: number;
}): Promise<void> {
  const ref = `#${params.bookingId.slice(0, 8)}`;
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://leish.my"}/admin/bookings`;

  await postToSlack({
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `🚨 Balance overdue: ${ref}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Artist:*\n${params.artistName}` },
          { type: "mrkdwn", text: `*Service:*\n${params.service}` },
          { type: "mrkdwn", text: `*Amount due:*\nRM ${(params.balanceAmount / 100).toFixed(2)}` },
          { type: "mrkdwn", text: `*Reference:*\n${ref}` },
          ...(params.clientName
            ? [{ type: "mrkdwn" as const, text: `*Client:*\n${params.clientName}` }]
            : []),
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View in Admin", emoji: true },
            url: dashboardUrl,
          },
        ],
      },
    ],
    text: `🚨 Balance overdue: ${params.artistName} — ${params.service} — RM ${(params.balanceAmount / 100).toFixed(2)} ${ref}`,
  });
}

/** Failed-email backlog above which the ops channel is warned (cron). */
export const EMAIL_RETRY_BACKLOG_THRESHOLD = 100;

/**
 * Warn the ops channel that the failed-email retry backlog is growing.
 * Returns `true` when a warning was posted (i.e. the threshold was exceeded),
 * `false` when the backlog is healthy or Slack is unconfigured.
 */
export async function notifySlackEmailRetryBacklog(params: {
  pending: number;
  threshold?: number;
}): Promise<boolean> {
  const threshold = params.threshold ?? EMAIL_RETRY_BACKLOG_THRESHOLD;
  if (params.pending <= threshold) return false;

  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://leish.my"}/admin`;

  return postToSlack({
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "⚠️ Email retry backlog", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Pending retries:*\n${params.pending}` },
          { type: "mrkdwn", text: `*Alert threshold:*\n${threshold}` },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Admin", emoji: true },
            url: dashboardUrl,
          },
        ],
      },
    ],
    text: `⚠️ Email retry backlog: ${params.pending} pending (threshold ${threshold})`,
  });
}

/**
 * Alert the ops channel that a sensitive admin mutation could not be written to
 * the audit trail. Sensitive mutations are fail-closed (`requireAudit`), so this
 * fires exactly when an operator has to reconcile manually.
 */
export async function notifySlackAuditFailure(params: {
  adminUserId: string;
  action: string;
  targetTable: string;
  targetId?: string | null;
  error?: string;
}): Promise<boolean> {
  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://leish.my"}/admin/audit`;
  const target = params.targetId ? `${params.targetTable}#${params.targetId}` : params.targetTable;

  return postToSlack({
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🚨 Audit write failed", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `A sensitive admin action was *blocked* because it could not be audited. ` +
            `The underlying mutation was rolled back — reconcile manually.`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Action:*\n${params.action}` },
          { type: "mrkdwn", text: `*Target:*\n${target}` },
          { type: "mrkdwn", text: `*Admin user:*\n${params.adminUserId}` },
          ...(params.error
            ? [{ type: "mrkdwn" as const, text: `*Error:*\n${params.error.slice(0, 200)}` }]
            : []),
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Audit Log", emoji: true },
            url: dashboardUrl,
          },
        ],
      },
    ],
    text: `🚨 Audit write failed for ${params.action} on ${target} (admin ${params.adminUserId})`,
  });
}

export async function notifySlackPayoutSummary(params: {
  settled: number;
  failed: number;
  pendingRemaining: number;
}): Promise<void> {
  if (params.settled === 0 && params.failed === 0) return;

  const dashboardUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://leish.my"}/admin/payouts`;

  await postToSlack({
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "💰 Payout Automation Summary", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Auto-settled:*\n${params.settled}` },
          { type: "mrkdwn", text: `*Failed:*\n${params.failed}` },
          { type: "mrkdwn", text: `*Still pending:*\n${params.pendingRemaining}` },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Payouts", emoji: true },
            url: dashboardUrl,
          },
        ],
      },
    ],
    text: `💰 Payout automation: ${params.settled} settled, ${params.failed} failed, ${params.pendingRemaining} pending`,
  });
}
