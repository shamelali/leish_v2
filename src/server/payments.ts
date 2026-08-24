import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb, type UserRow } from "./db";
import { logger } from "./logger";

/**
 * Payment abstraction — Billplz.
 *
 * Business rule (hybrid model): a flat non-refundable booking deposit
 * (default RM 50) is paid upfront to secure the slot; the remaining balance
 * (quotation total − deposit) is due 3 days before the event and is also
 * collected on-platform. A 10% commission is deducted from the artist payout
 * (see src/server/payouts.ts); the client always pays exactly the quoted price.
 *
 * Each booking has at most one payment per type:
 * - "deposit" : paid once the quotation is accepted; confirms the booking.
 * - "balance" : paid after confirmation; creates the artist payout.
 *
 * Providers:
 * - "billplz": creates a Billplz bill (hosted payment page) via the
 *   Billplz API v3 when BILLPLZ_API_KEY + BILLPLZ_COLLECTION_ID are set.
 *   The bill's `url` is returned so the client can redirect the payer.
 *   Completion arrives via the webhook (POST /api/payments/webhook), which
 *   verifies the HMAC signature and routes by payment type.
 * - "dev" (default): records the payment row with a synthetic reference —
 *   nothing is charged. Fine for demos and tests.
 */

export type PaymentStatus = "required" | "paid" | "failed" | "refunded";
export type PaymentProvider = "dev" | "billplz";
export type PaymentType = "deposit" | "balance";

export interface PaymentRecord {
  id: string;
  booking_id: string;
  type: PaymentType;
  amount: number; // sen (MYR)
  currency: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  provider_ref: string | null; // Billplz bill id
  provider_url: string | null; // Billplz hosted payment page URL
}

/**
 * Billplz API base. Override with BILLPLZ_BASE_URL for the sandbox
 * (https://www.billplz-sandbox.com/api/v3) — sandbox and live credentials
 * must never be mixed across hosts.
 */
const BILLPLZ_API =
  process.env.BILLPLZ_BASE_URL?.replace(/\/$/, "") ?? "https://www.billplz.com/api/v3";

export function activePaymentProvider(): PaymentProvider {
  return process.env.BILLPLZ_API_KEY && process.env.BILLPLZ_COLLECTION_ID ? "billplz" : "dev";
}

/** Absolute URLs for the Billplz bill callback (webhook) and redirect. */
function billplzEndpoints() {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    callbackUrl: process.env.BILLPLZ_CALLBACK_URL ?? `${base}/api/payments/webhook`,
    redirectUrl: process.env.BILLPLZ_REDIRECT_URL ?? `${base}/dashboard`,
  };
}

export async function createBookingPayment(
  bookingId: string,
  type: PaymentType,
  amountSen: number,
): Promise<PaymentRecord> {
  const provider = activePaymentProvider();
  if (provider === "billplz") {
    return billplzPayment(bookingId, type, amountSen);
  }
  return devPayment(bookingId, type, amountSen);
}

async function devPayment(
  bookingId: string,
  type: PaymentType,
  amount: number,
): Promise<PaymentRecord> {
  const record: PaymentRecord = {
    id: randomUUID(),
    booking_id: bookingId,
    type,
    amount,
    currency: "MYR",
    provider: "dev",
    status: "required",
    provider_ref: `dev_${randomUUID().slice(0, 12)}`,
    provider_url: null,
  };
  // Awaited — callers (e.g. the dev auto-settlement path) read/update the row
  // immediately after this resolves, so the INSERT must be durable first.
  await insertPayment(record);
  logger.info(
    { bookingId, amount, type, provider: "dev" },
    `${type} payment recorded (dev provider)`,
  );
  return record;
}

async function billplzPayment(
  bookingId: string,
  type: PaymentType,
  amountSen: number,
): Promise<PaymentRecord> {
  const apiKey = process.env.BILLPLZ_API_KEY!;
  const collectionId = process.env.BILLPLZ_COLLECTION_ID!;

  // The Billplz bill needs the payer's name + email — the booking owner.
  const booking = (await getDb()
    .prepare("SELECT user_id FROM bookings WHERE id = ?")
    .get(bookingId)) as { user_id: string } | undefined;
  if (!booking) throw new Error("Booking not found");
  const owner = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(booking.user_id)) as
    UserRow | undefined;
  if (!owner) throw new Error("Booking owner not found");

  const { callbackUrl, redirectUrl } = billplzEndpoints();

  const res = await fetch(`${BILLPLZ_API}/bills`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      collection_id: collectionId,
      name: owner.name.slice(0, 80),
      email: owner.email,
      mobile: "",
      amount: String(amountSen),
      description:
        type === "deposit"
          ? `Leish! booking deposit (${bookingId.slice(0, 8)})`
          : `Leish! balance payment (${bookingId.slice(0, 8)})`,
      callback_url: callbackUrl,
      redirect_url: redirectUrl,
      reference_1: bookingId,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    url?: string;
    error?: { message?: string } | string;
  };

  if (!res.ok || !body.id) {
    const detail =
      typeof body.error === "string" ? body.error : (body.error?.message ?? res.statusText);
    logger.error({ status: res.status, detail }, "billplz bill creation failed");
    throw new Error("Failed to create payment");
  }

  const record: PaymentRecord = {
    id: randomUUID(),
    booking_id: bookingId,
    type,
    amount: amountSen,
    currency: "MYR",
    provider: "billplz",
    status: "required",
    provider_ref: body.id,
    provider_url: body.url ?? null,
  };
  // Must await: callers read the row immediately (webhook lookup, e2e).
  await insertPayment(record);
  logger.info(
    { bookingId, billId: body.id, amount: amountSen, type },
    `billplz ${type} payment bill created`,
  );
  return record;
}

async function insertPayment(record: PaymentRecord) {
  await getDb()
    .prepare(
      `INSERT INTO payments (id, booking_id, type, amount, currency, provider, status, provider_ref, provider_url, created_at, updated_at)
       VALUES (@id, @booking_id, @type, @amount, @currency, @provider, @status, @provider_ref, @provider_url, @created_at, @updated_at)`,
    )
    .run({
      ...record,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
}

export async function getPaymentsForBooking(bookingId: string): Promise<PaymentRecord[]> {
  const rows = (await getDb()
    .prepare("SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at ASC")
    .all(bookingId)) as (PaymentRecord & { created_at: string; updated_at: string })[];
  return rows.map((row) => ({
    id: row.id,
    booking_id: row.booking_id,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    provider: row.provider,
    status: row.status,
    provider_ref: row.provider_ref,
    provider_url: row.provider_url,
  }));
}

/** The payment of a given type for a booking (defaults to the deposit). */
export async function getPaymentForBooking(
  bookingId: string,
  type: PaymentType = "deposit",
): Promise<PaymentRecord | null> {
  const row = (await getDb()
    .prepare("SELECT * FROM payments WHERE booking_id = ? AND type = ?")
    .get(bookingId, type)) as
    (PaymentRecord & { created_at: string; updated_at: string }) | undefined;
  if (!row) return null;
  return {
    id: row.id,
    booking_id: row.booking_id,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    provider: row.provider,
    status: row.status,
    provider_ref: row.provider_ref,
    provider_url: row.provider_url,
  };
}

/** Mark the payment for a Billplz bill id as paid (webhook-confirmed). */
export async function markBillPaid(billId: string): Promise<boolean> {
  const result = await getDb()
    .prepare("UPDATE payments SET status = 'paid', updated_at = ? WHERE provider_ref = ?")
    .run(new Date().toISOString(), billId);
  return result.changes > 0;
}

/**
 * Shared settlement side-effects, routed by payment type. Called by the
 * Billplz webhook (real payments) and by the dev-provider auto-settlement
 * in pay-fee / pay-balance (demos + e2e):
 * - deposit → confirms an accepted booking (payment locks the slot)
 * - balance → marks the quotation paid and creates the artist payout
 */
export async function handlePaymentPaid(payment: PaymentRecord): Promise<void> {
  const { confirmOnFeePaid } = await import("./bookings");
  const { getActiveQuotation } = await import("./quotations");
  const { createPayoutForBooking } = await import("./payouts");

  const booking = (await getDb()
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .get(payment.booking_id)) as
    { status: string; artist_id: string; date: string | null } | undefined;
  if (!booking) {
    logger.warn({ paymentId: payment.id }, "paid payment has no booking (ignored)");
    return;
  }

  if (payment.type === "deposit") {
    const transition = confirmOnFeePaid(booking.status as Parameters<typeof confirmOnFeePaid>[0]);
    if (transition.ok) {
      await getDb()
        .prepare("UPDATE bookings SET status = ? WHERE id = ?")
        .run(transition.status, payment.booking_id);
      logger.info(
        { bookingId: payment.booking_id, paymentId: payment.id },
        "booking confirmed by deposit",
      );
    }
    return;
  }

  // Balance paid → quotation fulfilled + artist payout created.
  const quotation = await getActiveQuotation(payment.booking_id);
  if (quotation && quotation.status !== "expired") {
    await getDb().prepare("UPDATE quotations SET status = 'paid' WHERE id = ?").run(quotation.id);
  }
  await createPayoutForBooking(payment.booking_id, {
    artistId: booking.artist_id,
    eventDate: booking.date,
    quoteTotalSen: quotation?.total ?? payment.amount,
  });
  logger.info({ bookingId: payment.booking_id, paymentId: payment.id }, "balance settled");
}

/** Full payment row for a Billplz bill id — routes webhook handling by type. */
export async function getPaymentForBill(billId: string): Promise<PaymentRecord | null> {
  const row = (await getDb()
    .prepare("SELECT * FROM payments WHERE provider_ref = ?")
    .get(billId)) as (PaymentRecord & { created_at: string; updated_at: string }) | undefined;
  if (!row) return null;
  return {
    id: row.id,
    booking_id: row.booking_id,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    provider: row.provider,
    status: row.status,
    provider_ref: row.provider_ref,
    provider_url: row.provider_url,
  };
}

/** Booking id attached to the bill as reference_1 — used to confirm it. */
export async function getBookingIdForBill(billId: string): Promise<string | null> {
  const row = (await getDb()
    .prepare("SELECT booking_id FROM payments WHERE provider_ref = ?")
    .get(billId)) as { booking_id: string } | undefined;
  return row?.booking_id ?? null;
}

/**
 * Refund a specific balance payment for a cancelled booking.
 * Business rule: the deposit is non-refundable; only the balance payment
 * row is ever refunded.
 * - "dev" provider: marks the payment refunded directly.
 * - "billplz": issues a Billplz refund for the full stored amount.
 */
export async function refundBalancePayment(payment: PaymentRecord): Promise<PaymentRecord> {
  if (payment.type !== "balance") {
    throw new Error("Only balance payments are refundable");
  }
  if (payment.status !== "paid") {
    throw new Error("Only paid balances can be refunded");
  }
  const amountSen = payment.amount;

  if (payment.provider === "billplz" && process.env.BILLPLZ_API_KEY && payment.provider_ref) {
    try {
      const res = await fetch(`${BILLPLZ_API}/bills/${payment.provider_ref}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.BILLPLZ_API_KEY}:`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ amount: String(amountSen), reason: "Booking cancelled" }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        logger.error({ status: res.status, detail }, "billplz refund failed");
        throw new Error("Failed to issue refund");
      }
      logger.info({ bookingId: payment.booking_id, amount: amountSen }, "billplz refund issued");
    } catch (err) {
      logger.error({ err }, "billplz refund error");
      throw err;
    }
  }

  // Mark only this payment row refunded — the deposit stays untouched.
  await getDb()
    .prepare("UPDATE payments SET status = 'refunded', updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), payment.id);
  logger.info({ bookingId: payment.booking_id, amount: amountSen }, "balance refund recorded");

  const updated = (await getDb().prepare("SELECT * FROM payments WHERE id = ?").get(payment.id)) as
    (PaymentRecord & { created_at: string; updated_at: string }) | undefined;
  if (!updated) return { ...payment, status: "refunded" };
  return {
    id: updated.id,
    booking_id: updated.booking_id,
    type: updated.type,
    amount: updated.amount,
    currency: updated.currency,
    provider: updated.provider,
    status: updated.status,
    provider_ref: updated.provider_ref,
    provider_url: updated.provider_url,
  };
}

/**
 * Verify the Billplz webhook signature.
 * Billplz signs the RAW request body with HMAC-SHA256 using the API key) as
 * the secret; the digest is sent hex-encoded in the X-Billplz-Signature
 * header. Comparison is timing-safe.
 */
export function verifyBillplzSignature(
  rawBody: string,
  signatureHeader: string | null,
  apiKey = process.env.BILLPLZ_API_KEY,
): boolean {
  if (!signatureHeader || !apiKey) return false;
  const expected = createHmac("sha256", apiKey).update(rawBody).digest("hex");
  const provided = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);
  return provided.length === expectedBuf.length && timingSafeEqual(provided, expectedBuf);
}
