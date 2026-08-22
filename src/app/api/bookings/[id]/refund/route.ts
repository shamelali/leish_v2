import { NextResponse } from "next/server";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { refundBalancePayment, getPaymentForBooking } from "@/server/payments";
import { jsonError, statefulRoute } from "@/server/http";
import { logger } from "@/server/logger";

/**
 * POST /api/bookings/[id]/refund
 * Refund the paid balance payment when a confirmed booking is cancelled.
 * The booking deposit is non-refundable and is never touched here.
 * Owner only.
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
    if (booking.user_id !== user.id)
      return jsonError("Only the booking owner can request a refund", 403);
    if (booking.status !== "cancelled") {
      return jsonError("Only cancelled bookings can be refunded", 409);
    }

    // Only the balance payment row is refundable — the deposit stays with the
    // platform regardless of cancellation timing.
    const balancePayment = await getPaymentForBooking(booking.id, "balance");
    if (!balancePayment || balancePayment.status !== "paid") {
      return jsonError("No paid balance to refund for this booking", 409);
    }
    const balanceAmount = balancePayment.amount;

    const payment = await refundBalancePayment(balancePayment);
    logger.info({ bookingId: booking.id, amount: balanceAmount }, "balance refund processed");

    return NextResponse.json({
      message:
        balanceAmount > 0
          ? `Refund of RM ${(balanceAmount / 100).toFixed(2)} processed (booking deposit is non-refundable).`
          : "No balance to refund.",
      payment: {
        amount: payment.amount,
        status: payment.status,
        provider: payment.provider,
        reference: payment.provider_ref,
      },
    });
  },
  { route: "POST /api/bookings/[id]/refund" },
);
