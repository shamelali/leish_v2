import { NextResponse } from "next/server";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { getActiveQuotation } from "@/server/quotations";
import { refundBalance } from "@/server/payments";
import { jsonError, statefulRoute } from "@/server/http";
import { logger } from "@/server/logger";

/**
 * POST /api/bookings/[id]/refund
 * Refund the remaining balance (quotation total − RM 200 booking fee) when
 * a confirmed booking is cancelled. The RM 200 booking fee is non-refundable.
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

    const quotation = await getActiveQuotation(booking.id);
    if (!quotation || quotation.status === "expired") {
      return jsonError("No active quotation for this booking", 409);
    }

    const BOOKING_FEE_SEN = 20_000;
    const balanceAmount = Math.max(0, quotation.total - BOOKING_FEE_SEN);

    const payment = await refundBalance(booking.id, balanceAmount);
    logger.info({ bookingId: booking.id, amountSen: balanceAmount }, "balance refund processed");

    return NextResponse.json({
      message:
        balanceAmount > 0
          ? `Refund of RM ${(balanceAmount / 100).toFixed(2)} processed (booking fee is non-refundable).`
          : "No balance to refund (booking fee is non-refundable).",
      payment: payment
        ? {
            amount: payment.amount,
            status: payment.status,
            provider: payment.provider,
            reference: payment.provider_ref,
          }
        : null,
    });
  },
  { route: "POST /api/bookings/[id]/refund" },
);
