import { randomUUID } from "node:crypto";
import { getDb, bind } from "./db";
import { logger } from "./logger";
import {
  computeCommission,
  getBookingFeeSen,
  getCommissionRateBps,
  getCommissionWaiverSen,
} from "./settings";

/**
 * Artist payouts — the settlement side of the hybrid model.
 *
 * When the balance payment for a confirmed booking is paid, a payout row is
 * created. Money flow: the client pays the full quoted price to the platform
 * (deposit + balance); the platform keeps the non-refundable deposit plus the
 * commission, and remits the remainder to the artist:
 *
 *     net_sen = quote_total − commission − deposit
 *
 * e.g. RM 1,000 quote @10%: client pays 1,000; platform keeps 50 + 100;
 * artist receives 850.
 *
 * Payouts become settleable 24h after the event date (dispute window) and are
 * settled manually via /admin/payouts (DuitNow/bank transfer, tracked).
 */

export type PayoutStatus = "pending" | "settled" | "failed";

export interface PayoutRow {
  id: string;
  artist_user_id: string | null;
  booking_id: string;
  gross_sen: number;
  commission_sen: number;
  net_sen: number;
  status: PayoutStatus;
  settleable_at: string | null;
  settled_at: string | null;
  notes: string | null;
  created_at: string;
}

/** The claimed artist/studio user for a catalog entity, if any. Handles Option B studio_id. */
async function artistUserIdForBooking(
  artistId: string,
  studioId?: string | null,
): Promise<string | null> {
  if (studioId) {
    const sRow = (await getDb()
      .prepare("SELECT user_id FROM studio_profiles WHERE studio_id = ?")
      .get(studioId)) as { user_id: string } | undefined;
    if (sRow?.user_id) return sRow.user_id;
  }
  const row = (await getDb()
    .prepare("SELECT user_id FROM artist_profiles WHERE artist_id = ?")
    .get(artistId)) as { user_id: string } | undefined;
  if (row?.user_id) return row.user_id;
  // Legacy: studio claimed an artist — check studio_profiles for artist_id as studio_id fallback
  if (studioId) {
    const fallback = (await getDb()
      .prepare("SELECT user_id FROM studio_profiles WHERE studio_id = ?")
      .get(artistId)) as { user_id: string } | undefined;
    return fallback?.user_id ?? null;
  }
  return null;
}

/**
 * Create the payout for a fully-paid booking. Idempotent: returns the
 * existing payout if one is already recorded for the booking.
 */
export async function createPayoutForBooking(
  bookingId: string,
  input: {
    artistId: string;
    studioId?: string | null;
    eventDate: string | null;
    quoteTotalSen: number;
  },
): Promise<PayoutRow | null> {
  const db = await getDb();

  const existing = (await db
    .prepare("SELECT * FROM payouts WHERE booking_id = ?")
    .get(bookingId)) as PayoutRow | undefined;
  if (existing) return existing;

  const [rateBps, waiverSen, depositSen] = await Promise.all([
    getCommissionRateBps(),
    getCommissionWaiverSen(),
    getBookingFeeSen(),
  ]);
  // Commission applies to the full quote total; the platform keeps the
  // non-refundable deposit on top. Artist net = total − commission − deposit.
  const breakdown = computeCommission(input.quoteTotalSen, rateBps, waiverSen);
  const artistReceivesSen = Math.max(0, breakdown.artistNetSen - depositSen);
  const settleableAt = input.eventDate
    ? new Date(new Date(`${input.eventDate}T00:00:00`).getTime() + 24 * 3_600_000).toISOString()
    : null;

  const artistUserId = await artistUserIdForBooking(input.artistId, input.studioId ?? null);

  const row: PayoutRow = {
    id: randomUUID(),
    artist_user_id: artistUserId,
    booking_id: bookingId,
    gross_sen: breakdown.totalSen,
    commission_sen: breakdown.commissionSen,
    net_sen: artistReceivesSen,
    status: "pending",
    settleable_at: settleableAt,
    settled_at: null,
    notes: breakdown.waived ? "Commission waived (small booking)" : null,
    created_at: new Date().toISOString(),
  };

  await db
    .prepare(
      `INSERT INTO payouts (id, artist_user_id, booking_id, gross_sen, commission_sen, net_sen, status, settleable_at, settled_at, notes, created_at)
       VALUES (@id, @artist_user_id, @booking_id, @gross_sen, @commission_sen, @net_sen, @status, @settleable_at, @settled_at, @notes, @created_at)`,
    )
    .run(bind(row));

  logger.info(
    {
      bookingId,
      payoutId: row.id,
      gross: row.gross_sen,
      commission: row.commission_sen,
      net: row.net_sen,
      waived: breakdown.waived,
    },
    "artist payout created",
  );
  return row;
}

export async function listPayouts(
  status?: string,
): Promise<(PayoutRow & { artist_name: string | null; service: string; event_date: string })[]> {
  const rows = status
    ? await getDb()
        .prepare(
          `SELECT p.*, b.artist_name, b.service, b.date AS event_date
           FROM payouts p JOIN bookings b ON b.id = p.booking_id
           WHERE p.status = ? ORDER BY p.created_at DESC`,
        )
        .all(status)
    : await getDb()
        .prepare(
          `SELECT p.*, b.artist_name, b.service, b.date AS event_date
           FROM payouts p JOIN bookings b ON b.id = p.booking_id
           ORDER BY p.created_at DESC`,
        )
        .all();
  return rows as unknown as (PayoutRow & {
    artist_name: string | null;
    service: string;
    event_date: string;
  })[];
}

/** Settle (or fail) a payout — admin action, audit-logged by the caller. */
export async function updatePayoutStatus(
  payoutId: string,
  status: Exclude<PayoutStatus, "pending">,
  notes?: string,
): Promise<PayoutRow | null> {
  const result = await getDb()
    .prepare(
      `UPDATE payouts SET status = ?, settled_at = ?, notes = COALESCE(?, notes) WHERE id = ?`,
    )
    .run(status, status === "settled" ? new Date().toISOString() : null, notes ?? null, payoutId);
  if (result.changes === 0) return null;
  return (
    ((await getDb().prepare("SELECT * FROM payouts WHERE id = ?").get(payoutId)) as
      PayoutRow | undefined) ?? null
  );
}
