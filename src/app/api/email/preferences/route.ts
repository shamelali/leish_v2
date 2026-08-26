import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { enforceSameOrigin } from "@/server/http";
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
 * PATCH /api/email/preferences
 * Update email notification preferences for the authenticated user.
 * Body: { key: EmailPreferenceKey, enabled: boolean }
 */
export async function PATCH(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;

  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { key?: string; enabled?: boolean } | null;
  if (!body || typeof body.key !== "string" || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const key: EmailPreferenceKey = body.key as EmailPreferenceKey;
  if (!VALID_KEYS.includes(key)) {
    return NextResponse.json({ error: "Invalid preference key" }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  // Upsert the preference
  await db
    .prepare(
      `INSERT INTO email_preferences (user_id, ${key}, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET ${key} = ?, updated_at = ?`,
    )
    .run(payload.sub, body.enabled ? 1 : 0, now, body.enabled ? 1 : 0, now);

  logger.info({ userId: payload.sub, key, enabled: body.enabled }, "email preference updated");
  return NextResponse.json({ success: true });
}

/**
 * GET /api/email/preferences
 * Get current email notification preferences for the authenticated user.
 */
export async function GET(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const row = await getDb()
    .prepare("SELECT * FROM email_preferences WHERE user_id = ?")
    .get<Record<string, number>>(payload.sub);

  // Return defaults if no record exists
  const defaults: Record<EmailPreferenceKey, boolean> = {
    booking_created: true,
    quotation_sent: true,
    invoice_sent: true,
    quotation_expiry: true,
    balance_reminder: true,
    status_changed: true,
  };

  if (!row) {
    return NextResponse.json(defaults);
  }

  return NextResponse.json({
    booking_created: row.booking_created === 1,
    quotation_sent: row.quotation_sent === 1,
    invoice_sent: row.invoice_sent === 1,
    quotation_expiry: row.quotation_expiry === 1,
    balance_reminder: row.balance_reminder === 1,
    status_changed: row.status_changed === 1,
  });
}
