"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBooking } from "@/lib/actions/bookings";

interface Slot {
  id: string;
  start_at: string;
  end_at: string;
  is_booked: boolean;
}

interface Service {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  duration_minutes: number;
}

interface BookingCalendarProps {
  providerId: string;
  slots: Slot[];
  services: Service[];
  defaultDepositPercent?: number;
}

export default function BookingCalendar({
  providerId,
  slots,
  services,
  defaultDepositPercent = 30,
}: BookingCalendarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    services[0]?.id ?? null,
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const availableSlots = slots.filter((s) => !s.is_booked);
  const selectedService = services.find((s) => s.id === selectedServiceId);

  // Financial calculations
  const servicePrice = selectedService?.price ?? 0;
  const depositAmount = Math.round((servicePrice * defaultDepositPercent) / 100);
  const balanceAmount = Math.max(0, servicePrice - depositAmount);

  async function handleBookingSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedServiceId || !selectedSlotId) return;

    setError(null);
    setIsConflict(false);

    startTransition(async () => {
      try {
        // 1. Create booking server-side (server resolves pricing)
        const booking = await createBooking({
          providerId,
          serviceId: selectedServiceId,
          slotId: selectedSlotId,
          notes: notes.trim() || undefined,
        });

        // 2. Request Billplz payment bill for the deposit
        setIsRedirecting(true);
        const payRes = await fetch("/api/payments/billplz/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId: booking.id }),
        });

        const payData = await payRes.json();
        if (!payRes.ok || !payData.url) {
          throw new Error(payData.error || "Unable to initiate payment gateway.");
        }

        // 3. Redirect to hosted payment page
        window.location.assign(payData.url);
      } catch (err: unknown) {
        setIsRedirecting(false);
        const message = err instanceof Error ? err.message : "Something went wrong.";

        if (
          message.toLowerCase().includes("slot was just booked") ||
          message.toLowerCase().includes("duplicate") ||
          message.toLowerCase().includes("conflict")
        ) {
          setIsConflict(true);
          setSelectedSlotId(null);
          setError("This time slot was just booked by another client. Please select another slot.");
        } else if (message.toLowerCase().includes("not authenticated")) {
          setError("Please sign in to complete your booking.");
          router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        } else {
          setError(message);
        }
      }
    });
  }

  const isBusy = isPending || isRedirecting;

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
              const active = selectedServiceId === s.id;
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setSelectedServiceId(s.id)}
                  disabled={isBusy}
                  className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                    active
                      ? "border-rose-600 bg-rose-50/60 ring-2 ring-rose-500/20 dark:border-rose-500 dark:bg-rose-950/30"
                      : "border-stone-200 hover:border-stone-300 dark:border-stone-800 dark:hover:border-stone-700 bg-white dark:bg-stone-900/60"
                  }`}
                >
                  <span className="font-medium text-sm text-stone-900 dark:text-stone-100">
                    {s.name}
                  </span>
                  {s.description && (
                    <span className="mt-0.5 text-xs text-stone-500 line-clamp-1 dark:text-stone-400">
                      {s.description}
                    </span>
                  )}
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      RM {s.price}
                    </span>
                    <span className="text-stone-400">{s.duration_minutes} min</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Time Slot Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold text-stone-900 dark:text-stone-100">
              2. Choose Available Date & Time
            </label>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {availableSlots.length} available
            </span>
          </div>

          {availableSlots.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 max-h-56 overflow-y-auto pr-1">
              {availableSlots.map((slot) => {
                const active = selectedSlotId === slot.id;
                const dateObj = new Date(slot.start_at);
                const dateFormatted = dateObj.toLocaleDateString("en-MY", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                const timeFormatted = dateObj.toLocaleTimeString("en-MY", {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <button
                    type="button"
                    key={slot.id}
                    onClick={() => {
                      setSelectedSlotId(slot.id);
                      if (isConflict) setIsConflict(false);
                      if (error) setError(null);
                    }}
                    disabled={isBusy}
                    className={`flex items-center justify-between p-3 rounded-xl border text-sm transition-all ${
                      active
                        ? "border-rose-600 bg-rose-600 text-white font-medium shadow-sm"
                        : "border-stone-200 bg-white text-stone-800 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-200"
                    }`}
                  >
                    <span>{dateFormatted}</span>
                    <span
                      className={
                        active
                          ? "text-rose-100"
                          : "text-stone-500 dark:text-stone-400 font-mono text-xs"
                      }
                    >
                      {timeFormatted}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-800">
              No open slots currently available. Please check back later or contact the artist.
            </div>
          )}
        </div>

        {/* Step 3: Optional Notes */}
        <div>
          <label className="block text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1.5">
            3. Special Requests / Event Details (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="E.g., Event venue in Bangsar, bridal look preference, early call time…"
            rows={2}
            disabled={isBusy}
            maxLength={500}
            className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-800 placeholder-stone-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:ring-rose-950"
          />
        </div>

        {/* Error / Conflict Alert */}
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
              {isConflict && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  Slots are secured on a first-come, first-served basis. Choose an alternative slot
                  above to proceed.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Pricing Summary */}
        {selectedService && (
          <div className="rounded-xl bg-stone-50 p-4 dark:bg-stone-800/40 border border-stone-100 dark:border-stone-800 text-sm space-y-2">
            <div className="flex justify-between text-stone-600 dark:text-stone-400">
              <span>Service Total</span>
              <span>RM {servicePrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-medium text-stone-900 dark:text-stone-100">
              <span>Deposit Payable Now ({defaultDepositPercent}%)</span>
              <span className="text-rose-600 dark:text-rose-400">
                RM {depositAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-stone-500 border-t border-stone-200 dark:border-stone-700/60 pt-2">
              <span>Balance due 3 days before event</span>
              <span>RM {balanceAmount.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Submit CTA */}
        <button
          type="submit"
          disabled={!selectedSlotId || !selectedServiceId || isBusy}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-600 py-3.5 px-4 font-semibold text-white shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isBusy ? (
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
              <span>{isRedirecting ? "Connecting to Billplz…" : "Reserving slot…"}</span>
            </>
          ) : (
            <span>Book Now & Pay RM {depositAmount.toFixed(2)} Deposit &rarr;</span>
          )}
        </button>
      </form>
    </div>
  );
}
