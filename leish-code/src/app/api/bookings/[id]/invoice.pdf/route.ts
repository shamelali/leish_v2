import { NextResponse } from "next/server";
import { getDb, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { buildInvoice } from "@/server/invoices";
import { buildInvoicePdf } from "@/server/invoice-pdf";
import { jsonError, tryRoute } from "@/server/http";

/**
 * GET /api/bookings/[id]/invoice.pdf
 * Downloadable PDF version of the invoice. Accessible to the booking owner
 * and the claimed artist (same authorization as the HTML invoice).
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
    if (!isOwner && !isArtistRole) return jsonError("Not authorized", 403);

    const invoice = await buildInvoice(booking);
    if (!invoice) return jsonError("No invoice available (quotation missing or expired)", 404);

    const pdf = await buildInvoicePdf(invoice);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  },
  { route: "GET /api/bookings/[id]/invoice.pdf" },
);
