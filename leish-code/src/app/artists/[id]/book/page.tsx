"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { getArtist } from "@/lib/data";
import { formatRM } from "@/lib/utils";
import { Button } from "@/components/Button";

function BookingForm() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const artist = getArtist(params.id);
  const presetService = searchParams.get("service");

  const [service, setService] = useState(presetService ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [eventType, setEventType] = useState("");
  const [venue, setVenue] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<{ id: string } | null>(null);
  const [verifyRequired, setVerifyRequired] = useState<string | null>(null);
  const [verifyDevUrl, setVerifyDevUrl] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const selectedService = useMemo(
    () => artist?.services.find((s) => s.name === service),
    [artist, service],
  );

  if (!artist) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-lg font-semibold text-stone-900 dark:text-stone-100">Artist not found</p>
        <Button href="/artists" variant="outline" className="mt-6">
          Browse artists
        </Button>
      </div>
    );
  }

  // Narrowed alias so closures below keep the non-undefined type.
  const currentArtist = artist;

  if (confirmed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-8 w-8 text-emerald-600 dark:text-emerald-400"
          >
            <path
              fillRule="evenodd"
              d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.8a1 1 0 011.4 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">
          Booking requested!
        </h1>
        <p className="mt-3 text-stone-600 dark:text-stone-400">
          Your booking{" "}
          <span className="font-medium text-stone-900 dark:text-stone-100">
            #{confirmed.id.slice(0, 8)}
          </span>{" "}
          with {artist.name} for{" "}
          <span className="font-medium text-stone-900 dark:text-stone-100">
            {selectedService?.name ?? "a makeup session"}
          </span>{" "}
          on <span className="font-medium text-stone-900 dark:text-stone-100">{date}</span> at{" "}
          <span className="font-medium text-stone-900 dark:text-stone-100">{time}</span> has been
          sent to {artist.name}. You&apos;ll be notified when they accept and send you a quotation
          to review.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button href="/dashboard" variant="outline">
            Go to Dashboard
          </Button>
          <Button href="/artists">Browse more artists</Button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId: currentArtist.id,
          service,
          date,
          time,
          eventType,
          venue,
          guestCount: guestCount ? Number(guestCount) : 0,
          notes,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/login?redirect=${encodeURIComponent(`/artists/${currentArtist.id}/book`)}`);
          return;
        }
        if (body?.code === "EMAIL_NOT_VERIFIED") {
          setVerifyRequired(body.error ?? "Please verify your email before booking.");
          setVerifyDevUrl(body.devVerifyUrl ?? null);
          return;
        }
        setError(body?.error ?? "Could not create the booking. Please try again.");
        return;
      }
      setConfirmed(body.booking);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    setResending(true);
    setResendMsg(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Could not resend the verification email.");
        return;
      }
      setResendMsg("Verification email sent.");
      if (body.devVerifyUrl) setVerifyDevUrl(body.devVerifyUrl);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setResending(false);
    }
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";
  const labelCls = "mb-1.5 block text-sm font-medium text-stone-800 dark:text-stone-200";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav className="text-sm text-stone-500 dark:text-stone-400">
        <Link href="/artists" className="hover:text-rose-600 dark:hover:text-rose-400">
          Artists
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/artists/${artist.id}`}
          className="hover:text-rose-600 dark:hover:text-rose-400"
        >
          {artist.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-stone-800 dark:text-stone-200">Request Booking</span>
      </nav>

      <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        Request Booking
      </h1>
      <p className="mt-2 text-stone-500 dark:text-stone-400">
        Tell {artist.name} what you need — confirm instantly.
      </p>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_280px]">
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
        >
          <div>
            <label htmlFor="book-service" className={labelCls}>
              Service
            </label>
            <select
              id="book-service"
              name="service"
              value={service}
              onChange={(e) => setService(e.target.value)}
              required
              className={inputCls}
            >
              <option value="" disabled>
                Select a service…
              </option>
              {artist.services.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} — {formatRM(s.price)} ({s.duration})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="book-event-type" className={labelCls}>
                Event type
              </label>
              <select
                id="book-event-type"
                name="eventType"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                required
                className={inputCls}
              >
                <option value="" disabled>
                  Select event type…
                </option>
                {[
                  "Engagement",
                  "Solemnization",
                  "Reception",
                  "Full Wedding Package",
                  "Graduation",
                  "Dinner",
                  "Corporate",
                  "Other",
                ].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="book-date" className={labelCls}>
                Date
              </label>
              <input
                id="book-date"
                name="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="book-time" className={labelCls}>
                Preferred time
              </label>
              <select
                id="book-time"
                name="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
                className={inputCls}
              >
                <option value="" disabled>
                  Select a time…
                </option>
                {[
                  "9:00 AM",
                  "10:00 AM",
                  "11:00 AM",
                  "12:00 PM",
                  "2:00 PM",
                  "3:00 PM",
                  "4:00 PM",
                  "5:00 PM",
                  "6:00 PM",
                ].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="book-venue" className={labelCls}>
                Venue (optional)
              </label>
              <input
                id="book-venue"
                name="venue"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="e.g. Dewan Tunku, Shah Alam"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="book-guests" className={labelCls}>
                Expected guests (optional)
              </label>
              <input
                id="book-guests"
                name="guestCount"
                type="number"
                min={0}
                max={1000}
                value={guestCount}
                onChange={(e) => setGuestCount(e.target.value)}
                placeholder="e.g. 200"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label htmlFor="book-notes" className={labelCls}>
              Notes (optional)
            </label>
            <textarea
              id="book-notes"
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Venue address, inspirations, skin sensitivity…"
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
              {error}
            </p>
          )}

          {verifyRequired && (
            <div
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800/60 dark:bg-amber-500/10"
              role="alert"
            >
              <p className="font-medium text-amber-800 dark:text-amber-400">{verifyRequired}</p>
              <p className="mt-1 text-amber-700/90 dark:text-amber-300/80">
                Check your inbox and click the verification link, then try booking again.
              </p>
              {resendMsg && (
                <p className="mt-1 font-medium text-emerald-700 dark:text-emerald-400">
                  {resendMsg}
                </p>
              )}
              {verifyDevUrl && (
                <a
                  href={verifyDevUrl}
                  className="mt-2 block break-all text-xs font-medium text-rose-600 underline hover:text-rose-700 dark:text-rose-400"
                >
                  Open verification link (dev mode)
                </a>
              )}
              <button
                type="button"
                onClick={resendVerification}
                disabled={resending}
                className="mt-3 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
              >
                {resending ? "Sending…" : "Resend verification email"}
              </button>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={submitting || Boolean(verifyRequired)}>
            {submitting ? "Submitting…" : "Confirm Booking Request"}
          </Button>
          <p className="text-center text-xs text-stone-400 dark:text-stone-500">
            No payment is taken now — the artist confirms your slot first.
          </p>
        </form>

        {/* Summary card */}
        <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <div className="flex items-center gap-3">
            <Image
              src={artist.image}
              alt={artist.name}
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover"
            />
            <div>
              <p className="font-semibold text-stone-900 dark:text-stone-100">{artist.name}</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {artist.area}, {artist.state}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-stone-100 pt-4 text-sm dark:border-stone-800">
            <div className="flex justify-between">
              <span className="text-stone-500 dark:text-stone-400">Service</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {selectedService?.name ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500 dark:text-stone-400">Duration</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">
                {selectedService?.duration ?? "—"}
              </span>
            </div>
            <div className="flex justify-between border-t border-stone-100 pt-2 dark:border-stone-800">
              <span className="text-stone-500 dark:text-stone-400">Estimated total</span>
              <span className="font-semibold text-stone-900 dark:text-stone-100">
                {selectedService ? formatRM(selectedService.price) : "—"}
              </span>
            </div>
          </div>
          <p className="mt-4 rounded-xl bg-stone-50 p-3 text-xs leading-5 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
            The artist will confirm your slot instantly. Free cancellation up to 48 hours before
            your appointment.
          </p>
        </aside>
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-24 text-center text-stone-500">Loading…</div>
      }
    >
      <BookingForm />
    </Suspense>
  );
}
