"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface CatalogService {
  name: string;
  price: number;
  duration: string;
}

interface EventTypeOption {
  id: string;
  label: string;
}

interface BookingCalendarProps {
  artistId: string;
  artistName: string;
  services: CatalogService[];
  eventTypes: EventTypeOption[];
}

const BOOKING_FEE_RM = 200;

function todayISO(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Booking request flow (db-facade journey):
 * browse → request → MUA accepts → quotation (24h) → pay RM 200 booking fee
 * → webhook confirms. This component only sends the request; the quotation
 * and payment steps live in the dashboard.
 */
export default function BookingCalendar({
  artistId,
  artistName,
  services,
  eventTypes,
}: BookingCalendarProps) {
  const router = useRouter();

  const [selectedService, setSelectedService] = useState<string | null>(services[0]?.name ?? null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [eventType, setEventType] = useState<string>(eventTypes[0]?.label ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  const service = services.find((s) => s.name === selectedService);
  const servicePrice = service?.price ?? 0;

  async function handleBookingSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedService || !date || !time) {
      setError("Choose a service, date and time to continue.");
      return;
    }

    setError(null);
    setNeedsVerification(false);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId,
          service: selectedService,
          date,
          time,
          eventType,
          venue: "",
          guestCount: 0,
          notes: notes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const message: string = data.error ?? "Unable to send your booking request.";
        if (res.status === 401) {
          setError("Please sign in to send a booking request.");
          router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        if (
          data.code === "EMAIL_NOT_VERIFIED" ||
          message.toLowerCase().includes("verify your email")
        ) {
          setNeedsVerification(true);
          setError(message);
          return;
        }
        setError(message);
        return;
      }

      setCreatedBookingId(data.booking.id);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (createdBookingId) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="rounded-xl bg-green-50 border border-green-200 p-5 dark:bg-green-950/40 dark:border-green-900">
          <div className="flex items-start gap-3">
            <svg
              className="h-6 w-6 text-green-600 dark:text-green-400 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-semibold text-green-800 dark:text-green-200">
                Booking request sent!
              </p>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                {artistName} will review your request and send a quotation (valid 24 hours). Pay the
                RM {BOOKING_FEE_RM} booking fee from your dashboard to secure the date.
              </p>
            </div>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 px-4 font-semibold text-white shadow-sm hover:bg-rose-700 transition-all"
        >
          Track request in Dashboard &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <form onSubmit={handleBookingSubmit} className="space-y-6">
        {/* Step 1: Service Selection */}
        <div>
          <label className="block text-sm font-semibold text-stone-900 dark:text-stone-100 mb-2">
            1. Select Service
          </label>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {services.map((s) => {
              const active = selectedService === s.name;
              return (
                <button
                  type="button"
                  key={s.name}
                  onClick={() => setSelectedService(s.name)}
                  disabled={isSubmitting}
                  className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                    active
                      ? "border-rose-600 bg-rose-50/60 ring-2 ring-rose-500/20 dark:border-rose-500 dark:bg-rose-950/30"
                      : "border-stone-200 hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700 bg-white dark:bg-stone-900/60"
                  }`}
                >
                  <span className="font-medium text-sm text-stone-900 dark:text-stone-100">
                    {s.name}
                  </span>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      RM {s.price}
                    </span>
                    <span className="text-stone-400">{s.duration}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Date, time & event type */}
        <div>
          <label className="block text-sm font-semibold text-stone-900 dark:text-stone-100 mb-2">
            2. Choose Date &amp; Time
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="date"
              value={date}
              min={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:[color-scheme:dark] dark:focus:ring-rose-950"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:[color-scheme:dark] dark:focus:ring-rose-950"
            />
          </div>

          <label className="block text-sm font-semibold text-stone-900 dark:text-stone-100 mt-4 mb-2">
            3. Event Type
          </label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            disabled={isSubmitting}
            className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:ring-rose-950"
          >
            {eventTypes.map((et) => (
              <option key={et.id} value={et.label}>
                {et.label}
              </option>
            ))}
          </select>
        </div>

        {/* Step 4: Optional Notes */}
        <div>
          <label className="block text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1.5">
            4. Special Requests (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="E.g., Event venue in Bangsar, bridal look preference, early call time…"
            rows={2}
            disabled={isSubmitting}
            maxLength={2000}
            className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-800 placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:ring-rose-950"
          />
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300 flex items-start gap-3">
            <svg
              className="h-5 w-5 text-red-500 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-medium">{error}</p>
              {needsVerification && (
                <Link
                  href="/verify-email"
                  className="mt-1 inline-block text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                >
                  Verify your email &rarr;
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Pricing Summary */}
        {service && (
          <div className="rounded-xl bg-stone-50 p-4 dark:bg-stone-800/40 border border-stone-100 dark:border-stone-800 text-sm space-y-2">
            <div className="flex justify-between text-stone-600 dark:text-stone-400">
              <span>Service price</span>
              <span>RM {servicePrice}</span>
            </div>
            <div className="flex justify-between text-stone-600 dark:text-stone-400">
              <span>Booking fee (after quotation, secures your date)</span>
              <span>RM {BOOKING_FEE_RM}</span>
            </div>
            <div className="flex justify-between text-xs text-stone-500 border-t border-stone-200 dark:border-stone-700/60 pt-2">
              <span>Balance due 3 days before event</span>
              <span>RM {Math.max(0, servicePrice - BOOKING_FEE_RM)}</span>
            </div>
          </div>
        )}

        {/* Submit CTA */}
        <button
          type="submit"
          disabled={!selectedService || !date || !time || isSubmitting}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-600 py-3.5 px-4 font-semibold text-white shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Sending request…</span>
            </>
          ) : (
            <span>Send Booking Request &rarr;</span>
          )}
        </button>
      </form>
    </div>
  );
}
