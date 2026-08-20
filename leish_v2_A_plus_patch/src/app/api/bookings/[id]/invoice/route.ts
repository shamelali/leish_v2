import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getSession } from "@/server/auth/session";
import { maskEmail, maskPhone } from "@/server/sanitize";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  const booking = await getDb().prepare("SELECT * FROM bookings WHERE id=$1").get(params.id).catch(() =>
    getDb().prepare("SELECT * FROM bookings WHERE id=?").get(params.id)
  ) as any;
  
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (booking.user_id !== user.id && booking.claimed_artist_id !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const quotation = await getDb().prepare("SELECT * FROM quotations WHERE booking_id=$1 AND status='active'").get(params.id).catch(() =>
    getDb().prepare("SELECT * FROM quotations WHERE booking_id=? AND status='active'").get(params.id)
  ) as any;

  // FIX: Mask PII in invoice per PDPA
  const safeBooking = {
    ...booking,
    client_email: maskEmail(booking.client_email || user.email),
    client_phone: maskPhone(booking.client_phone),
  };

  const html = `
    <html><body style="font-family: sans-serif; padding: 40px;">
      <h1>Leish! Invoice #${booking.id.slice(0,8)}</h1>
      <p>Client: ${safeBooking.client_email} | ${safeBooking.client_phone}</p>
      <p>Date: ${booking.date} | Event: ${booking.event_type}</p>
      <hr/>
      <p>Quotation Total: RM ${quotation?.total || 0}</p>
      <p>Booking Fee (non-refundable): RM 200</p>
      <p><strong>Balance Due: RM ${(quotation?.total || 0) - 200} (3 days before event)</strong></p>
      <p style="color:#666; font-size:12px;">PDPA: This invoice masks PII. Full details visible only to owner in dashboard.</p>
    </body></html>
  `;
  return new NextResponse(html, { headers: { "Content-Type": "text/html", "Cache-Control": "private, no-store" } });
}
