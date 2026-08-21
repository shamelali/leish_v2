import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/server/db";
import { verifySessionToken, SESSION_COOKIE } from "@/server/session";

/**
 * Post-payment landing page (db-facade backend).
 *
 * v1 note: this page used a setTimeout mock instead of a real payment status
 * check. It now queries the actual booking status — the Billplz webhook
 * (src/app/api/payments/webhook/route.ts) is the source of truth and will
 * have already flipped status to "confirmed" by the time the user is
 * redirected here, in the common case. If it hasn't (webhook lag), show a
 * "processing" state rather than a false success.
 */
export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ bookingId?: string }>;
}) {
  const { bookingId } = await searchParams;
  if (!bookingId) {
    return (
      <main className="p-16 text-center text-stone-600 dark:text-stone-300">
        Missing booking reference.
      </main>
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  const booking = payload
    ? ((await (
        await getDb()
      )
        .prepare(
          "SELECT id, status, service, artist_name, date, time FROM bookings WHERE id = ? AND user_id = ?",
        )
        .get(bookingId, payload.sub)) as
        | {
            id: string;
            status: string;
            service: string;
            artist_name: string;
            date: string;
            time: string;
          }
        | undefined)
    : undefined;

  const isConfirmed = booking?.status === "confirmed" || booking?.status === "completed";

  return (
    <main className="min-h-screen bg-stone-50 py-16 dark:bg-stone-950">
      <div className="mx-auto max-w-lg px-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900 text-center">
          {!booking ? (
            <>
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
                Booking not found
              </h1>
              <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                We couldn&apos;t find this booking on your account.
              </p>
              <Link
                href="/dashboard"
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-rose-600 px-5 py-2.5 font-semibold text-white hover:bg-rose-700"
              >
                Go to Dashboard
              </Link>
            </>
          ) : isConfirmed ? (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
                <svg
                  className="h-8 w-8 text-green-600 dark:text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
                Booking confirmed!
              </h1>
              <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                {booking.service} with {booking.artist_name} on {booking.date} at {booking.time}.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
                <svg
                  className="h-8 w-8 text-amber-600 dark:text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">
                Payment processing…
              </h1>
              <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                Your payment is being confirmed. We&apos;ll update this booking the moment the
                payment clears.
              </p>
            </>
          )}

          <Link
            href="/dashboard"
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-rose-600 px-5 py-2.5 font-semibold text-white hover:bg-rose-700"
          >
            View in Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
