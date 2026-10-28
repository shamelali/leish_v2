import { NextResponse } from "next/server";
import { logger } from "@/server/logger";
import {
  getPaymentForBill,
  handlePaymentPaid,
  markBillPaid,
  verifyBillplzSignature,
} from "@/server/payments";
import { tryRoute } from "@/server/http";
import { reportError } from "@/server/errors";
import { isAgnostEnabled, agnost } from "@/server/agnost";
import { notifySlackPayment } from "@/server/notifications";
import { getDb } from "@/server/db";

/**
 * POST /api/payments/webhook
 * Billplz payment callback (configured as the bill's callback_url).
 *
 * - The raw request body is verified against the X-Billplz-Signature header
 *   (HMAC-SHA256 with the API key) before any state change.
 * - Only `paid: true` payloads update the payment row (id = Billplz bill id);
 *   settlement side-effects are routed by payment type in handlePaymentPaid
 *   (shared with the dev-provider auto-settlement).
 * - Returns 200 immediately; Billplz retries on non-200.
 *
 * ## Why the non-500 paths still raise alerts
 *
 * This webhook is the ONLY thing that can confirm a booking. When it fails the
 * client has already paid, so a silent failure looks like a confirmed payment
 * and an unconfirmed booking — invisible until the customer complains.
 *
 * An unhandled throw reaches Sentry through `tryRoute`. The dangerous cases are
 * the ones that are *not* exceptions: a rejected signature, a bill with no
 * matching payment row, or a paid bill we do not recognise. Each of those
 * returns a non-500 and would otherwise leave nothing but a log line, so each
 * calls `reportError()` explicitly. `reportError` never throws and is awaited
 * only briefly (5s timeout inside), so alerting cannot break the payment path.
 */
interface BillplzWebhookPayload {
  id?: string;
  paid?: boolean;
  state?: string;
  /** Bill amount in sen — Billplz sends numbers as strings. */
  amount?: string | number;
  /** Amount actually collected, in sen. */
  paid_amount?: string | number;
}

/** Normalise a Billplz amount (number or digit string) to integer sen. */
function toSen(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export const POST = tryRoute(
  async function POST(request: Request) {
    const rawBody = await request.text();
    const signature = request.headers.get("x-billplz-signature");

    if (!verifyBillplzSignature(rawBody, signature)) {
      logger.warn(
        { ip: request.headers.get("x-forwarded-for") },
        "billplz webhook signature invalid",
      );
      // Either BILLPLZ_API_KEY is wrong/unset in this environment — in which
      // case EVERY real callback is being rejected and no booking will ever
      // confirm — or someone is forging callbacks. Both warrant an alert.
      await reportError(new Error("Billplz webhook signature verification failed"), {
        route: "POST /api/payments/webhook",
        metadata: {
          reason: "invalid_signature",
          hasSignatureHeader: signature !== null,
          apiKeyConfigured: Boolean(process.env.BILLPLZ_API_KEY),
          ip: request.headers.get("x-forwarded-for") ?? undefined,
        },
      });
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: BillplzWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as BillplzWebhookPayload;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!payload.id) {
      return NextResponse.json({ error: "Missing bill id" }, { status: 400 });
    }

    // Billplz sends state: "paid" on success; only process paid confirmations.
    if (payload.paid !== true || payload.state !== "paid") {
      logger.info(
        { billId: payload.id, paid: payload.paid, state: payload.state },
        "webhook ignored (not paid)",
      );
      return new NextResponse("OK", { status: 200 });
    }

    // Resolve our own record before mutating anything. A signed callback for a
    // bill we do know about is ordinary traffic — including Billplz retries,
    // which must not be mistaken for an unknown bill (see markBillPaid).
    const payment = await getPaymentForBill(payload.id);
    if (!payment) {
      logger.warn({ billId: payload.id }, "paid bill has no payment row (ignored)");
      // The bill was paid but its payment row is gone — money taken with
      // nothing to settle against. Data-integrity problem.
      await reportError(new Error("Paid Billplz callback for unknown bill"), {
        route: "POST /api/payments/webhook",
        metadata: { reason: "unknown_bill", billId: payload.id },
      });
      return new NextResponse("OK", { status: 200 });
    }

    if (payment.status === "paid") {
      // Billplz retries a callback until it receives a 200. Nothing is left to
      // do on a repeat delivery, and it is not an anomaly — no alert.
      logger.info(
        { billId: payload.id, paymentId: payment.id },
        "duplicate paid callback (already settled)",
      );
      return new NextResponse("OK", { status: 200 });
    }

    if (payment.status === "refunded") {
      // A late replay must not mark a refunded payment paid again.
      logger.warn(
        { billId: payload.id, paymentId: payment.id },
        "paid callback for a refunded payment (ignored)",
      );
      await reportError(new Error("Paid callback arrived for an already-refunded payment"), {
        route: "POST /api/payments/webhook",
        metadata: { reason: "callback_after_refund", billId: payload.id },
      });
      return new NextResponse("OK", { status: 200 });
    }

    // Defence in depth: trust the bill we created, not the callback body.
    // Billplz echoes both amounts; a mismatch means drift or tampering and a
    // human has to reconcile it — settling blind could under- or over-pay.
    const expectedSen = payment.amount;
    const collectedSen = toSen(payload.paid_amount) ?? toSen(payload.amount);
    if (collectedSen !== null && collectedSen !== expectedSen) {
      logger.error(
        { billId: payload.id, expectedSen, collectedSen },
        "webhook amount does not match the payment record",
      );
      await reportError(new Error("Billplz webhook amount does not match the payment record"), {
        route: "POST /api/payments/webhook",
        metadata: { reason: "amount_mismatch", billId: payload.id },
      });
      // Ack so Billplz stops retrying; the mismatch needs a human, not a retry.
      return new NextResponse("OK", { status: 200 });
    }

    // Begin Agnost tracking for payment webhook.
    const interaction = isAgnostEnabled()
      ? agnost.begin({
          userId: "billplz-webhook",
          agentName: "payment-webhook",
          input: JSON.stringify({ billId: payload.id, paid: payload.paid, state: payload.state }),
        })
      : null;

    try {
      // Conditional UPDATE: only the first delivery transitions the row, so
      // the settlement side effects below run exactly once.
      const changed = await markBillPaid(payload.id);
      if (!changed) {
        logger.info(
          { billId: payload.id, paymentId: payment.id },
          "payment already transitioned by a concurrent delivery (ignored)",
        );
        interaction?.end("Already settled", true);
        return new NextResponse("OK", { status: 200 });
      }

      await handlePaymentPaid(payment);

      // Slack notification (best-effort)
      const booking = (await getDb()
        .prepare("SELECT artist_name FROM bookings WHERE id = ?")
        .get(payment.booking_id)) as { artist_name: string } | undefined;
      if (booking) {
        notifySlackPayment({
          bookingId: payment.booking_id,
          artistName: booking.artist_name,
          amountSen: payment.amount,
          type: payment.type,
        }).catch(() => {});
      }

      interaction?.end(
        JSON.stringify({ billId: payload.id, bookingId: payment.booking_id, type: payment.type }),
        true,
      );

      // Always ack so Billplz stops retrying.
      return new NextResponse("OK", { status: 200 });
    } catch (err) {
      interaction?.end(err instanceof Error ? err.message : String(err), false);
      throw err;
    }
  },
  { route: "POST /api/payments/webhook" },
);
