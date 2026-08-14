"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getArtist } from "@/lib/data";
import { formatRM } from "@/lib/utils";
import { Button } from "@/components/Button";

function BookingForm() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  const artist = getArtist(params.id);
  const presetService = searchParams.get("service");

  const [service, setService] = useState(presetService ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const selectedService = useMemo(
    () => artist?.services.find((s) => s.name === service),
    [artist, service],
  );

  if (!artist) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-lg font-semibold text-stone-900 dark:text-stone-100">Artist not found</p>
        <Button href="/artists" variant="outline" className="mt-6">Browse artists</Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-8 w-8 text-emerald-600 dark:text-emerald-400">
            <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">Booking requested!</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-400">
          {artist.name} has been notified of your request for{" "}
          <span className="font-medium text-stone-900 dark:text-stone-100">{selectedService?.name ?? "a makeup session"}</span>
          {" "}on <span className="font-medium text-stone-900 dark:text-stone-100">{date || "your chosen date"}</span> at{" "}
          <span className="font-medium text-stone-900 dark:text-stone-100">{time || "your chosen time"}</span>. You&apos;ll
          receive an instant confirmation shortly.
        </p>
        <p className="mt-4 text-sm text-stone-400 dark:text-stone-500">Demo build — no real booking was placed.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Button href={`/artists/${artist.id}`} variant="outline">Back to profile</Button>
          <Button href="/artists">Browse more artists</Button>
        </div>
      </div>
    );
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";
  const labelCls = "mb-1.5 block text-sm font-medium text-stone-800 dark:text-stone-200";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <nav className="text-sm text-stone-500 dark:text-stone-400">
        <Link href="/artists" className="hover:text-rose-600 dark:hover:text-rose-400">Artists</Link>
        <span className="mx-2">/</span>
        <Link href={`/artists/${artist.id}`} className="hover:text-rose-600 dark:hover:text-rose-400">{artist.name}</Link>
        <span className="mx-2">/</span>
        <span className="text-stone-800 dark:text-stone-200">Request Booking</span>
      </nav>

      <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        Request Booking
      </h1>
      <p className="mt-2 text-stone-500 dark:text-stone-400">Tell {artist.name} what you need — confirm instantly.</p>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_280px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
          className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
        >
          <div>
            <label className={labelCls}>Service</label>
            <select value={service} onChange={(e) => setService(e.target.value)} required className={inputCls}>
              <option value="" disabled>Select a service…</option>
              {artist.services.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} — {formatRM(s.price)} ({s.duration})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Preferred time</label>
              <select value={time} onChange={(e) => setTime(e.target.value)} required className={inputCls}>
                <option value="" disabled>Select a time…</option>
                {["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Your name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Aina Rahman" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone / WhatsApp</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+60 1x-xxxxxxx" className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Venue address, inspirations, skin sensitivity…"
              className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40"
            />
          </div>

          <Button type="submit" className="w-full">Confirm Booking Request</Button>
          <p className="text-center text-xs text-stone-400 dark:text-stone-500">
            Demo only — nothing is charged or stored.
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
              <p className="text-xs text-stone-500 dark:text-stone-400">{artist.area}, {artist.state}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-stone-100 pt-4 text-sm dark:border-stone-800">
            <div className="flex justify-between">
              <span className="text-stone-500 dark:text-stone-400">Service</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">{selectedService?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500 dark:text-stone-400">Duration</span>
              <span className="font-medium text-stone-900 dark:text-stone-100">{selectedService?.duration ?? "—"}</span>
            </div>
            <div className="flex justify-between border-t border-stone-100 pt-2 dark:border-stone-800">
              <span className="text-stone-500 dark:text-stone-400">Estimated total</span>
              <span className="font-semibold text-stone-900 dark:text-stone-100">
                {selectedService ? formatRM(selectedService.price) : "—"}
              </span>
            </div>
          </div>
          <p className="mt-4 rounded-xl bg-stone-50 p-3 text-xs leading-5 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
            The artist will confirm your slot instantly. Free cancellation up to 48 hours before your appointment.
          </p>
        </aside>
      </div>
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg px-4 py-24 text-center text-stone-500">Loading…</div>}>
      <BookingForm />
    </Suspense>
  );
}
