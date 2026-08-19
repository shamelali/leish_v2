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
}

export type EmailProvider = "dev" | "resend" | "postmark";

export function activeEmailProvider(): EmailProvider {
  const configured = process.env.EMAIL_PROVIDER;
  if (configured === "resend" || configured === "postmark") return configured;
  return "dev";
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
    await resendSend(message, apiKey);
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
    await postmarkSend(message, serverToken);
    return;
  }

  await devSend(message);
}

async function devSend(message: EmailMessage) {
  await getDb()
    .prepare(
      "INSERT INTO email_outbox (id, to_email, subject, text, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(randomUUID(), message.to, message.subject, message.text, new Date().toISOString());
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
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.error({ status: res.status, detail }, "resend email failed");
    throw new Error("Failed to send email");
  }
  logger.info({ to: message.to, subject: message.subject }, "email sent via resend");
}
