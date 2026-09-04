import { NextResponse } from "next/server";
import { logger } from "@/server/logger";
import {
  getPaymentForBill,
  handlePaymentPaid,
  markBillPaid,
  verifyBillplzSignature,
} from "@/server/payments";
import { tryRoute } from "@/server/http";
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
 */
export const POST = tryRoute(
  async function POST(request: Request) {
    const rawBody = await request.text();
    const signature = request.headers.get("x-billplz-signature");

    if (!verifyBillplzSignature(rawBody, signature)) {
      logger.warn(
        { ip: request.headers.get("x-forwarded-for") },
        "billplz webhook signature invalid",
      );
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: { id?: string; paid?: boolean; state?: string };
    try {
      payload = JSON.parse(rawBody) as { id?: string; paid?: boolean; state?: string };
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

    // Begin Agnost tracking for payment webhook.
    const interaction = isAgnostEnabled()
      ? agnost.begin({
          userId: "billplz-webhook",
          agentName: "payment-webhook",
          input: JSON.stringify({ billId: payload.id, paid: payload.paid, state: payload.state }),
        })
      : null;

    try {
      const changed = await markBillPaid(payload.id);
      if (changed) {
        const payment = await getPaymentForBill(payload.id);
        if (!payment) {
          logger.warn({ billId: payload.id }, "paid bill has no payment row (ignored)");
          interaction?.end("Payment row not found", false);
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
      } else {
        logger.info({ billId: payload.id, changed }, "webhook for unknown bill (ignored)");
        interaction?.end("Unknown bill", false);
      }

      // Always ack so Billplz stops retrying; unknown bills are logged, not fatal.
      return new NextResponse("OK", { status: 200 });
    } catch (err) {
      interaction?.end(err instanceof Error ? err.message : String(err), false);
      throw err;
    }
  },
  { route: "POST /api/payments/webhook" },
);
