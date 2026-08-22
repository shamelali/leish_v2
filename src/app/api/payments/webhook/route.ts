import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { logger } from "@/server/logger";
import { confirmOnFeePaid } from "@/server/bookings";
import {
  getPaymentForBill,
  markBillPaid,
  verifyBillplzSignature,
} from "@/server/payments";
import { createPayoutForBooking } from "@/server/payouts";
import { getActiveQuotation } from "@/server/quotations";
import { tryRoute } from "@/server/http";

/**
 * POST /api/payments/webhook
 * Billplz payment callback (configured as the bill's callback_url).
 *
 * - The raw request body is verified against the X-Billplz-Signature header
 *   (HMAC-SHA256 with the API key) before any state change.
 * - Only `paid: true` payloads update the payment row (id = Billplz bill id).
 * - Routed by payment type:
 *     deposit → confirms an accepted booking (payment locks the slot)
 *     balance → marks the quotation paid and creates the artist payout
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

    let payload: { id?: string; paid?: boolean };
    try {
      payload = JSON.parse(rawBody) as { id?: string; paid?: boolean };
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!payload.id) {
      return NextResponse.json({ error: "Missing bill id" }, { status: 400 });
    }

    if (payload.paid === true) {
      const changed = await markBillPaid(payload.id);
      if (changed) {
        const payment = await getPaymentForBill(payload.id);
        if (!payment) {
          logger.warn({ billId: payload.id }, "paid bill has no payment row (ignored)");
          return new NextResponse("OK", { status: 200 });
        }
        const bookingId = payment.booking_id;
        const booking = (await getDb()
          .prepare("SELECT * FROM bookings WHERE id = ?")
          .get(bookingId)) as
          | { status: string; artist_id: string; date: string | null }
          | undefined;

        if (payment.type === "deposit") {
          // Deposit paid → confirm the booking (business rule: payment locks the slot).
          if (booking) {
            const transition = confirmOnFeePaid(
              booking.status as Parameters<typeof confirmOnFeePaid>[0],
            );
            if (transition.ok) {
              await getDb()
                .prepare("UPDATE bookings SET status = ? WHERE id = ?")
                .run(transition.status, bookingId);
              logger.info({ bookingId, billId: payload.id }, "booking confirmed by deposit");
            }
          }
        } else {
          // Balance paid → quotation fulfilled + artist payout created.
          const quotation = await getActiveQuotation(bookingId);
          if (quotation && quotation.status !== "expired") {
            await getDb()
              .prepare("UPDATE quotations SET status = 'paid' WHERE id = ?")
              .run(quotation.id);
          }
          if (booking) {
            await createPayoutForBooking(bookingId, {
              artistId: booking.artist_id,
              eventDate: booking.date,
              quoteTotalSen: quotation?.total ?? payment.amount,
            });
          }
          logger.info({ bookingId, billId: payload.id }, "balance payment settled");
        }
      } else {
        logger.info({ billId: payload.id, changed }, "webhook for unknown bill (ignored)");
      }
    }

    // Always ack so Billplz stops retrying; unknown bills are logged, not fatal.
    return new NextResponse("OK", { status: 200 });
  },
  { route: "POST /api/payments/webhook" },
);
