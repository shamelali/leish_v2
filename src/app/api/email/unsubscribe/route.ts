import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { logger } from "@/server/logger";
import type { EmailPreferenceKey } from "@/server/email";

const VALID_KEYS: EmailPreferenceKey[] = [
  "booking_created",
  "quotation_sent",
  "invoice_sent",
  "quotation_expiry",
  "balance_reminder",
  "status_changed",
];

/**
 * GET /api/email/unsubscribe?key=<preference>&token=<session_token>
 * One-click unsubscribe link from email footer.
 * Disables the specified preference and redirects to a confirmation page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const token = url.searchParams.get("token");

  if (!key || !VALID_KEYS.includes(key as EmailPreferenceKey)) {
    return NextResponse.json({ error: "Invalid preference key" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Disable the preference
  await db
    .prepare(
      `INSERT INTO email_preferences (user_id, ${key}, updated_at)
       VALUES (?, 0, ?)
       ON CONFLICT(user_id) DO UPDATE SET ${key} = 0, updated_at = ?`,
    )
    .run(payload.sub, now, now);

  logger.info({ userId: payload.sub, key }, "email preference disabled via unsubscribe link");

  // Redirect to settings page with success message
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return NextResponse.redirect(`${siteUrl}/settings/notifications?unsubscribed=${key}`);
}
