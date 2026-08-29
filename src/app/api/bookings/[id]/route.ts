import { NextResponse } from "next/server";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { bookingActionSchema, applyBookingTransition } from "@/server/bookings";
import { getClaimedArtistIds } from "@/server/artist-profiles";
import { getClaimedStudioIds } from "@/server/studio-profiles";
import { getPaymentForBooking } from "@/server/payments";
import { getBookingFeeSen } from "@/server/settings";
import { getActiveQuotation, serializeQuotation } from "@/server/quotations";
import { notifyBookingStatusChanged, sendInvoiceEmail } from "@/server/booking-emails";
import { jsonError, readJson, statefulRoute } from "@/server/http";
import { logger } from "@/server/logger";
import { isAgnostEnabled, agnost } from "@/server/agnost";

const BALANCE_DUE_DAYS_BEFORE = 3;

/**
 * PATCH /api/bookings/[id]
 * Lifecycle actions matching the leish.my journey:
 *   accept / reject (MUA, on a requested booking)
 *   complete        (MUA, on a confirmed booking)
 *   cancel          (owner or MUA, on a non-terminal booking)
 * "confirmed" is reached only by the RM 200 booking-fee payment webhook.
 */
export const PATCH = statefulRoute(
  async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.error;

    const parsed = bookingActionSchema.safeParse((body.data as { action?: unknown })?.action);
    if (!parsed.success) return jsonError("Invalid action", 400);

    // Ownership guard for artist/studio roles: must have claimed the relevant profile.
    const isArtistRole = user.role === "artist" || user.role === "studio";
    if (isArtistRole) {
      const [claimedArtists, claimedStudios] = await Promise.all([
        getClaimedArtistIds(user.id),
        getClaimedStudioIds(user.id),
      ]);
      const isStudio = user.role === "studio" && claimedStudios.length > 0;
      const claimed = isStudio ? claimedStudios : claimedArtists;
      const bookingEntityId = isStudio ? (booking.studio_id ?? "") : booking.artist_id;
      if (!claimed.includes(bookingEntityId)) {
        return jsonError("You can only manage bookings for your claimed profile", 403);
      }
    }

    // Begin Agnost tracking.
    const interaction = isAgnostEnabled()
      ? agnost.begin({
          userId: user.id,
          agentName: "booking-status-update",
          input: JSON.stringify({ bookingId: id, action: parsed.data, fromStatus: booking.status }),
        })
      : null;

    try {
      const result = applyBookingTransition(booking.status, parsed.data, {
        isOwner: booking.user_id === user.id,
        role: user.role,
      });

      if (!result.ok) {
        interaction?.end(result.error ?? "Invalid transition", false);
        return jsonError(result.error ?? "Invalid transition", 403);
      }

      await db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(result.status, booking.id);

      // Notify the client about the status change; email the invoice on completion.
      await notifyBookingStatusChanged({
        bookingId: booking.id,
        ownerUserId: booking.user_id,
        artistName: booking.artist_name,
        service: booking.service,
        date: booking.date,
        time: booking.time,
        status: result.status,
      });
      if (parsed.data === "complete" && result.status === "completed") {
        await sendInvoiceEmail({
          bookingId: booking.id,
          ownerUserId: booking.user_id,
          artistName: booking.artist_name,
          service: booking.service,
          date: booking.date,
        });
      }

      logger.info(
        { bookingId: booking.id, action: parsed.data, status: result.status },
        "booking updated",
      );

      const quotation = await getActiveQuotation(booking.id);
      const payment = await getPaymentForBooking(booking.id, "deposit");
      const balancePayment = await getPaymentForBooking(booking.id, "balance");
      const total = quotation?.status === "expired" ? null : (quotation?.total ?? null);
      const bookingFeeSen = await getBookingFeeSen();

      interaction?.end(JSON.stringify({ bookingId: booking.id, action: parsed.data, newStatus: result.status }), true);
      return NextResponse.json({
        booking: {
          id: booking.id,
          artistId: booking.artist_id,
          studioId: booking.studio_id,
          artistName: booking.artist_name,
          service: booking.service,
          price: booking.price,
          date: booking.date,
          time: booking.time,
          notes: booking.notes,
          status: result.status,
          eventType: booking.event_type,
          venue: booking.venue,
          guestCount: booking.guest_count,
          quotation: quotation ? serializeQuotation(quotation) : null,
          totalPrice: total,
          balanceDueDate: booking.date
            ? new Date(
                new Date(`${booking.date}T00:00:00`).getTime() - BALANCE_DUE_DAYS_BEFORE * 86_400_000,
              )
                .toISOString()
                .slice(0, 10)
            : null,
          balanceAmount: total !== null ? Math.max(0, total - bookingFeeSen) : null,
          payment: payment
            ? {
                amount: payment.amount,
                type: payment.type,
                status: payment.status,
                provider: payment.provider,
                reference: payment.provider_ref,
                url: payment.provider_url,
              }
            : null,
          balancePayment: balancePayment
            ? {
                amount: balancePayment.amount,
                type: balancePayment.type,
                status: balancePayment.status,
                provider: balancePayment.provider,
                reference: balancePayment.provider_ref,
                url: balancePayment.provider_url,
              }
            : null,
        },
      });
    } catch (err) {
      interaction?.end(err instanceof Error ? err.message : String(err), false);
      throw err;
    }
  },
  { route: "PATCH /api/bookings/[id]" },
);
