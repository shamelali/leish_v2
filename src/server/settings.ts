import { getDb } from "./db";
import { logger } from "./logger";

/**
 * Platform settings — typed, cached access to the `platform_settings`
 * key/value store. Admin-manageable via /api/admin/settings + /admin/settings.
 *
 * Business-model knobs:
 * - booking_fee_sen       : flat non-refundable deposit securing the slot (default RM 50).
 * - commission_rate_bps   : platform commission in basis points of the quote
 *                           total, deducted from the artist payout (default
 *                           1000 bps = 10%). Client always pays exactly the
 *                           quoted price — commission is artist-side.
 * - commission_waiver_sen : quote totals below this are commission-free so
 *                           small bookings stay economically viable (default RM 100).
 *
 * Values are cached briefly to keep per-booking serialization loops cheap;
 * the cache is process-local and expires automatically.
 */

export const DEFAULT_BOOKING_FEE_SEN = 5_000; // RM 50
export const DEFAULT_COMMISSION_RATE_BPS = 1_000; // 10%
export const DEFAULT_COMMISSION_WAIVER_SEN = 10_000; // RM 100

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  value: string;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test hook: clear the settings cache between tests. */
export function clearSettingsCache(): void {
  cache.clear();
}

async function getSetting(key: string, fallback: string): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.value;

  let value = fallback;
  try {
    const row = (await getDb()
      .prepare("SELECT value FROM platform_settings WHERE key = ?")
      .get(key)) as { value: string } | undefined;
    if (row?.value != null && row.value !== "") value = row.value;
  } catch (err) {
    // Settings must never break payments — fall back to defaults.
    logger.warn(
      { key, err: err instanceof Error ? err.message : String(err) },
      "platform_settings read failed; using default",
    );
  }

  cache.set(key, { value, fetchedAt: Date.now() });
  return value;
}

async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key, String(fallback));
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Flat non-refundable booking deposit (sen). */
export async function getBookingFeeSen(): Promise<number> {
  const v = await getNumberSetting("booking_fee_sen", DEFAULT_BOOKING_FEE_SEN);
  return Math.max(0, Math.round(v));
}

/** Platform commission rate in basis points of the quotation total. */
export async function getCommissionRateBps(): Promise<number> {
  const v = await getNumberSetting("commission_rate_bps", DEFAULT_COMMISSION_RATE_BPS);
  // Clamp to [0%, 50%] — a typo must never hand the platform half the invoice.
  return Math.min(5_000, Math.max(0, Math.round(v)));
}

/** Quote totals below this amount (sen) are commission-free. */
export async function getCommissionWaiverSen(): Promise<number> {
  const v = await getNumberSetting("commission_waiver_sen", DEFAULT_COMMISSION_WAIVER_SEN);
  return Math.max(0, Math.round(v));
}

export interface CommissionBreakdown {
  totalSen: number;
  /** true when the quote total is below the waiver threshold. */
  waived: boolean;
  /** Commission kept by the platform (sen). */
  commissionSen: number;
  /** Amount payable to the artist (sen): total − commission. */
  artistNetSen: number;
}

/**
 * Compute the platform commission for a quote total.
 * Pure helper (settings passed explicitly) so it is trivially testable.
 */
export function computeCommission(
  totalSen: number,
  rateBps: number,
  waiverSen: number,
): CommissionBreakdown {
  const total = Math.max(0, Math.round(totalSen));
  const waived = total < waiverSen;
  const commissionSen = waived ? 0 : Math.round((total * rateBps) / 10_000);
  return {
    totalSen: total,
    waived,
    commissionSen,
    artistNetSen: total - commissionSen,
  };
}
