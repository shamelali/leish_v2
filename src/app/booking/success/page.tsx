import { createClient } from "@/lib/supabase/server";

/**
 * v1 note: this page used a setTimeout mock instead of a real payment
 * status check. Query the actual booking status — the Billplz webhook
 * (src/app/api/payments/billplz/webhook/route.ts) is the source of truth
 * and will have already flipped status to "confirmed" by the time the
 * user is redirected here, in the common case. If it hasn't (webhook
 * lag), show a "processing" state rather than a false success.
 */
export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ bookingId?: string }>;
}) {
  const { bookingId } = await searchParams;
  if (!bookingId) {
    return <main className="p-16">Missing booking reference.</main>;
  }

  const supabase = await createClient();
  const { data: booking, error } = (await supabase
    .from("bookings")
    .select("status, amount")
    .eq("id", bookingId)
    .single()) as { data: { status: string; amount: number } | null; error: unknown };

  if (!booking) {
    return <main className="p-16">Booking not found.</main>;
  }

  if (booking.status === "confirmed") {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">Booking confirmed 🎉</h1>
        <p className="mt-2 text-gray-600">Amount paid: RM {booking.amount}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">Processing your payment…</h1>
      <p className="mt-2 text-gray-600">This usually takes a few seconds. Refresh in a moment.</p>
    </main>
  );
}
