"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

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
  /** Deposit (sen) from platform settings — shown in the pricing summary. */
  bookingFeeSen?: number;
}

/**
 * Booking request flow (db-facade journey):
 * browse → request → MUA accepts → quotation → deposit secures the date
 * → balance before the event. This component only sends the request; the
 * quotation and payment steps live in the dashboard.
 */
function todayISO(): string {
  if (typeof window === "undefined") {
    return "2024-01-01";
  }
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

const fieldCls =
  "w-full rounded-xl border border-line-strong bg-surface p-3 text-base sm:text-sm text-ink placeholder:text-ink-subtle transition-colors duration-[var(--dur-fast)] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export default function BookingCalendar({
  artistId,
  artistName,
  services,
  eventTypes,
  bookingFeeSen = 5_000,
}: BookingCalendarProps) {
  const bookingFeeRM = Math.round(bookingFeeSen / 100);
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

      const data = (await res.json()) as {
        error?: string;
        code?: string;
        booking?: { id: string };
      };
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

      setCreatedBookingId(data.booking?.id ?? "");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (createdBookingId) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--elev-card)]">
        <div className="rounded-xl border border-success/30 bg-success-soft p-5">
          <div className="flex items-start gap-3">
            <svg
              className="h-6 w-6 shrink-0 text-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-semibold text-success">Booking request sent!</p>
              <p className="mt-1 text-sm leading-6 text-ink-muted">
                {artistName} will review your request and send a quotation (valid 24 hours). Pay the
                RM {bookingFeeRM} booking fee from your dashboard to secure the date.
              </p>
            </div>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 px-4 font-semibold text-primary-fg shadow-sm transition-all duration-[var(--dur-fast)] hover:bg-primary-hover active:scale-[0.98]"
        >
          Track request in Dashboard &rarr;
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--elev-card)]">
      <form onSubmit={handleBookingSubmit} className="space-y-6">
        {/* Step 1: Service Selection */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-ink">1. Select Service</label>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {services.map((s) => {
              const active = selectedService === s.name;
              return (
                <button
                  type="button"
                  key={s.name}
                  aria-pressed={active}
                  onClick={() => setSelectedService(s.name)}
                  disabled={isSubmitting}
                  className={cn(
                    "flex flex-col rounded-xl border p-3.5 text-left transition-all duration-[var(--dur-fast)]",
                    active
                      ? "border-primary bg-primary-soft/60 ring-2 ring-ring/30"
                      : "border-line bg-surface hover:border-primary/50 hover:bg-primary-soft/30",
                  )}
                >
                  <span className="text-sm font-medium text-ink">{s.name}</span>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-link">RM {s.price}</span>
                    <span className="text-ink-subtle">{s.duration}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Date, time & event type */}
        <div>
          <label htmlFor="booking-date" className="mb-2 block text-sm font-semibold text-ink">
            2. Choose Date &amp; Time
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              id="booking-date"
              type="date"
              value={date}
              min={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              disabled={isSubmitting}
              className={fieldCls}
            />
            <input
              id="booking-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={isSubmitting}
              aria-label="Booking time"
              className={fieldCls}
            />
          </div>

          <label
            htmlFor="booking-event-type"
            className="mb-2 mt-4 block text-sm font-semibold text-ink"
          >
            3. Event Type
          </label>
          <select
            id="booking-event-type"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            disabled={isSubmitting}
            className={fieldCls}
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
          <label htmlFor="booking-notes" className="mb-1.5 block text-sm font-semibold text-ink">
            4. Special Requests (Optional)
          </label>
          <textarea
            id="booking-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="E.g., Event venue in Bangsar, bridal look preference, early call time…"
            rows={2}
            disabled={isSubmitting}
            maxLength={2000}
            className={cn(fieldCls, "resize-none")}
          />
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
          >
            <svg
              className="mt-0.5 h-5 w-5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
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
                  className="mt-1 inline-block text-xs font-semibold underline"
                >
                  Verify your email &rarr;
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Pricing Summary */}
        {service && (
          <div className="space-y-2 rounded-xl border border-line bg-surface-sunken p-4 text-sm">
            <div className="flex justify-between text-ink-muted">
              <span>Service price</span>
              <span>RM {servicePrice}</span>
            </div>
            <div className="flex justify-between text-ink-muted">
              <span>Booking fee (after quotation, secures your date)</span>
              <span>RM {bookingFeeRM}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-xs text-ink-subtle">
              <span>Balance due 3 days before event</span>
              <span>RM {Math.max(0, servicePrice - bookingFeeRM)}</span>
            </div>
          </div>
        )}

        {/* Submit CTA — sticks to the viewport bottom on mobile so the
            primary action is always one thumb-tap away. */}
        <div className="sticky bottom-0 -mx-6 -mb-6 rounded-b-2xl border-t border-line bg-surface/95 px-6 pb-4 pt-3 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <button
            type="submit"
            disabled={!selectedService || !date || !time || isSubmitting}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 font-semibold text-primary-fg shadow-sm transition-all duration-[var(--dur-fast)] hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin text-primary-fg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
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
        </div>
      </form>
    </div>
  );
}
