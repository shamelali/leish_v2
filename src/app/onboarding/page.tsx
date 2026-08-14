"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AREAS_BY_STATE, MALAYSIA_STATES } from "@/lib/data";
import { Button } from "@/components/Button";
import { cn } from "@/lib/utils";

function OnboardingContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const [submitted, setSubmitted] = useState(false);

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <span className="text-5xl">🎨</span>
        <h1 className="mt-6 font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">
          Are you a Makeup Artist?
        </h1>
        <p className="mt-3 text-stone-600 dark:text-stone-400">
          Join Malaysia&apos;s beauty platform. Create your professional profile, showcase your
          portfolio, and start receiving booking requests from clients in your area.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button href="/login?redirect=%2Fonboarding">Sign in to apply</Button>
          <Button href="/register" variant="outline">Create a free account</Button>
        </div>
        <p className="mt-6 text-sm text-stone-400 dark:text-stone-500">
          <Link href="/artists" className="text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400">Browse artists</Link> on the
          platform first, if you like.
        </p>
      </div>
    );
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";
  const labelCls = "mb-1.5 block text-sm font-medium text-stone-800 dark:text-stone-200";

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-8 w-8 text-emerald-600 dark:text-emerald-400">
            <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="mt-6 font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">Application received!</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-400">
          Thanks, {user.name}! Our team reviews every application — you&apos;ll hear from us within 2
          working days once your profile is live.
        </p>
        <p className="mt-4 text-sm text-stone-400 dark:text-stone-500">Demo build — no application was actually submitted.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Button href="/dashboard" variant="outline">Go to Dashboard</Button>
          <Button href="/artists">Browse Artists</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {isNew && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-500/10 dark:text-emerald-400">
          Account created — now complete your artist application to get discovered. ✨
        </div>
      )}
      <h1 className="font-display text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        Apply as an Artist
      </h1>
      <p className="mt-2 text-stone-500 dark:text-stone-400">
        Tell clients who you are, what you specialise in, and where you work.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
        className="mt-8 space-y-5 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Professional name</label>
            <input required defaultValue={user.name} placeholder="e.g. Aisha Azman" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone / WhatsApp</label>
            <input required placeholder="+60 1x-xxxxxxx" className={inputCls} />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>State</label>
            <select required defaultValue="" className={inputCls}>
              <option value="" disabled>Select state…</option>
              {MALAYSIA_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Area / District</label>
            <select required defaultValue="" className={inputCls}>
              <option value="" disabled>Select area…</option>
              {Object.values(AREAS_BY_STATE).flat().map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Specialties</label>
          <div className="flex flex-wrap gap-2">
            {["Bridal", "Soft Glam", "Airbrush", "HD Makeup", "Editorial", "Groom", "Natural", "Corporate", "Traditional"].map((s, i) => (
              <label key={s} className="cursor-pointer">
                <input type="checkbox" className="peer sr-only" defaultChecked={i < 3} />
                <span className={cn(
                  "inline-block rounded-full border px-3 py-1.5 text-sm transition-colors",
                  "border-stone-300 bg-white text-stone-600 peer-checked:border-rose-600 peer-checked:bg-rose-600 peer-checked:text-white dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
                )}>
                  {s}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Years of experience</label>
          <input type="number" min={0} max={60} required placeholder="e.g. 8" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Portfolio link (Instagram or website)</label>
          <input required placeholder="https://instagram.com/your.handle" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>About you</label>
          <textarea
            rows={4}
            required
            placeholder="Your style, experience, favourite looks to create…"
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40"
          />
        </div>

        <Button type="submit" className="w-full">Submit Application</Button>
      </form>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg px-4 py-24 text-center text-stone-500">Loading…</div>}>
      <OnboardingContent />
    </Suspense>
  );
}
