import { getDb, type BookingRow, type UserRow } from "./db";
import { getActiveQuotation } from "./quotations";
import { sendBalanceReminder, sendBalanceOverdueEmail } from "./booking-emails";
import { notifySlackOverdueBalance } from "./notifications";
import { getBookingFeeSen } from "./settings";
import { getPaymentForBooking } from "./payments";
import { logger } from "./logger";

/**
 * Automated balance-payment reminders — runs as a daily cron to chase
 * outstanding balances without admin intervention.
 *
 * Two phases:
 *
 * 1. Remind — "confirmed" bookings whose balance is due soon (3 days before
 *    the event, per the business rule). One email per booking per 7-day
 *    window (tracked by `bookings.balance_reminder_at`).
 *
 * 2. Escalate — "completed" bookings whose event date has passed while the
 *    balance is still unpaid. Sends the client a final overdue notice AND
 *    alerts the admin team on Slack. Tracked by `bookings.balance_escalated_at`
 *    so a completed booking is only escalated once.
 *
 * The escalation phase closes the loop with booking-transitions.ts: once a
 * past-dated booking is auto-completed, the reminder phase would ignore it —
 * this sweep makes sure the unpaid balance is still chased.
 */

/** Reminder window: email when due within 4 days (or overdue < 2). */
const REMINDER_WINDOW_DAYS = 4;
/** Balance due is 3 days before the event. */
const BALANCE_DUE_DAYS_BEFORE = 3;
/** Max one reminder email per 7 days per booking. */
const REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export interface BalanceReminderSweepResult {
  /** Confirmed bookings in the reminder window considered in phase 1. */
  candidates: number;
  /** Reminder emails sent (phase 1). */
  reminded: number;
  /** Bookings escalated to client + admin (phase 2). */
  escalated: number;
  /** Bookings skipped because they had no quota / paid / zero balance / cooldown. */
  skipped: number;
}
/** Outstanding balance for a booking, or null when there is no active quotation. */
async function balanceDue(booking: BookingRow, bookingFeeSen: number): Promise<number | null> {
  const quotation = await getActiveQuotation(booking.id);
  if (!quotation || quotation.status === "expired") return null;
  return Math.max(0, quotation.total - bookingFeeSen);
}

/** True when a balance payment is already settled (paid or refunded) on-platform. */
async function balanceSettled(bookingId: string): Promise<boolean> {
  const balancePayment = await getPaymentForBooking(bookingId, "balance");
  return (
    balancePayment !== null &&
    (balancePayment.status === "paid" || balancePayment.status === "refunded")
  );
}

/**
 * Run both reminder phases and return a combined summary. Idempotent — each
 * sweep only touches bookings that haven't been reminded recently or already
 * escalated.
 */
export async function runBalanceReminderSweep(): Promise<BalanceReminderSweepResult> {
  const db = getDb();
  const bookingFeeSen = await getBookingFeeSen();
  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);

  const dueWindowStart = new Date(now - 2 * 86_400_000).toISOString().slice(0, 10);
  const dueWindowEnd = new Date(now + REMINDER_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  let reminded = 0;
  let escalated = 0;
  let skipped = 0;

  // ── Phase 1: remind confirmed bookings whose balance is due within the window.
  const candidates = (await db
    .prepare("SELECT * FROM bookings WHERE status = 'confirmed' AND date >= ? AND date <= ?")
    .all(dueWindowStart, dueWindowEnd)) as unknown as BookingRow[];

  for (const booking of candidates) {
    const balanceAmount = await balanceDue(booking, bookingFeeSen);
    if (balanceAmount === null || balanceAmount <= 0) {
      skipped += 1;
      continue;
    }
    if (await balanceSettled(booking.id)) {
      skipped += 1;
      continue;
    }
    // Cooldown: skip if reminded recently.
    if (booking.balance_reminder_at) {
      const last = new Date(booking.balance_reminder_at).getTime();
      if (now - last < REMINDER_COOLDOWN_MS) {
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
      .run(new Date(now).toISOString(), booking.id);
    reminded += 1;
  }
  // ── Phase 2: escalate completed bookings with an unpaid balance (once).
  const escalatable = (await db
    .prepare(
      "SELECT * FROM bookings WHERE status = 'completed' AND date < ? AND balance_escalated_at IS NULL",
    )
    .all(todayIso)) as unknown as BookingRow[];

  for (const booking of escalatable) {
    const balanceAmount = await balanceDue(booking, bookingFeeSen);
    if (balanceAmount === null || balanceAmount <= 0) {
      skipped += 1;
      continue;
    }
    if (await balanceSettled(booking.id)) {
      skipped += 1;
      continue;
    }

    const owner = (await db.prepare("SELECT * FROM users WHERE id = ?").get(booking.user_id)) as
      UserRow | undefined;
    if (!owner) {
      skipped += 1;
      continue;
    }

    await sendBalanceOverdueEmail({
      bookingId: booking.id,
      ownerUserId: booking.user_id,
      artistName: booking.artist_name,
      service: booking.service,
      date: booking.date,
      balanceAmount,
    });
    await notifySlackOverdueBalance({
      bookingId: booking.id,
      artistName: booking.artist_name,
      service: booking.service,
      clientName: owner.name,
      balanceAmount,
    });
    await db
      .prepare("UPDATE bookings SET balance_escalated_at = ?, balance_reminder_at = ? WHERE id = ?")
      .run(new Date(now).toISOString(), new Date(now).toISOString(), booking.id);
    escalated += 1;
  }

  logger.info(
    {
      candidates: candidates.length,
      escalatable: escalatable.length,
      reminded,
      escalated,
      skipped,
    },
    "balance reminder sweep complete",
  );
  return {
    candidates: candidates.length,
    reminded,
    escalated,
    skipped,
  };
}
