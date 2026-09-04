import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { getClaimedArtistIds } from "@/server/artist-profiles";
import { getClaimedStudioIds } from "@/server/studio-profiles";
import { jsonError, readJson, statefulRoute, tryRoute } from "@/server/http";
import { publishToBooking } from "@/server/chat-bus";
import { z } from "zod";

/**
 * GET  /api/bookings/[id]/messages — the message thread (owner + claimed artist).
 * POST /api/bookings/[id]/messages — send a message ({ body }).
 * Simple chat per booking, ordered oldest → newest.
 */

const messageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(2000),
});

interface MessageRow {
  id: string;
  booking_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

async function authorizeBookingAccess(request: Request, bookingId: string) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return { error: jsonError("Not authenticated", 401) };

  const db = await getDb();
  const user = (await db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    UserRow | undefined;
  if (!user) return { error: jsonError("Not authenticated", 401) };

  const booking = (await db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId)) as
    BookingRow | undefined;
  if (!booking) return { error: jsonError("Booking not found", 404) };

  const isArtistRole = user.role === "artist" || user.role === "studio";
  const isOwner = booking.user_id === user.id;
  const [claimedArtists, claimedStudios] = isArtistRole
    ? await Promise.all([getClaimedArtistIds(user.id), getClaimedStudioIds(user.id)])
    : ([[], []] as unknown as [string[], string[]]);
  const isStudio = user.role === "studio" && claimedStudios.length > 0;
  const isClaimed = isStudio
    ? claimedStudios.includes(booking.studio_id ?? "")
    : claimedArtists.includes(booking.artist_id);
  // Fallback: studio who legacy-claimed an artist can still access artist bookings
  const isLegacyClaimed =
    !isStudio && user.role === "studio" && claimedArtists.includes(booking.artist_id);
  if (!isOwner && !isClaimed && !isLegacyClaimed) {
    return { error: jsonError("Not authorized", 403) };
  }
  return { user, booking };
}

export const GET = tryRoute(
  async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const auth = await authorizeBookingAccess(request, id);
    if (auth.error) return auth.error;

    const rows = (await getDb()
      .prepare("SELECT * FROM messages WHERE booking_id = ? ORDER BY created_at ASC")
      .all(id)) as unknown as MessageRow[];

    const senders = (await getDb()
      .prepare(
        "SELECT id, name FROM users WHERE id IN (SELECT DISTINCT sender_id FROM messages WHERE booking_id = ?)",
      )
      .all(id)) as { id: string; name: string }[];
    const senderNames = new Map(senders.map((s) => [s.id, s.name]));

    return NextResponse.json({
      messages: rows.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        senderName: senderNames.get(m.sender_id) ?? "Unknown",
        body: m.body,
        createdAt: m.created_at,
      })),
    });
  },
  { route: "GET /api/bookings/[id]/messages" },
);

export const POST = statefulRoute(
  async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const auth = await authorizeBookingAccess(request, id);
    if (auth.error) return auth.error;
    if (!auth.user) return jsonError("Not authenticated", 401);

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.error;
    const parsed = messageSchema.safeParse(body.data);
    if (!parsed.success)
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid message", 400);

    const message: MessageRow = {
      id: randomUUID(),
      booking_id: id,
      sender_id: auth.user.id,
      body: parsed.data.body,
      created_at: new Date().toISOString(),
    };

    await getDb()
      .prepare(
        "INSERT INTO messages (id, booking_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(message.id, message.booking_id, message.sender_id, message.body, message.created_at);

    // Broadcast to live SSE subscribers.
    publishToBooking(id, {
      id: message.id,
      senderId: message.sender_id,
      senderName: auth.user.name,
      body: message.body,
      createdAt: message.created_at,
    });

    return NextResponse.json(
      {
        message: {
          id: message.id,
          senderId: message.sender_id,
          senderName: auth.user.name,
          body: message.body,
          createdAt: message.created_at,
        },
      },
      { status: 201 },
    );
  },
  { route: "POST /api/bookings/[id]/messages" },
);
