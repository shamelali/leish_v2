import { getDb, type BookingRow, type UserRow } from "./db";
import type { QuotationRow } from "./quotations";
import { sendQuotationRecoveryEmail, notifyBookingStatusChanged } from "./booking-emails";
import { logger } from "./logger";

/**
 * Abandoned-quotation recovery — runs as a daily cron to re-engage clients
 * who let a quotation lapse and to release slots they are unlikely to take.
 *
 * Two phases:
 *
 * 1. Recovery email: an "accepted" booking whose latest active quotation is
 *    "expired" (the client never paid within the 24h window) gets a
 *    "Still interested?" email RECOVERY_DELAY_HOURS after expiry. The send is
 *    stamped on quotation_recovery_sent_at so it happens at most once.
 *
 * 2. Auto-release: if the client still hasn't acted RELEASE_GRACE_DAYS after
 *    expiry (and a recovery email was sent), the booking is cancelled and the
 *    owner notified — freeing the artist's calendar instead of holding a
 *    ghosted slot forever.
 *
 * Bookings with a pending quotation are never touched — the client is still
 * actively deciding. Email/notification failures are non-fatal.
 */

/** Wait this long after expiry before sending the recovery email. */
const RECOVERY_DELAY_HOURS = 24;
/** Cancel the booking this long after expiry if the client never returned. */
const RELEASE_GRACE_DAYS = 7;
/** Safety cap so a single cron run never processes too many rows. */
const MAX_BATCH = 100;

export interface RecoveryResult {
  recovered: number;
  released: number;
  notified: number;
  errors: number;
}

/**
 * Accepted bookings that have at least one expired quotation and nothing
 * pending — i.e. the client walked away after receiving a price.
 */
async function findAbandonedCandidates(): Promise<BookingRow[]> {
  return (await getDb()
    .prepare(
      `SELECT b.*
         FROM bookings b
        WHERE b.status = 'accepted'
          AND EXISTS (
                SELECT 1 FROM quotations q
                 WHERE q.booking_id = b.id AND q.status = 'expired')
          AND NOT EXISTS (
                SELECT 1 FROM quotations q
                 WHERE q.booking_id = b.id AND q.status = 'pending')
        ORDER BY b.created_at ASC
        LIMIT ${MAX_BATCH}`,
    )
    .all()) as unknown as BookingRow[];
}

/** Latest non-superseded quotation for a booking (mirrors getActiveQuotation). */
async function getLatestQuotation(bookingId: string): Promise<QuotationRow | null> {
  const row = (await getDb()
    .prepare(
      `SELECT * FROM quotations
        WHERE booking_id = ? AND status != 'superseded'
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .get(bookingId)) as QuotationRow | undefined;
  return row ?? null;
}

/** Notify the booking owner that their abandoned booking was released. */
async function notifyOwnerOfRelease(booking: BookingRow): Promise<boolean> {
  const owner = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(booking.user_id)) as
    UserRow | undefined;
  if (!owner?.email) return false;
  try {
    await notifyBookingStatusChanged({
      bookingId: booking.id,
      ownerUserId: booking.user_id,
      artistName: booking.artist_name,
      service: booking.service,
      date: booking.date,
      time: booking.time,
      status: "cancelled",
    });
    return true;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), bookingId: booking.id },
      "failed to notify owner of quotation-recovery release",
    );
    return false;
  }
}

/**
 * Run the abandoned-quotation recovery sweep. Idempotent — safe to run daily.
 *
 * @param now - Current time (injectable for testing)
 */
export async function runQuotationRecoverySweep(now: Date = new Date()): Promise<RecoveryResult> {
  const db = getDb();
  const result: RecoveryResult = { recovered: 0, released: 0, notified: 0, errors: 0 };

  const candidates = await findAbandonedCandidates();

  for (const booking of candidates) {
    const latest = await getLatestQuotation(booking.id);
    // A paid (or missing) latest quotation is not an abandonment — skip.
    if (!latest || latest.status !== "expired") continue;

    const hoursSinceExpiry = (now.getTime() - new Date(latest.expires_at).getTime()) / 3_600_000;

    try {
      if (booking.quotation_recovery_sent_at == null) {
        // Phase 1: one recovery email after the grace window.
        if (hoursSinceExpiry < RECOVERY_DELAY_HOURS) continue;
        await sendQuotationRecoveryEmail({
          bookingId: booking.id,
          ownerUserId: booking.user_id,
          artistName: booking.artist_name,
          service: booking.service,
          date: booking.date,
          time: booking.time,
        });
        await db
          .prepare("UPDATE bookings SET quotation_recovery_sent_at = ? WHERE id = ?")
          .run(now.toISOString(), booking.id);
        result.recovered += 1;
      } else if (hoursSinceExpiry >= RELEASE_GRACE_DAYS * 24) {
        // Phase 2: the client never returned — release the slot.
        await db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(booking.id);
        result.released += 1;
        if (await notifyOwnerOfRelease(booking)) result.notified += 1;
      }
    } catch (err) {
      result.errors += 1;
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), bookingId: booking.id },
        "quotation recovery step failed",
      );
    }
  }

  if (result.recovered > 0 || result.released > 0) {
    logger.info(result, "quotation recovery sweep complete");
  }
  return result;
}
