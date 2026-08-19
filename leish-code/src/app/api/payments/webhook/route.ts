import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { logger } from "@/server/logger";
import { confirmOnFeePaid } from "@/server/bookings";
import { getBookingIdForBill, markBillPaid, verifyBillplzSignature } from "@/server/payments";
import { tryRoute } from "@/server/http";

/**
 * POST /api/payments/webhook
 * Billplz payment callback (configured as the bill's callback_url).
 *
 * - The raw request body is verified against the X-Billplz-Signature header
 *   (HMAC-SHA256 with the API key) before any state change.
 * - Only `paid: true` payloads update the payment row (id = Billplz bill id).
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
        // Fee paid → confirm the booking (business rule: payment locks the slot).
        const bookingId = await getBookingIdForBill(payload.id);
        if (bookingId) {
          const row = (await getDb()
            .prepare("SELECT status FROM bookings WHERE id = ?")
            .get(bookingId)) as { status: string } | undefined;
          if (row) {
            const transition = confirmOnFeePaid(
              row.status as Parameters<typeof confirmOnFeePaid>[0],
            );
            if (transition.ok) {
              await getDb()
                .prepare("UPDATE bookings SET status = ? WHERE id = ?")
                .run(transition.status, bookingId);
              logger.info({ bookingId, billId: payload.id }, "booking confirmed by fee payment");
            }
          }
        }
        logger.info({ billId: payload.id, changed }, "booking fee marked paid");
      } else {
        logger.info({ billId: payload.id, changed }, "webhook for unknown bill (ignored)");
      }
    }

    // Always ack so Billplz stops retrying; unknown bills are logged, not fatal.
    return new NextResponse("OK", { status: 200 });
  },
  { route: "POST /api/payments/webhook" },
);
