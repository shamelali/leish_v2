"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Slot {
  id: string;
  start_at: string;
  end_at: string;
  is_booked: boolean;
}

interface Service {
  id: string;
  name: string;
  price: number;
}

/**
 * v1 note: location/map selection (Leaflet) caused an SSR crash because
 * `L.Icon.Default.mergeOptions` ran outside a browser context. v1 scope
 * deliberately drops the map — location is shown as plain text
 * (district/state) on the profile page. If a map comes back in v1.1,
 * gate it behind `typeof window !== "undefined"` / a `useEffect`, and
 * dynamic-import the component with `{ ssr: false }`.
 */
export default function BookingCalendar({
  providerId,
  slots,
  services,
}: {
  providerId: string;
  slots: Slot[];
  services: Service[];
}) {
  const router = useRouter();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableSlots = slots.filter((s) => !s.is_booked);

  async function handleBook() {
    if (!selectedSlot || !selectedService) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId,
        serviceId: selectedService,
        slotId: selectedSlot,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }

    // Kick off Billplz payment for the deposit.
    const payRes = await fetch("/api/payments/billplz/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: data.booking.id }),
    });
    const payData = await payRes.json();
    if (payData.url) {
      router.push(payData.url);
    }
  }

  return (
    <div className="rounded border p-4">
      <div className="mb-3">
        <label className="text-sm font-medium">Service</label>
        <select
          className="mt-1 block w-full rounded border p-2"
          value={selectedService ?? ""}
          onChange={(e) => setSelectedService(e.target.value)}
        >
          <option value="" disabled>
            Choose a service
          </option>
          {services.map((s) => (
            <option key={s.name} value={s.id}>
              {s.name} — RM {s.price}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label className="text-sm font-medium">Time slot</label>
        <select
          className="mt-1 block w-full rounded border p-2"
          value={selectedSlot ?? ""}
          onChange={(e) => setSelectedSlot(e.target.value)}
        >
          <option value="" disabled>
            Choose a time
          </option>
          {availableSlots.map((s) => (
            <option key={s.id} value={s.id}>
              {new Date(s.start_at).toLocaleString("en-MY")}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={handleBook}
        disabled={!selectedSlot || !selectedService || submitting}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-40"
      >
        {submitting ? "Booking…" : "Book & pay deposit"}
      </button>
    </div>
  );
}
