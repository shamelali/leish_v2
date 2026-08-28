import { NextResponse } from "next/server";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { getClaimedArtistIds } from "@/server/artist-profiles";
import { createQuotation, serializeQuotation } from "@/server/quotations";
import { quotationSchema } from "@/server/validation";
import { jsonError, readJson, statefulRoute } from "@/server/http";
import { logger } from "@/server/logger";
import { sendQuotationEmail } from "@/server/booking-emails";
import { isAgnostEnabled, agnost } from "@/server/agnost";

/**
 * POST /api/bookings/[id]/quotation
 * MUA (with a claimed profile matching the booking's artist) builds and
 * sends a quotation after accepting the request. A 24h review window starts.
 * Sending a new quotation supersedes the previous pending one.
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
    if (!isArtistRole) return jsonError("Only artists can send quotations", 403);

    const claimed = await getClaimedArtistIds(user.id);
    const booking = (await db.prepare("SELECT * FROM bookings WHERE id = ?").get(id)) as
      BookingRow | undefined;
    if (!booking) return jsonError("Booking not found", 404);
    if (!claimed.includes(booking.artist_id)) {
      return jsonError("You can only quote for your claimed artist profile", 403);
    }
    if (booking.status !== "accepted") {
      return jsonError("Quotations can only be sent for accepted requests", 409);
    }

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.error;
    const parsed = quotationSchema.safeParse(body.data);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid quotation", 400);
    }

    // Begin Agnost tracking.
    const interaction = isAgnostEnabled()
      ? agnost.begin({
          userId: user.id,
          agentName: "quotation-create",
          input: JSON.stringify({ bookingId: id }),
        })
      : null;

    try {
      const quotation = await createQuotation(booking.id, parsed.data);

      // Notify the client with the quotation breakdown and 24h deadline.
      await sendQuotationEmail({
        bookingId: booking.id,
        ownerUserId: booking.user_id,
        artistName: booking.artist_name,
        service: booking.service,
        date: booking.date,
        time: booking.time,
        totalSen: quotation.total,
        expiresAt: quotation.expires_at,
      });

      logger.info(
        { bookingId: booking.id, quotationId: quotation.id, total: quotation.total },
        "quotation sent",
      );

      interaction?.end(JSON.stringify({ quotationId: quotation.id, total: quotation.total }), true);
      return NextResponse.json({ quotation: serializeQuotation(quotation) }, { status: 201 });
    } catch (err) {
      interaction?.end(err instanceof Error ? err.message : String(err), false);
      throw err;
    }
  },
  { route: "POST /api/bookings/[id]/quotation" },
);
