import { getConnectToken } from "./connect";
import { logger } from "./logger";
import type { BookingStatus } from "./bookings";

/**
 * Slack notifications via Vercel Connect.
 *
 * Posts booking lifecycle events to a configured Slack channel.
 * No Slack API key lives in env vars — Connect provides runtime tokens.
 *
 * Required env:
 *   SLACK_CHANNEL_ID — target channel (e.g. "C01ABC123")
 *
 * Required Vercel Connect setup:
 *   1. Create a Slack connector in the Vercel dashboard
 *   2. Install the Vercel Slack app in your workspace
 *   3. Link the connector to your project
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
