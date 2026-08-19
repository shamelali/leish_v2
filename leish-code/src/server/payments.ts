import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getDb, type UserRow } from "./db";
import { logger } from "./logger";

/**
 * Payment abstraction — Billplz.
 *
 * Business rule: a flat, non-refundable RM 200 booking fee is paid upfront
 * to secure the slot; the remaining balance (quotation total - fee) is due
 * 3 days before the event. This module creates the RM 200 fee bill.
 *
 * Providers:
 * - "billplz": creates a Billplz bill (hosted payment page) via the
 *   Billplz API v3 when BILLPLZ_API_KEY + BILLPLZ_COLLECTION_ID are set.
 *   The bill's `url` is returned so the client can redirect the payer.
 *   Completion arrives via the webhook (POST /api/payments/webhook), which
 *   verifies the HMAC signature and confirms the booking.
 * - "dev" (default): records the payment row with a synthetic reference —
 *   nothing is charged. Fine for demos and tests.
 */

export type PaymentStatus = "required" | "paid" | "failed" | "refunded";
export type PaymentProvider = "dev" | "billplz";

export interface PaymentRecord {
  id: string;
  booking_id: string;
  amount: number; // sen (MYR)
  currency: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  provider_ref: string | null; // Billplz bill id
  provider_url: string | null; // Billplz hosted payment page URL
}

/** Flat booking fee, non-refundable & non-transferable. */
export const BOOKING_FEE_SEN = 20_000; // RM 200

const BILLPLZ_API = "https://www.billplz.com/api/v3";

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

export async function createBookingFeePayment(bookingId: string): Promise<PaymentRecord> {
  const provider = activePaymentProvider();
  if (provider === "billplz") {
    return billplzPayment(bookingId, BOOKING_FEE_SEN);
  }
  return devPayment(bookingId, BOOKING_FEE_SEN);
}

function devPayment(bookingId: string, amount: number): PaymentRecord {
  const record: PaymentRecord = {
    id: randomUUID(),
    booking_id: bookingId,
    amount,
    currency: "MYR",
    provider: "dev",
    status: "required",
    provider_ref: `dev_${randomUUID().slice(0, 12)}`,
    provider_url: null,
  };
  insertPayment(record);
  logger.info({ bookingId, amount, provider: "dev" }, "booking fee recorded (dev provider)");
  return record;
}

async function billplzPayment(bookingId: string, amountSen: number): Promise<PaymentRecord> {
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
      description: `Leish! booking fee (${bookingId.slice(0, 8)})`,
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
    amount: amountSen,
    currency: "MYR",
    provider: "billplz",
    status: "required",
    provider_ref: body.id,
    provider_url: body.url ?? null,
  };
  insertPayment(record);
  logger.info(
    { bookingId, billId: body.id, amount: amountSen },
    "billplz booking fee bill created",
  );
  return record;
}

async function insertPayment(record: PaymentRecord) {
  await getDb()
    .prepare(
      `INSERT INTO payments (id, booking_id, amount, currency, provider, status, provider_ref, provider_url, created_at, updated_at)
       VALUES (@id, @booking_id, @amount, @currency, @provider, @status, @provider_ref, @provider_url, @created_at, @updated_at)`,
    )
    .run({
      ...record,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
}

export async function getPaymentForBooking(bookingId: string): Promise<PaymentRecord | null> {
  const row = (await getDb()
    .prepare("SELECT * FROM payments WHERE booking_id = ?")
    .get(bookingId)) as (PaymentRecord & { created_at: string; updated_at: string }) | undefined;
  if (!row) return null;
  return {
    id: row.id,
    booking_id: row.booking_id,
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

/** Booking id attached to the bill as reference_1 — used to confirm it. */
export async function getBookingIdForBill(billId: string): Promise<string | null> {
  const row = (await getDb()
    .prepare("SELECT booking_id FROM payments WHERE provider_ref = ?")
    .get(billId)) as { booking_id: string } | undefined;
  return row?.booking_id ?? null;
}

/**
 * Refund the booking fee (balance) for a booking.
 * Business rule: the RM 200 booking fee is non-refundable; the remaining
 * balance (quotation total − fee) is refundable if the booking is
 * cancelled after payment.
 * - "dev" provider: marks the payment refunded directly.
 * - "billplz": issues a Billplz refund for the balance amount.
 */
export async function refundBalance(
  bookingId: string,
  amountSen: number,
): Promise<PaymentRecord | null> {
  const payment = await getPaymentForBooking(bookingId);
  if (!payment || payment.status !== "paid") return null;
  if (amountSen <= 0) return payment; // nothing to refund

  if (payment.provider === "billplz" && process.env.BILLPLZ_API_KEY) {
    try {
      const res = await fetch(`${BILLPLZ_API}/bills/${payment.provider_ref}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.BILLPLZ_API_KEY}:`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ amount: String(amountSen), reason: "Booking cancelled" }),
      });
      if (res.ok) {
        await markPaymentRefunded(bookingId);
        logger.info({ bookingId, amountSen }, "billplz refund issued");
        return await getPaymentForBooking(bookingId);
      }
      const detail = await res.text().catch(() => "");
      logger.error({ status: res.status, detail }, "billplz refund failed");
      throw new Error("Failed to issue refund");
    } catch (err) {
      logger.error({ err }, "billplz refund error");
      throw err;
    }
  }

  // Dev provider: mark refunded locally.
  await markPaymentRefunded(bookingId);
  logger.info({ bookingId, amountSen, provider: "dev" }, "refund recorded (dev provider)");
  return await getPaymentForBooking(bookingId);
}

async function markPaymentRefunded(bookingId: string) {
  await getDb()
    .prepare("UPDATE payments SET status = 'refunded', updated_at = ? WHERE booking_id = ?")
    .run(new Date().toISOString(), bookingId);
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
