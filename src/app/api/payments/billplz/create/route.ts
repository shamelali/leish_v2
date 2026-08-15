import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createBill } from "@/lib/payments/billplz";
import { z } from "zod";

const schema = z.object({ bookingId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // RLS ensures this only returns a row if the caller is the booking's
  // client — do not add a manual ownership check here, trust the policy.
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, deposit_amount, status, client_id, profiles ( full_name, phone )")
    .eq("id", parsed.data.bookingId)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status !== "pending_payment") {
    return NextResponse.json({ error: "Booking is not payable." }, { status: 409 });
  }

  const appUrl = process.env.NEXT_PUBLIC_URL;
  if (!appUrl) {
    throw new Error("[billplz/create] NEXT_PUBLIC_URL is not set.");
  }

  const bill = await createBill({
    bookingId: booking.id,
    amountCents: Math.round(booking.deposit_amount * 100),
    name: user.email ?? "Leish client",
    email: user.email ?? "",
    description: `Leish booking deposit — ${booking.id}`,
    callbackUrl: `${appUrl}/api/payments/billplz/webhook`,
    redirectUrl: `${appUrl}/booking/success?bookingId=${booking.id}`,
  });

  return NextResponse.json({ url: bill.url });
}
