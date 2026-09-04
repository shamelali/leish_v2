import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { getClaimedArtistIds } from "@/server/artist-profiles";
import { getClaimedStudioIds } from "@/server/studio-profiles";
import { subscribeToBooking, type ChatMessageEvent } from "@/server/chat-bus";
import { jsonError } from "@/server/http";

/**
 * GET /api/bookings/[id]/messages/stream
 * Server-Sent Events live chat stream.
 * - Authorization: booking owner or claimed artist.
 * - Sends all existing messages first, then live ones as they arrive.
 * - Heartbeat comment every 25s keeps proxies from closing the connection.
 * - Cleans up the subscription when the client disconnects.
 */

interface MessageRow {
  id: string;
  booking_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

function sse(data: string, event?: string): string {
  return `${event ? `event: ${event}\n` : ""}data: ${data}\n\n`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  if (!isOwner && !isClaimed && !isLegacyClaimed) return jsonError("Not authorized", 403);

  // History first, oldest → newest.
  const history = (await db
    .prepare("SELECT * FROM messages WHERE booking_id = ? ORDER BY created_at ASC")
    .all(id)) as unknown as MessageRow[];
  const senderNames = new Map(
    (
      await db
        .prepare(
          "SELECT id, name FROM users WHERE id IN (SELECT DISTINCT sender_id FROM messages WHERE booking_id = ?)",
        )
        .all<{ id: string; name: string }>(id)
    ).map((s) => [s.id, s.name]),
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Send history.
      for (const m of history) {
        const event: ChatMessageEvent = {
          id: m.id,
          senderId: m.sender_id,
          senderName: senderNames.get(m.sender_id) ?? "Unknown",
          body: m.body,
          createdAt: m.created_at,
        };
        controller.enqueue(encoder.encode(sse(JSON.stringify(event), "message")));
      }
      controller.enqueue(encoder.encode(sse("{}", "ready")));

      // Subscribe to live messages.
      const unsubscribe = subscribeToBooking(id, (message) => {
        controller.enqueue(encoder.encode(sse(JSON.stringify(message), "message")));
      });

      // Heartbeat every 25s.
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 25_000);

      // Cleanup on client disconnect.
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
