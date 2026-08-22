import { NextResponse } from "next/server";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { getClaimedArtistIds } from "@/server/artist-profiles";
import { getActiveQuotation } from "@/server/quotations";
import { sendBalanceReminder } from "@/server/booking-emails";
import { getBookingFeeSen } from "@/server/settings";
import { jsonError, statefulRoute } from "@/server/http";
import { logger } from "@/server/logger";

/**
 * POST /api/bookings/[id]/remind
 * Claimed artist nudges the client about the outstanding balance.
 * Only valid for confirmed bookings with a pending balance.
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

    const isArtistRole = user.role === "artist" || user.role === "studio";
    if (!isArtistRole) return jsonError("Only artists can send reminders", 403);

    const claimed = await getClaimedArtistIds(user.id);
    const booking = (await db.prepare("SELECT * FROM bookings WHERE id = ?").get(id)) as
      BookingRow | undefined;
    if (!booking) return jsonError("Booking not found", 404);
    if (!claimed.includes(booking.artist_id)) {
      return jsonError("You can only manage bookings for your claimed artist profile", 403);
    }
    if (booking.status !== "confirmed") {
      return jsonError("Reminders can only be sent for confirmed bookings", 409);
    }

    const quotation = await getActiveQuotation(booking.id);
    if (!quotation || quotation.status === "expired") {
      return jsonError("No active quotation for this booking", 409);
    }
    const bookingFeeSen = await getBookingFeeSen();
    const balanceAmount = Math.max(0, quotation.total - bookingFeeSen);
    const balanceDueDate = new Date(new Date(`${booking.date}T00:00:00`).getTime() - 3 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    await sendBalanceReminder({
      bookingId: booking.id,
      ownerUserId: booking.user_id,
      artistName: booking.artist_name,
      service: booking.service,
      date: booking.date,
      balanceAmount,
      balanceDueDate,
    });

    logger.info({ bookingId: booking.id, userId: user.id }, "balance reminder sent");
    return NextResponse.json({ message: "Reminder sent to the client." });
  },
  { route: "POST /api/bookings/[id]/remind" },
);
