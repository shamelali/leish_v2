import { randomUUID } from "node:crypto";
import { getDb, bind } from "./db";

/**
 * Quotations — the MUA's price breakdown sent to the client after
 * accepting a request. Business rules:
 * - Line items: base fee, travel, early call, accommodation + extras.
 * - The client has a 24-hour window to accept (pay the RM 200 fee);
 *   the quotation expires if no action is taken.
 * - Sending a new quotation supersedes the previous one.
 */

export const QUOTATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ExtraItem {
  label: string;
  amount: number; // sen
}

export interface QuotationRow {
  id: string;
  booking_id: string;
  base_fee: number;
  travel_fee: number;
  early_call_fee: number;
  accommodation_fee: number;
  extras: string; // JSON array of ExtraItem
  artist_note: string | null;
  total: number;
  status: "pending" | "paid" | "expired" | "superseded";
  created_at: string;
  expires_at: string;
}

export interface QuotationInput {
  baseFee: number;
  travelFee?: number;
  earlyCallFee?: number;
  accommodationFee?: number;
  extras?: ExtraItem[];
  artistNote?: string;
}

/** Sum of all line items (sen). */
export function quotationTotal(input: QuotationInput): number {
  const extras = (input.extras ?? []).reduce((sum, e) => sum + e.amount, 0);
  return (
    input.baseFee +
    (input.travelFee ?? 0) +
    (input.earlyCallFee ?? 0) +
    (input.accommodationFee ?? 0) +
    extras
  );
}

export function isQuotationExpired(row: Pick<QuotationRow, "expires_at" | "status">): boolean {
  return row.status === "pending" && new Date(row.expires_at).getTime() < Date.now();
}

/** Create a quotation for a booking, superseding any previous pending one. */
export async function createQuotation(
  bookingId: string,
  input: QuotationInput,
): Promise<QuotationRow> {
  const db = await getDb();
  const now = new Date();

  // Supersede any outstanding pending quotation.
  await db
    .prepare(
      "UPDATE quotations SET status = 'superseded' WHERE booking_id = ? AND status = 'pending'",
    )
    .run(bookingId);

  const row: QuotationRow = {
    id: randomUUID(),
    booking_id: bookingId,
    base_fee: input.baseFee,
    travel_fee: input.travelFee ?? 0,
    early_call_fee: input.earlyCallFee ?? 0,
    accommodation_fee: input.accommodationFee ?? 0,
    extras: JSON.stringify(input.extras ?? []),
    artist_note: input.artistNote ?? null,
    total: quotationTotal(input),
    status: "pending",
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + QUOTATION_TTL_MS).toISOString(),
  };

  await db
    .prepare(
      `INSERT INTO quotations (id, booking_id, base_fee, travel_fee, early_call_fee, accommodation_fee, extras, artist_note, total, status, created_at, expires_at)
     VALUES (@id, @booking_id, @base_fee, @travel_fee, @early_call_fee, @accommodation_fee, @extras, @artist_note, @total, @status, @created_at, @expires_at)`,
    )
    .run(bind(row));

  return row;
}

/** All pending quotations that have passed their 24h window. */
export async function findExpiredQuotations(): Promise<QuotationRow[]> {
  const now = new Date().toISOString();
  const rows = await getDb()
    .prepare("SELECT * FROM quotations WHERE status = 'pending' AND expires_at < ?")
    .all(now);
  return rows as unknown as QuotationRow[];
}

/** Mark a quotation expired; returns true if a row changed. */
export async function markQuotationExpired(id: string): Promise<boolean> {
  const result = await getDb()
    .prepare("UPDATE quotations SET status = 'expired' WHERE id = ? AND status = 'pending'")
    .run(id);
  return result.changes > 0;
}

/** The active (latest non-superseded) quotation for a booking, if any. */
export async function getActiveQuotation(bookingId: string): Promise<QuotationRow | null> {
  const db = await getDb();
  // Latest quotation by creation time (superseded ones are excluded).
  const row = (await db
    .prepare(
      "SELECT * FROM quotations WHERE booking_id = ? AND status != 'superseded' ORDER BY created_at DESC LIMIT 1",
    )
    .get(bookingId)) as QuotationRow | undefined;
  if (!row) return null;

  // Lazily mark expired pending quotations.
  if (isQuotationExpired(row)) {
    await db.prepare("UPDATE quotations SET status = 'expired' WHERE id = ?").run(row.id);
    row.status = "expired";
  }
  return row;
}

export function serializeQuotation(row: QuotationRow) {
  return {
    id: row.id,
    baseFee: row.base_fee,
    travelFee: row.travel_fee,
    earlyCallFee: row.early_call_fee,
    accommodationFee: row.accommodation_fee,
    extras: JSON.parse(row.extras) as ExtraItem[],
    artistNote: row.artist_note,
    total: row.total,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
