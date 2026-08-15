import { NextResponse } from "next/server";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { getActiveQuotation } from "@/server/quotations";
import { sendBalanceReminder } from "@/server/booking-emails";
import { tryRoute } from "@/server/http";
import { logger } from "@/server/logger";

const BOOKING_FEE_SEN = 20_000;
const BALANCE_DUE_DAYS_BEFORE = 3;
const REMINDER_WINDOW_DAYS = 4; // email when due within 4 days (or overdue < 2)
const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // max one per 7 days

/**
 * POST /api/cron/balance-reminders
 * Automatically reminds clients whose remaining balance is due soon
 * (3 days before the event, per the business rule). One email per booking
 * per 7-day window (tracked by bookings.balance_reminder_at).
 * Guarded by the CRON_SECRET header like the other cron.
 */
export const POST = tryRoute(
  async function POST(request: Request) {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get("x-cron-secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const today = new Date();
    const dueWindowStart = new Date(today.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
    const dueWindowEnd = new Date(today.getTime() + REMINDER_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const rows = (await db
      .prepare("SELECT * FROM bookings WHERE status = 'confirmed' AND date >= ? AND date <= ?")
      .all(dueWindowStart, dueWindowEnd)) as unknown as BookingRow[];

    let reminded = 0;
    let skipped = 0;

    for (const booking of rows) {
      // Only when there is an outstanding balance.
      const quotation = await getActiveQuotation(booking.id);
      if (!quotation || quotation.status === "expired") {
        skipped += 1;
        continue;
      }
      const balanceAmount = Math.max(0, quotation.total - BOOKING_FEE_SEN);
      if (balanceAmount <= 0) {
        skipped += 1;
        continue;
      }

      // Cooldown: skip if reminded recently.
      if (booking.balance_reminder_at) {
        const last = new Date(booking.balance_reminder_at).getTime();
        if (Date.now() - last < REMINDER_COOLDOWN_MS) {
          skipped += 1;
          continue;
        }
      }

      const balanceDueDate = new Date(
        new Date(`${booking.date}T00:00:00`).getTime() - BALANCE_DUE_DAYS_BEFORE * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);

      const owner = (await db.prepare("SELECT * FROM users WHERE id = ?").get(booking.user_id)) as
        UserRow | undefined;
      if (!owner) {
        skipped += 1;
        continue;
      }

      await sendBalanceReminder({
        bookingId: booking.id,
        ownerUserId: booking.user_id,
        artistName: booking.artist_name,
        service: booking.service,
        date: booking.date,
        balanceAmount,
        balanceDueDate,
      });
      await db
        .prepare("UPDATE bookings SET balance_reminder_at = ? WHERE id = ?")
        .run(new Date().toISOString(), booking.id);
      reminded += 1;
    }

    logger.info({ candidates: rows.length, reminded, skipped }, "balance reminder sweep complete");
    return NextResponse.json({ candidates: rows.length, reminded, skipped });
  },
  { route: "POST /api/cron/balance-reminders" },
);
