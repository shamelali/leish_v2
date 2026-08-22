import { NextResponse } from "next/server";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import {
  createBookingPayment,
  getPaymentForBooking,
  activePaymentProvider,
} from "@/server/payments";
import { getBookingFeeSen } from "@/server/settings";
import { sendBalanceBillEmail } from "@/server/booking-emails";
import { getActiveQuotation } from "@/server/quotations";
import { jsonError, statefulRoute, requestOrigin } from "@/server/http";
import { logger } from "@/server/logger";

/**
 * POST /api/bookings/[id]/pay-balance
 * Client pays the remaining balance (quotation total − booking deposit) for a
 * confirmed booking. On webhook confirmation the quotation is marked paid and
 * the artist payout is created.
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
    if (booking.status !== "confirmed") {
      return jsonError("The balance is payable only after the booking is confirmed", 409);
    }

    const quotation = await getActiveQuotation(booking.id);
    if (!quotation || quotation.status === "expired") {
      return jsonError("No active quotation for this booking", 409);
    }
    if (quotation.status === "paid") {
      return jsonError("The balance has already been paid", 409);
    }

    // The deposit must be settled before the balance becomes payable.
    const deposit = await getPaymentForBooking(booking.id, "deposit");
    if (!deposit || deposit.status !== "paid") {
      return jsonError("The booking deposit must be paid first", 409);
    }

    const existingBalance = await getPaymentForBooking(booking.id, "balance");
    if (existingBalance && existingBalance.status === "required") {
      return NextResponse.json({
        payment: {
          amount: existingBalance.amount,
          type: existingBalance.type,
          status: existingBalance.status,
          provider: existingBalance.provider,
          reference: existingBalance.provider_ref,
          url: existingBalance.provider_url,
        },
      });
    }
    if (existingBalance && existingBalance.status === "paid") {
      return jsonError("The balance has already been paid", 409);
    }

    const bookingFeeSen = await getBookingFeeSen();
    const balanceAmount = Math.max(0, quotation.total - bookingFeeSen);
    if (balanceAmount <= 0) {
      return jsonError("No outstanding balance for this booking", 409);
    }

    let payment;
    try {
      payment = await createBookingPayment(booking.id, "balance", balanceAmount);
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
    logger.info(
      { bookingId: booking.id, amount: payment.amount },
      "booking balance bill created",
    );

    // Email the client the payment link (falls back to the dashboard when no
    // hosted bill URL exists — e.g. dev provider).
    const payUrl = payment.provider_url ?? `${requestOrigin(request)}/dashboard?booking=${booking.id}`;
    await sendBalanceBillEmail({
      bookingId: booking.id,
      ownerUserId: booking.user_id,
      artistName: booking.artist_name,
      service: booking.service,
      date: booking.date,
      balanceAmount,
      payUrl,
    });

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
  { route: "POST /api/bookings/[id]/pay-balance" },
);
