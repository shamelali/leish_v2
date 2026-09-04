import { NextResponse } from "next/server";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { getClaimedArtistIds } from "@/server/artist-profiles";
import { getClaimedStudioIds } from "@/server/studio-profiles";
import { buildInvoice, renderInvoiceHtml } from "@/server/invoices";
import { jsonError, tryRoute } from "@/server/http";

/**
 * GET /api/bookings/[id]/invoice
 * Returns a printable HTML invoice (quotation lines + booking fee).
 * Accessible to the booking owner and the claimed artist.
 */
export const GET = tryRoute(
  async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const invoice = await buildInvoice(booking);
    if (!invoice) return jsonError("No invoice available (quotation missing or expired)", 404);

    return new NextResponse(renderInvoiceHtml(invoice), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
  { route: "GET /api/bookings/[id]/invoice" },
);
