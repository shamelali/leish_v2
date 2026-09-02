import { getDb, type BookingRow } from "./db";
import { sendReviewRequestEmail } from "./booking-emails";
import { logger } from "./logger";

const MAX_BATCH = 100;
const REVIEW_REQUEST_DELAY_HOURS = 24;

interface ReviewRequestResult {
  requested: number;
  skipped: number;
  errors: number;
}

/**
 * Find completed bookings that are eligible for a review request:
 * - Status is 'completed'
 * - review_requested_at is NULL (not yet requested)
 * - Event date + delay has passed (at least 24h after the event)
 * - No review exists for this booking
 */
async function findReviewableBookings(now: Date): Promise<BookingRow[]> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - REVIEW_REQUEST_DELAY_HOURS * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  return db
    .prepare(
      `SELECT b.*
         FROM bookings b
         WHERE b.status = 'completed'
           AND b.review_requested_at IS NULL
           AND b.date <= ?
           AND NOT EXISTS (
             SELECT 1 FROM reviews r WHERE r.booking_id = b.id
           )
         ORDER BY b.date ASC
         LIMIT ?`,
    )
    .all(cutoffIso, MAX_BATCH) as unknown as BookingRow[];
}

/**
 * Send a review request for a single booking and stamp review_requested_at.
 * Returns true if the request was sent successfully.
 */
async function sendReviewRequest(booking: BookingRow, now: Date): Promise<boolean> {
  const db = getDb();

  try {
    await sendReviewRequestEmail({
      bookingId: booking.id,
      ownerUserId: booking.user_id,
      artistName: booking.artist_name,
      service: booking.service,
      date: booking.date,
      entityId: booking.artist_id,
      entityType: "artist",
    });

    // Stamp review_requested_at to prevent duplicate requests
    await db
      .prepare("UPDATE bookings SET review_requested_at = ? WHERE id = ?")
      .run(now.toISOString(), booking.id);

    return true;
  } catch (err) {
    logger.warn({ err, bookingId: booking.id }, "Failed to send review request email");
    return false;
  }
}

/**
 * Run the review-request sweep: find eligible completed bookings and send
 * review requests. Idempotent — safe to run daily.
 *
 * @param now - Current date (injectable for testing)
 * @returns Summary of the sweep
 */
export async function runReviewRequestSweep(now: Date = new Date()): Promise<ReviewRequestResult> {
  const result: ReviewRequestResult = {
    requested: 0,
    skipped: 0,
    errors: 0,
  };

  const bookings = await findReviewableBookings(now);

  if (bookings.length === 0) {
    logger.debug("No bookings eligible for review requests");
    return result;
  }

  logger.info({ count: bookings.length }, "Processing review requests for completed bookings");

  for (const booking of bookings) {
    const sent = await sendReviewRequest(booking, now);
    if (sent) {
      result.requested++;
    } else {
      result.errors++;
    }
  }

  logger.info(result, "Review request sweep completed");

  return result;
}
