import { getDb } from "./db";
import { logger } from "./logger";
import { updatePayoutStatus, type PayoutRow } from "./payouts";
import { notifyPayoutSettled } from "./booking-emails";
import { notifySlackPayoutSummary } from "./notifications";

/**
 * Payout Automation
 *
 * Two-phase sweep that runs daily via cron:
 *
 * 1. Auto-settle: Finds payouts that are `pending` and past their
 *    `settleable_at` date (24h after the event). These are auto-settled
 *    and the artist is notified — no manual admin action required.
 *
 * 2. Admin summary: Posts a summary of settled + still-pending payouts
 *    to Slack so the finance team stays informed.
 *
 * Business value:
 * - Artists get paid on time without manual admin work
 * - Finance team gets daily visibility into payout status
 * - Reduces payout settlement latency from days to hours
 */

const MAX_BATCH = 100;

export interface PayoutAutomationResult {
  settled: number;
  notified: number;
  failed: number;
  pendingRemaining: number;
}

/**
 * Find payouts that are ready to be auto-settled.
 * These are `pending` payouts where `settleable_at <= now`.
 */
async function findSettleablePayouts(): Promise<PayoutRow[]> {
  const now = new Date().toISOString();
  const rows = await getDb()
    .prepare(
      `SELECT * FROM payouts
       WHERE status = 'pending'
         AND settleable_at IS NOT NULL
         AND settleable_at <= ?
       ORDER BY settleable_at ASC
       LIMIT ?`,
    )
    .all(now, MAX_BATCH);
  return rows as unknown as PayoutRow[];
}

/**
 * Auto-settle a single payout and notify the artist.
 * Returns true if the payout was settled successfully.
 */
async function autoSettlePayout(payout: PayoutRow): Promise<boolean> {
  try {
    const updated = await updatePayoutStatus(payout.id, "settled", "Auto-settled by system");
    if (!updated) {
      logger.warn({ payoutId: payout.id }, "auto-settle: payout not found during update");
      return false;
    }

    // Notify the artist (best-effort — don't fail the settlement if email fails)
    if (payout.artist_user_id) {
      try {
        const booking = (await getDb()
          .prepare("SELECT service, date FROM bookings WHERE id = ?")
          .get(payout.booking_id)) as { service: string; date: string } | undefined;
        if (booking) {
          await notifyPayoutSettled({
            artistUserId: payout.artist_user_id,
            service: booking.service,
            eventDate: booking.date,
            netSen: payout.net_sen,
          });
        }
      } catch (err) {
        logger.warn(
          { payoutId: payout.id, err: err instanceof Error ? err.message : String(err) },
          "auto-settle: artist notification failed",
        );
      }
    }

    logger.info(
      { payoutId: payout.id, bookingId: payout.booking_id, net: payout.net_sen },
      "payout auto-settled",
    );
    return true;
  } catch (err) {
    logger.error(
      { payoutId: payout.id, err: err instanceof Error ? err.message : String(err) },
      "auto-settle: unexpected error",
    );
    return false;
  }
}

/**
 * Count payouts still pending (for admin summary).
 */
async function countPendingPayouts(): Promise<number> {
  const row = (await getDb()
    .prepare("SELECT COUNT(*) as count FROM payouts WHERE status = 'pending'")
    .get()) as { count: number };
  return row.count;
}

/**
 * Run the full payout automation sweep.
 * Auto-settles eligible payouts and sends admin summary.
 */
export async function runPayoutAutomation(): Promise<PayoutAutomationResult> {
  const result: PayoutAutomationResult = {
    settled: 0,
    notified: 0,
    failed: 0,
    pendingRemaining: 0,
  };

  const settleable = await findSettleablePayouts();

  for (const payout of settleable) {
    const success = await autoSettlePayout(payout);
    if (success) {
      result.settled++;
      if (payout.artist_user_id) result.notified++;
    } else {
      result.failed++;
    }
  }

  result.pendingRemaining = await countPendingPayouts();

  // Post admin summary to Slack (best-effort)
  try {
    await notifySlackPayoutSummary({
      settled: result.settled,
      failed: result.failed,
      pendingRemaining: result.pendingRemaining,
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "payout automation: slack summary failed",
    );
  }

  logger.info(result, "payout automation sweep complete");
  return result;
}
