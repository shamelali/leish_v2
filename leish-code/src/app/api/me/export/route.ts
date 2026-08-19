import { NextResponse } from "next/server";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { getActiveQuotation, serializeQuotation } from "@/server/quotations";
import { getPaymentForBooking } from "@/server/payments";
import { jsonError, statefulRoute } from "@/server/http";

/**
 * GET /api/me/export
 * GDPR-style data portability: returns everything the platform holds for
 * the signed-in user (profile, bookings + quotations + payments, messages,
 * tokens, emails sent to them) as a single JSON document.
 */
export const GET = statefulRoute(
  async function GET(request: Request) {
    const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
    const payload = token ? await verifySessionToken(token) : null;
    if (!payload) return jsonError("Not authenticated", 401);

    const db = getDb();
    const user = (await db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
      UserRow | undefined;
    if (!user) return jsonError("Not authenticated", 401);

    const bookings = (await db
      .prepare("SELECT * FROM bookings WHERE user_id = ? ORDER BY date DESC")
      .all(user.id)) as unknown as BookingRow[];

    const enrichedBookings = await Promise.all(
      bookings.map(async (b) => {
        const [quotation, payment, messages] = await Promise.all([
          getActiveQuotation(b.id),
          getPaymentForBooking(b.id),
          db
            .prepare(
              "SELECT id, sender_id, body, created_at FROM messages WHERE booking_id = ? ORDER BY created_at ASC",
            )
            .all(b.id) as Promise<unknown[]>,
        ]);
        return {
          id: b.id,
          artistId: b.artist_id,
          artistName: b.artist_name,
          service: b.service,
          price: b.price,
          date: b.date,
          time: b.time,
          notes: b.notes,
          eventType: b.event_type,
          venue: b.venue,
          guestCount: b.guest_count,
          status: b.status,
          createdAt: b.created_at,
          quotation: quotation ? serializeQuotation(quotation) : null,
          payment: payment ?? null,
          messages,
        };
      }),
    );

    const messagesSentByMe = (await db
      .prepare(
        "SELECT id, booking_id, body, created_at FROM messages WHERE sender_id = ? ORDER BY created_at DESC",
      )
      .all(user.id)) as unknown as {
      id: string;
      booking_id: string;
      body: string;
      created_at: string;
    }[];

    const outboxEmails = (await db
      .prepare(
        "SELECT to_email, subject, text, created_at FROM email_outbox WHERE to_email = ? ORDER BY created_at DESC",
      )
      .all(user.email)) as unknown as {
      to_email: string;
      subject: string;
      text: string;
      created_at: string;
    }[];

    const exportDoc = {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: Boolean(user.email_verified),
        createdAt: user.created_at,
      },
      bookings: enrichedBookings,
      messagesSent: messagesSentByMe,
      emailsReceived: outboxEmails,
    };

    return NextResponse.json(exportDoc);
  },
  { route: "GET /api/me/export" },
);
