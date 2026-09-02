import { getDb, type BookingRow, type UserRow } from "./db";
import { notifyBookingStatusChanged } from "./booking-emails";
import { logger } from "./logger";

/**
 * Automated booking status transitions — runs as a cron job to reduce
 * manual admin work for stale or overdue bookings.
 *
 * Two automatic transitions:
 *
 * 1. Auto-complete: a "confirmed" booking whose event date has passed is
 *    moved to "completed". This ensures payouts become settleable on time
 *    and artists don't have to manually mark every past job done.
 *
 * 2. Auto-cancel: a "requested" booking with no artist action for 48 hours
 *    is moved to "cancelled". This frees artist calendars and prevents
 *    stale requests from accumulating.
 *
 * Both transitions send a notification email to the booking owner.
 */

/** Stale "requested" bookings older than this are auto-cancelled. */
const STALE_REQUEST_HOURS = 48;
/** Safety cap so a single cron run never processes too many rows. */
const MAX_BATCH = 200;

interface TransitionResult {
  bookingId: string;
  fromStatus: string;
  toStatus: BookingRow["status"];
  notified: boolean;
}

/**
 * Auto-complete confirmed bookings whose event date has already passed.
 */
export async function autoCompletePastBookings(): Promise<TransitionResult[]> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Date column is TEXT 'YYYY-MM-DD'; past events have date < today.
  const rows = (await db
    .prepare(
      `SELECT * FROM bookings
       WHERE status = 'confirmed' AND date < ?
       ORDER BY date ASC
       LIMIT ${MAX_BATCH}`,
    )
    .all(today)) as BookingRow[];

  const results: TransitionResult[] = [];
  for (const booking of rows) {
    const notified = await transitionWithNotification(booking, "completed");
    results.push({
      bookingId: booking.id,
      fromStatus: "confirmed",
      toStatus: "completed",
      notified,
    });
  }

  if (rows.length > 0) {
    logger.info({ completed: rows.length }, "auto-completed past bookings");
  }
  return results;
}

/**
 * Auto-cancel "requested" bookings that have been waiting for artist response
 * longer than STALE_REQUEST_HOURS.
 */
export async function autoCancelStaleBookings(): Promise<TransitionResult[]> {
  const db = getDb();
  const cutoff = new Date(Date.now() - STALE_REQUEST_HOURS * 3_600_000).toISOString();

  // Only "requested" — "accepted" bookings are still being negotiated.
  const rows = (await db
    .prepare(
      `SELECT * FROM bookings
       WHERE status = 'requested' AND created_at < ?
       ORDER BY created_at ASC
       LIMIT ${MAX_BATCH}`,
    )
    .all(cutoff)) as BookingRow[];

  const results: TransitionResult[] = [];
  for (const booking of rows) {
    const notified = await transitionWithNotification(booking, "cancelled");
    results.push({
      bookingId: booking.id,
      fromStatus: "requested",
      toStatus: "cancelled",
      notified,
    });
  }

  if (rows.length > 0) {
    logger.info({ cancelled: rows.length }, "auto-cancelled stale bookings");
  }
  return results;
}

/**
 * Update the booking status and notify the owner.
 */
async function transitionWithNotification(
  booking: BookingRow,
  newStatus: BookingRow["status"],
): Promise<boolean> {
  const db = getDb();
  await db.prepare(`UPDATE bookings SET status = ? WHERE id = ?`).run(newStatus, booking.id);

  let notified = false;
  const owner = (await db.prepare("SELECT * FROM users WHERE id = ?").get(booking.user_id)) as
    UserRow | undefined;

  if (owner?.email) {
    try {
      await notifyBookingStatusChanged({
        bookingId: booking.id,
        ownerUserId: booking.user_id,
        artistName: booking.artist_name,
        service: booking.service,
        date: booking.date,
        time: booking.time,
        status: newStatus,
      });
      notified = true;
    } catch (err) {
      // Email failure is non-fatal — the status transition still stands.
      logger.error(
        { err: err instanceof Error ? err.message : String(err), bookingId: booking.id },
        "failed to notify owner of auto-transition",
      );
    }
  }

  return notified;
}

/**
 * Run all automated transitions and return a combined summary.
 */
export async function runAllAutoTransitions(): Promise<{
  completed: number;
  cancelled: number;
  notified: number;
}> {
  const completed = await autoCompletePastBookings();
  const cancelled = await autoCancelStaleBookings();

  const notified = [...completed, ...cancelled].filter((r) => r.notified).length;

  return {
    completed: completed.length,
    cancelled: cancelled.length,
    notified,
  };
}
