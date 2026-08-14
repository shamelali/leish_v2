"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ARTISTS, AREAS_BY_STATE, BRIDAL_EVENTS, NON_BRIDAL_EVENTS, MALAYSIA_STATES } from "@/lib/data";
import type { Artist, BridalEvent, NonBridalEvent } from "@/lib/types";
import { ArtistCard } from "@/components/ArtistCard";
import { Button } from "@/components/Button";
import { cn, pluralize } from "@/lib/utils";

type BridalFilter = "any" | BridalEvent;
type NonBridalFilter = "any" | NonBridalEvent;

const CATEGORY_TO_FILTER: Record<string, { bridal?: BridalFilter; nonBridal?: NonBridalFilter }> = {
  bridal: { bridal: "full-package" },
  engagement: { bridal: "engagement" },
  graduation: { nonBridal: "graduation" },
  corporate: { nonBridal: "corporate" },
};

function ArtistsBrowser() {
  const searchParams = useSearchParams();
  const category = searchParams.get("category") ?? "";
  const preset = CATEGORY_TO_FILTER[category];

  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [area, setArea] = useState("");
  const [date, setDate] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [bridal, setBridal] = useState<BridalFilter>(preset?.bridal ?? "any");
  const [nonBridal, setNonBridal] = useState<NonBridalFilter>(preset?.nonBridal ?? "any");

  const areas = state ? AREAS_BY_STATE[state as keyof typeof AREAS_BY_STATE] : [];

  const results = (() => {
    const q = query.trim().toLowerCase();

    return ARTISTS.filter((artist: Artist) => {
      if (q) {
        const haystack = `${artist.name} ${artist.tagline} ${artist.specialties.join(" ")} ${artist.area} ${artist.state}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (state && artist.state !== state) return false;
      if (area && artist.area !== area) return false;
      if (bridal !== "any" && !artist.bridal.includes(bridal)) return false;
      if (nonBridal !== "any" && !artist.nonBridal.includes(nonBridal)) return false;
      // Demo: date filtering is availability-based — "Today" only matches artists
      // available on any weekday, etc. Simplified for the showcase.
      if (date === "today") return artist.availability.some((a) => a.toLowerCase().startsWith("today"));
      if (date === "tomorrow") return artist.availability.some((a) => a.toLowerCase().startsWith("tomorrow"));
      if (date === "custom" && customDate) return true; // real backends would check slots here
      return true;
    });
  })();

  const hasActiveFilters = query || state || area || date !== "" || bridal !== "any" || nonBridal !== "any";

  function resetFilters() {
    setQuery("");
    setState("");
    setArea("");
    setDate("");
    setCustomDate("");
    setBridal("any");
    setNonBridal("any");
  }

  const selectCls =
    "h-11 rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium text-rose-600 dark:text-rose-500">Find your artist</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        Browse Makeup Artists
      </h1>
      <p className="mt-2 max-w-2xl text-stone-500 dark:text-stone-400">
        Find and book Malaysia&apos;s top makeup artists for any occasion.
      </p>

      {/* Filter bar */}
      <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-stone-800 dark:bg-stone-900">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artist, style, area…"
              className={cn(selectCls, "w-full pl-10")}
            />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-stone-500"
            >
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
            </svg>
          </div>

          <select value={state} onChange={(e) => { setState(e.target.value); setArea(""); }} className={selectCls}>
            <option value="">All States</option>
            {MALAYSIA_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select value={area} onChange={(e) => setArea(e.target.value)} disabled={!state} className={cn(selectCls, !state && "cursor-not-allowed bg-stone-100 text-stone-400 dark:bg-stone-800/60 dark:text-stone-500")}>
            <option value="">{state ? "All Areas" : "Select state first"}</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <div className="flex gap-3">
            <select value={date} onChange={(e) => { setDate(e.target.value); if (e.target.value !== "custom") setCustomDate(""); }} className={selectCls}>
              <option value="">Any Date</option>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="nextweek">Next Week</option>
              <option value="nextmonth">Next Month</option>
              <option value="custom">Choose Date…</option>
            </select>
            {date === "custom" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className={cn(selectCls, "w-40")}
              />
            )}
          </div>

          <Button onClick={() => { /* filter is applied live; keep for affordance */ }}>
            Filter
          </Button>
        </div>

        {/* Event type filters */}
        <div className="mt-4 grid gap-4 border-t border-stone-100 pt-4 md:grid-cols-2 dark:border-stone-800">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Event Type</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setBridal("any")} className={chipCls(bridal === "any")}>Bridal — Any</button>
              {BRIDAL_EVENTS.map((ev) => (
                <button key={ev.id} onClick={() => setBridal(ev.id)} className={chipCls(bridal === ev.id)}>
                  {ev.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Non-Bridal Event</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setNonBridal("any")} className={chipCls(nonBridal === "any")}>Non-Bridal — Any</button>
              {NON_BRIDAL_EVENTS.map((ev) => (
                <button key={ev.id} onClick={() => setNonBridal(ev.id)} className={chipCls(nonBridal === ev.id)}>
                  {ev.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Results header */}
      <div className="mt-8 flex items-center justify-between">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Showing <span className="font-semibold text-stone-900 dark:text-stone-100">{results.length}</span>{" "}
          {pluralize(results.length, "artist")}
        </p>
        {hasActiveFilters && (
          <button onClick={resetFilters} className="text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400">
            Clear all filters
          </button>
        )}
      </div>

      {results.length > 0 ? (
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-stone-300 bg-white p-16 text-center dark:border-stone-700 dark:bg-stone-900">
          <p className="text-lg font-semibold text-stone-900 dark:text-stone-100">No artists match your filters</p>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Try widening your search — new artists join Leish! every week.
          </p>
          <button onClick={resetFilters} className="mt-5 text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400">
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

function chipCls(active: boolean) {
  return cn(
    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
    active
      ? "border-rose-600 bg-rose-600 text-white"
      : "border-stone-300 bg-white text-stone-600 hover:border-rose-300 hover:text-rose-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-rose-700 dark:hover:text-rose-400",
  );
}

export default function ArtistsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-20 text-center text-stone-500">Loading artists…</div>}>
      <ArtistsBrowser />
    </Suspense>
  );
}
