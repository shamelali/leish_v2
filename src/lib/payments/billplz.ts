import crypto from "crypto";
import type { BillplzBillResponse, BillplzCreateBillParams, BillplzWebhookPayload } from "./types";

const BASE_URL = process.env.BILLPLZ_BASE_URL ?? "https://www.billplz.com/api/v3";

function authHeader() {
  const apiKey = process.env.BILLPLZ_API_KEY;
  if (!apiKey) throw new Error("[billplz] BILLPLZ_API_KEY is not set.");
  return "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
}

export async function createBill(params: BillplzCreateBillParams): Promise<BillplzBillResponse> {
  const collectionId = process.env.BILLPLZ_COLLECTION_ID;
  if (!collectionId) throw new Error("[billplz] BILLPLZ_COLLECTION_ID is not set.");

  const res = await fetch(`${BASE_URL}/bills`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      collection_id: collectionId,
      email: params.email,
      name: params.name,
      amount: String(params.amountCents),
      callback_url: params.callbackUrl,
      redirect_url: params.redirectUrl,
      description: params.description,
      reference_1_label: "booking_id",
      reference_1: params.bookingId,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[billplz] create bill failed (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Verifies the X-Signature on an incoming webhook payload. Billplz signs a
 * specific ordered subset of fields joined with `|`, then HMAC-SHA256s that
 * against your X_SIGNATURE_KEY. Reject anything that doesn't match — this
 * is the only thing standing between "booking marked paid" and a forged
 * webhook call.
 */
export function verifyWebhookSignature(payload: BillplzWebhookPayload): boolean {
  const signatureKey = process.env.BILLPLZ_X_SIGNATURE_KEY;
  if (!signatureKey) throw new Error("[billplz] BILLPLZ_X_SIGNATURE_KEY is not set.");

  const fieldsToSign = ["amount", "collection_id", "id", "paid", "paid_amount", "state"] as const;

  const sourceString = fieldsToSign.map((field) => `${field}${payload[field] ?? ""}`).join("|");

  const expected = crypto.createHmac("sha256", signatureKey).update(sourceString).digest("hex");

  return timingSafeEqual(expected, payload.x_signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
