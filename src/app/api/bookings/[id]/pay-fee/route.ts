import { NextResponse } from "next/server";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import {
  createBookingPayment,
  getPaymentForBooking,
  handlePaymentPaid,
  markBillPaid,
  activePaymentProvider,
} from "@/server/payments";
import { getBookingFeeSen } from "@/server/settings";
import { getActiveQuotation } from "@/server/quotations";
import { jsonError, statefulRoute } from "@/server/http";
import { logger } from "@/server/logger";

/**
 * POST /api/bookings/[id]/pay-fee
 * Client pays the flat, non-refundable booking deposit (default RM 50,
 * Billplz bill). The booking becomes confirmed when the webhook reports the
 * payment. A quotation must exist and be within its 24h window.
 */
export const POST = statefulRoute(
  async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
    const payload = token ? await verifySessionToken(token) : null;
    if (!payload) return jsonError("Not authenticated", 401);

    const db = await getDb();
    const user = (await db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
      UserRow | undefined;
    if (!user) return jsonError("Not authenticated", 401);

    const booking = (await db.prepare("SELECT * FROM bookings WHERE id = ?").get(id)) as
      BookingRow | undefined;
    if (!booking) return jsonError("Booking not found", 404);
    if (booking.user_id !== user.id) return jsonError("Only the booking owner can pay", 403);
    if (booking.status !== "accepted") {
      return jsonError("This booking is not waiting for a fee payment", 409);
    }

    const quotation = await getActiveQuotation(booking.id);
    if (!quotation) {
      return jsonError("No quotation available for this booking", 409);
    }
    if (quotation.status === "expired") {
      return jsonError("The quotation has expired — ask the artist for a new one", 410);
    }

    // One active deposit bill at a time.
    const existing = await getPaymentForBooking(booking.id, "deposit");
    if (existing && existing.status === "required") {
      return NextResponse.json({
        payment: {
          amount: existing.amount,
          type: existing.type,
          status: existing.status,
          provider: existing.provider,
          reference: existing.provider_ref,
          url: existing.provider_url,
        },
      });
    }

    const bookingFeeSen = await getBookingFeeSen();

    // Billplz is a network call — surface gateway outages as a clear retryable
    // message instead of the generic 500 (details still go to logs/Sentry).
    let payment;
    try {
      payment = await createBookingPayment(booking.id, "deposit", bookingFeeSen);
    } catch (err) {
      if (activePaymentProvider() === "billplz") {
        logger.error(
          { bookingId: booking.id, err: err instanceof Error ? err.message : String(err) },
          "payment gateway unreachable",
        );
        return jsonError(
          "The payment gateway is temporarily unavailable. Please try again in a few minutes.",
          503,
        );
      }
      throw err;
    }
    logger.info({ bookingId: booking.id, amount: payment.amount }, "booking deposit bill created");

    // Dev provider: nothing is charged, so settle instantly — this keeps demos
    // and e2e flows working without a real Billplz webhook round-trip.
    if (payment.provider === "dev") {
      await markBillPaid(payment.provider_ref!);
      const settled = await getPaymentForBooking(booking.id, "deposit");
      if (settled) await handlePaymentPaid(settled);
      return NextResponse.json(
        {
          payment: {
            amount: payment.amount,
            type: payment.type,
            status: "paid",
            provider: payment.provider,
            reference: payment.provider_ref,
            url: payment.provider_url,
          },
        },
        { status: 201 },
      );
    }

    return NextResponse.json(
      {
        payment: {
          amount: payment.amount,
          type: payment.type,
          status: payment.status,
          provider: payment.provider,
          reference: payment.provider_ref,
          url: payment.provider_url,
        },
      },
      { status: 201 },
    );
  },
  { route: "POST /api/bookings/[id]/pay-fee" },
);
