/**
 * Commission constants. Match these to leish.my's published rates —
 * do not change without updating the pricing page and investor materials.
 */
export const MUA_COMMISSION_PERCENT = 12;
export const STUDIO_COMMISSION_PERCENT = 15; // reserved — studios out of v1 scope
export const EXTERNAL_STUDIO_COMMISSION_PERCENT = 20; // reserved — v1.1+

const MIN_DEPOSIT_PERCENT = 10;
const MAX_DEPOSIT_PERCENT = 100;

/**
 * Resolves the booking amount and deposit SERVER-SIDE from the DB record.
 * Never accept `amount` or `depositAmount` from client input — this
 * closes the client-tampering vector that was audited and fixed in v1
 * (booking amount/depositAmount could otherwise be spoofed by the client).
 *
 * Call this from the server action / route handler that creates a booking,
 * using values already fetched from `services` and `providers` via a
 * trusted (service-role or already-scoped) Supabase query — not from the
 * request body.
 */
export function resolveBookingAmount(params: {
  servicePrice: number;
  providerDefaultDepositPercent: number;
}) {
  const depositPercent = clamp(
    params.providerDefaultDepositPercent,
    MIN_DEPOSIT_PERCENT,
    MAX_DEPOSIT_PERCENT,
  );

  const amount = round2(params.servicePrice);
  const depositAmount = round2((amount * depositPercent) / 100);

  return {
    amount,
    depositAmount,
    commissionPercent: MUA_COMMISSION_PERCENT,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
