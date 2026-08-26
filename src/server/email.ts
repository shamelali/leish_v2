import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { logger } from "./logger";

/**
 * Email delivery abstraction.
 *
 * Providers:
 * - "dev" (default): stores messages in the `email_outbox` table and logs
 *   them. View them at /dev/emails (dev builds only).
 * - "resend": sends via the Resend API. Configure RESEND_API_KEY and set
 *   EMAIL_PROVIDER=resend.
 * - "postmark": sends via the Postmark API. Configure POSTMARK_SERVER_TOKEN
 *   and EMAIL_FROM, set EMAIL_PROVIDER=postmark.
 * If a provider's key is missing we fall back to dev with a warning so
 * local/CI runs never fail on misconfiguration.
 *
 * Swap in SES by adding a branch — callers just use sendEmail().
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type EmailProvider = "dev" | "resend" | "postmark" | "brevo";

export type EmailPreferenceKey =
  | "booking_created"
  | "quotation_sent"
  | "invoice_sent"
  | "quotation_expiry"
  | "balance_reminder"
  | "status_changed";

/**
 * Check if a user has a specific email preference enabled.
 * Returns true if the preference is enabled or if no preference record exists
 * (default: enabled).
 */
export async function isEmailEnabled(userId: string, key: EmailPreferenceKey): Promise<boolean> {
  const row = (await getDb()
    .prepare(`SELECT ${key} FROM email_preferences WHERE user_id = ?`)
    .get(userId)) as Record<string, number> | undefined;
  // Default to enabled if no record exists
  return row ? row[key] === 1 : true;
}

import { getActiveEmailProvider } from "./integrations";

export function activeEmailProvider(): EmailProvider {
  return getActiveEmailProvider();
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const provider = activeEmailProvider();

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      logger.warn(
        { to: message.to },
        "EMAIL_PROVIDER=resend but RESEND_API_KEY is not set — falling back to dev outbox",
      );
      await devSend(message);
      return;
    }
    try {
      await resendSend(message, apiKey);
    } catch (err) {
      await queueRetry(message, err);
      throw err;
    }
    return;
  }

  if (provider === "postmark") {
    const serverToken = process.env.POSTMARK_SERVER_TOKEN;
    if (!serverToken) {
      logger.warn(
        { to: message.to },
        "EMAIL_PROVIDER=postmark but POSTMARK_SERVER_TOKEN is not set — falling back to dev outbox",
      );
      await devSend(message);
      return;
    }
    try {
      await postmarkSend(message, serverToken);
    } catch (err) {
      await queueRetry(message, err);
      throw err;
    }
    return;
  }

  await devSend(message);
}

async function devSend(message: EmailMessage) {
  await getDb()
    .prepare(
      "INSERT INTO email_outbox (id, to_email, subject, text, html, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      randomUUID(),
      message.to,
      message.subject,
      message.text,
      message.html ?? null,
      new Date().toISOString(),
    );
  logger.info({ to: message.to, subject: message.subject }, "email queued (dev outbox)");
}

async function postmarkSend(message: EmailMessage, serverToken: string) {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": serverToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      From: process.env.EMAIL_FROM ?? "Leish! <no-reply@leish.my>",
      To: message.to,
      Subject: message.subject,
      TextBody: message.text,
      HtmlBody: message.html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.error({ status: res.status, detail }, "postmark email failed");
    throw new Error("Failed to send email");
  }
  logger.info({ to: message.to, subject: message.subject }, "email sent via postmark");
}

async function resendSend(message: EmailMessage, apiKey: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Leish! <no-reply@leish.my>",
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.error({ status: res.status, detail }, "resend email failed");
    throw new Error("Failed to send email");
  }
  logger.info({ to: message.to, subject: message.subject }, "email sent via resend");
}

/**
 * Queue a failed email for retry.
 * Exponential backoff: 1min, 5min, 25min (max 3 attempts).
 */
async function queueRetry(message: EmailMessage, error: unknown): Promise<void> {
  const now = new Date();
  const nextRetry = new Date(now.getTime() + 60_000); // 1 minute from now
  const errorMessage = error instanceof Error ? error.message : String(error);

  await getDb()
    .prepare(
      `INSERT INTO email_retries (id, to_email, subject, text, html, attempts, max_attempts, next_retry, last_error, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 3, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      message.to,
      message.subject,
      message.text,
      message.html ?? null,
      nextRetry.toISOString(),
      errorMessage,
      now.toISOString(),
    );
  logger.warn({ to: message.to, subject: message.subject }, "email queued for retry");
}

/**
 * Retry failed emails that are past their next_retry time.
 * Called by cron job or on-demand.
 */
export async function retryFailedEmails(): Promise<{ retried: number; failed: number }> {
  const now = new Date().toISOString();
  const rows = (await getDb()
    .prepare(
      "SELECT * FROM email_retries WHERE next_retry <= ? AND attempts < max_attempts ORDER BY created_at LIMIT 10",
    )
    .all(now)) as Array<{
    id: string;
    to_email: string;
    subject: string;
    text: string;
    html: string | null;
    attempts: number;
  }>;

  let retried = 0;
  let failed = 0;

  for (const row of rows) {
    const message: EmailMessage = {
      to: row.to_email,
      subject: row.subject,
      text: row.text,
      html: row.html ?? undefined,
    };

    try {
      await sendEmail(message);
      // Success — remove from retries
      await getDb().prepare("DELETE FROM email_retries WHERE id = ?").run(row.id);
      retried++;
      logger.info({ id: row.id, to: row.to_email }, "retry succeeded");
    } catch (err) {
      // Increment attempts and schedule next retry with exponential backoff
      const attempts = row.attempts + 1;
      const backoffMs = Math.pow(5, attempts) * 60_000; // 5min, 25min, 125min
      const nextRetry = new Date(Date.now() + backoffMs);
      const errorMessage = err instanceof Error ? err.message : String(err);

      await getDb()
        .prepare(
          "UPDATE email_retries SET attempts = ?, next_retry = ?, last_error = ? WHERE id = ?",
        )
        .run(attempts, nextRetry.toISOString(), errorMessage, row.id);
      failed++;
      logger.warn({ id: row.id, attempts, nextRetry: nextRetry.toISOString() }, "retry failed");
    }
  }

  return { retried, failed };
}
