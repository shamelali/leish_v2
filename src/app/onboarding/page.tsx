"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AREAS_BY_STATE, MALAYSIA_STATES } from "@/lib/data";
import { Button } from "@/components/Button";
import { cn } from "@/lib/utils";

function OnboardingContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStudio = user?.role === "studio";
  const isArtist = user?.role === "artist";

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center text-stone-500 dark:text-stone-400">
        Loading…
      </div>
    );
  }

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
          <Button href="/register" variant="outline">
            Create a free account
          </Button>
        </div>
        <p className="mt-6 text-sm text-stone-400 dark:text-stone-500">
          <Link
            href="/artists"
            className="text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400"
          >
            Browse artists
          </Link>{" "}
          on the platform first, if you like.
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
          Application received!
        </h1>
        <p className="mt-3 text-stone-600 dark:text-stone-400">
          Thanks, {user.name}! Our team reviews every application — you&apos;ll hear from us within
          2 working days once your profile is live.
        </p>
        <p className="mt-4 text-sm text-stone-400 dark:text-stone-500">
          Your {isStudio ? "studio" : "artist"} profile is now live and claimed to your account.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button href="/dashboard" variant="outline">
            Go to Dashboard
          </Button>
          <Button href="/artists">Browse Artists</Button>
        </div>
      </div>
    );
  }

  if (user.role === "customer" || user.role === "admin") {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Onboarding is for artist and studio accounts. Your role is <strong>{user.role}</strong>.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button href="/dashboard" variant="outline">
            Go to Dashboard
          </Button>
          <Button href="/artists">Browse Artists</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {isNew && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-500/10 dark:text-emerald-400">
          Account created — now complete your {isStudio ? "studio" : "artist"} application to get discovered. ✨
        </div>
      )}
      <h1 className="font-display text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        {isStudio ? "Apply as a Studio" : "Apply as an Artist"}
      </h1>
      <p className="mt-2 text-stone-500 dark:text-stone-400">
        {isStudio
          ? "Tell clients about your studio, location, and services."
          : "Tell clients who you are, what you specialise in, and where you work."}
      </p>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </div>
      )}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!user) return;
          setSubmitting(true);
          setError(null);
          const form = e.currentTarget as HTMLFormElement;
          const fd = new FormData(form);
          const specialties = fd.getAll("specialties").map(String);
          const payload: Record<string, unknown> = {
            type: isStudio ? "studio" : "artist",
            name: String(fd.get("name") || user.name),
            phone: String(fd.get("phone") || ""),
            state: String(fd.get("state") || ""),
            area: String(fd.get("area") || ""),
            about: String(fd.get("about") || ""),
          };
          if (isArtist) {
            payload.specialties = specialties;
            payload.yearsExperience = Number(fd.get("yearsExperience") || 0);
            payload.portfolioUrl = String(fd.get("portfolioUrl") || "");
          } else {
            payload.address = String(fd.get("address") || "");
            payload.hours = String(fd.get("hours") || "");
            payload.description = String(fd.get("about") || "");
          }
          try {
            const res = await fetch("/api/onboarding", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to submit");
            setSubmitted(true);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setSubmitting(false);
          }
        }}
        className="mt-8 space-y-5 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="onb-name" className={labelCls}>
              Professional name
            </label>
            <input
              id="onb-name"
              name="name"
              autoComplete="name"
              required
              defaultValue={user.name}
              placeholder="e.g. Aisha Azman"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="onb-phone" className={labelCls}>
              Phone / WhatsApp
            </label>
            <input
              id="onb-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              placeholder="+60 1x-xxxxxxx"
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="onb-state" className={labelCls}>
              State
            </label>
            <select id="onb-state" name="state" required defaultValue="" className={inputCls}>
              <option value="" disabled>
                Select state…
              </option>
              {MALAYSIA_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="onb-area" className={labelCls}>
              Area / District
            </label>
            <select id="onb-area" name="area" required defaultValue="" className={inputCls}>
              <option value="" disabled>
                Select area…
              </option>
              {Object.values(AREAS_BY_STATE)
                .flat()
                .map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {isArtist && (
          <fieldset>
            <legend className={labelCls}>Specialties</legend>
            <div className="flex flex-wrap gap-2">
              {[
                "Bridal",
                "Soft Glam",
                "Airbrush",
                "HD Makeup",
                "Editorial",
                "Groom",
                "Natural",
                "Corporate",
                "Traditional",
              ].map((s, i) => (
                <label key={s} className="cursor-pointer">
                  <input
                    type="checkbox"
                    name="specialties"
                    value={s}
                    className="peer sr-only"
                    defaultChecked={i < 3}
                  />
                  <span
                    className={cn(
                      "inline-block rounded-full border px-3 py-1.5 text-sm transition-colors",
                      "border-stone-300 bg-white text-stone-600 peer-checked:border-rose-600 peer-checked:bg-rose-600 peer-checked:text-white dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
                    )}
                  >
                    {s}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {isArtist ? (
          <div>
            <label htmlFor="onb-years" className={labelCls}>
              Years of experience
            </label>
            <input
              id="onb-years"
              name="yearsExperience"
              type="number"
              min={0}
              max={60}
              required
              placeholder="e.g. 8"
              className={inputCls}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="onb-address" className={labelCls}>
              Studio address
            </label>
            <input
              id="onb-address"
              name="address"
              required
              placeholder="e.g. 12 Jalan Bangsar, KL"
              className={inputCls}
            />
          </div>
        )}

        {isArtist ? (
          <div>
            <label htmlFor="onb-portfolio" className={labelCls}>
              Portfolio link (Instagram or website)
            </label>
            <input
              id="onb-portfolio"
              name="portfolioUrl"
              type="url"
              inputMode="url"
              required
              placeholder="https://instagram.com/your.handle"
              className={inputCls}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="onb-hours" className={labelCls}>
              Opening hours
            </label>
            <input
              id="onb-hours"
              name="hours"
              placeholder="e.g. 10am–8pm daily"
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label htmlFor="onb-about" className={labelCls}>
            {isStudio ? "About your studio" : "About you"}
          </label>
          <textarea
            id="onb-about"
            name="about"
            rows={4}
            required
            placeholder={
              isStudio
                ? "Your studio vibe, team, signature services…"
                : "Your style, experience, favourite looks to create…"
            }
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40"
          />
        </div>

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Application"}
        </Button>
      </form>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-24 text-center text-stone-500">Loading…</div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
