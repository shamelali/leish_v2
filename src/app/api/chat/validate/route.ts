import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { getClaimedArtistIds } from "@/server/artist-profiles";
import { getClaimedStudioIds } from "@/server/studio-profiles";

interface ValidateChatRequest {
  bookingId: string;
}

interface ChatUser {
  userId: string;
  name: string;
  role: "client" | "artist" | "studio" | "admin";
  status: "online" | "away" | "offline";
  lastSeen: string;
  isTyping: boolean;
}

interface ChatBooking {
  id: string;
  userId: string;
  artistId: string | null;
  studioId: string | null;
  status: string;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 });
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    let body: ValidateChatRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.bookingId) {
      return NextResponse.json({ error: "bookingId required" }, { status: 400 });
    }

    const db = await getDb();

    // Get user
    const user = await db
      .prepare("SELECT id, name, role FROM users WHERE id = ?")
      .get(payload.sub) as { id: string; name: string; role: string } | undefined;

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get booking
    const booking = await db
      .prepare("SELECT id, user_id, artist_id, studio_id, status FROM bookings WHERE id = ?")
      .get(body.bookingId) as { id: string; user_id: string; artist_id: string | null; studio_id: string | null; status: string } | undefined;

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Authorization checks (reused from chat-bus.ts)
    const isOwner = booking.user_id === user.id;
    const isArtistRole = user.role === "artist" || user.role === "studio";

    let isClaimed = false;
    let isLegacyClaimed = false;

    if (isArtistRole) {
      const [claimedArtists, claimedStudios] = await Promise.all([
        getClaimedArtistIds(user.id),
        getClaimedStudioIds(user.id),
      ]);

      const isStudio = user.role === "studio" && claimedStudios.length > 0;
      isClaimed = isStudio
        ? !!(booking.studio_id && claimedStudios.includes(booking.studio_id))
        : !!(booking.artist_id && claimedArtists.includes(booking.artist_id));

      // Fallback: studio who legacy-claimed an artist
      isLegacyClaimed = !isStudio && user.role === "studio" && !!(booking.artist_id && claimedArtists.includes(booking.artist_id));
    }

    const authorized = isOwner || isClaimed || isLegacyClaimed || user.role === "admin";

    if (!authorized) {
      return NextResponse.json({ error: "Not authorized for this booking" }, { status: 403 });
    }

    // Return user and booking info for chat
    const chatUser: ChatUser = {
      userId: user.id,
      name: user.name,
      role: user.role as ChatUser["role"],
      status: "online",
      lastSeen: new Date().toISOString(),
      isTyping: false,
    };

    const chatBooking: ChatBooking = {
      id: booking.id,
      userId: booking.user_id,
      artistId: booking.artist_id,
      studioId: booking.studio_id,
      status: booking.status,
    };

    return NextResponse.json({ user: chatUser, booking: chatBooking });
  } catch (error) {
    console.error("Chat validation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}