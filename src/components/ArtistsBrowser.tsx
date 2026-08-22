"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AREAS_BY_STATE, BRIDAL_EVENTS, NON_BRIDAL_EVENTS, MALAYSIA_STATES } from "@/lib/data";
import {
  DEFAULT_ARTIST_FILTERS,
  filterArtists,
  hasActiveArtistFilters,
  type ArtistFilters,
} from "@/lib/artists";
import type { Artist } from "@/lib/types";
import { ArtistCard } from "@/components/ArtistCard";
import { cn, pluralize } from "@/lib/utils";

const CATEGORY_TO_FILTER: Record<string, Partial<ArtistFilters>> = {
  bridal: { bridal: "full-package" },
  engagement: { bridal: "engagement" },
  graduation: { nonBridal: "graduation" },
  corporate: { nonBridal: "corporate" },
};

function ArtistsBrowser({ artists }: { artists: Artist[] }) {
  const searchParams = useSearchParams();
  const category = searchParams.get("category") ?? "";
  const preset = CATEGORY_TO_FILTER[category];

  const [filters, setFilters] = useState<ArtistFilters>({
    ...DEFAULT_ARTIST_FILTERS,
    ...preset,
  });

  const areas = filters.state ? AREAS_BY_STATE[filters.state as keyof typeof AREAS_BY_STATE] : [];

  const results = filterArtists(artists, filters);

  function set<K extends keyof ArtistFilters>(key: K, value: ArtistFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const active = hasActiveArtistFilters(filters);

  function resetFilters() {
    setFilters({ ...DEFAULT_ARTIST_FILTERS, budget: 0 });
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
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <label htmlFor="artist-search" className="sr-only">
              Search artists
            </label>
            <input
              id="artist-search"
              value={filters.query}
              onChange={(e) => set("query", e.target.value)}
              placeholder="Search artist, style, area…"
              className={cn(selectCls, "w-full pl-10")}
            />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-stone-500"
            >
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
            </svg>
          </div>

          <label className="sr-only" htmlFor="filter-state">
            State
          </label>
          <select
            id="filter-state"
            value={filters.state}
            onChange={(e) => {
              set("state", e.target.value);
              set("area", "");
            }}
            className={selectCls}
          >
            <option value="">All States</option>
            {MALAYSIA_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="filter-area">
            Area
          </label>
          <select
            id="filter-area"
            value={filters.area}
            onChange={(e) => set("area", e.target.value)}
            disabled={!filters.state}
            className={cn(
              selectCls,
              !filters.state &&
                "cursor-not-allowed bg-stone-100 text-stone-400 dark:bg-stone-800/60 dark:text-stone-500",
            )}
          >
            <option value="">{filters.state ? "All Areas" : "Select state first"}</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <div className="flex gap-3">
            <label className="sr-only" htmlFor="filter-date">
              Date
            </label>
            <select
              id="filter-date"
              value={filters.date}
              onChange={(e) => {
                const value = e.target.value as ArtistFilters["date"];
                set("date", value);
                if (value !== "custom") set("customDate", "");
              }}
              className={cn(selectCls, "w-full")}
            >
              <option value="">Any Date</option>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="nextweek">Next Week</option>
              <option value="nextmonth">Next Month</option>
              <option value="custom">Choose Date…</option>
            </select>
            {filters.date === "custom" && (
              <>
                <label className="sr-only" htmlFor="filter-custom-date">
                  Custom date
                </label>
                <input
                  id="filter-custom-date"
                  type="date"
                  value={filters.customDate}
                  onChange={(e) => set("customDate", e.target.value)}
                  className={cn(selectCls, "w-40")}
                />
              </>
            )}
          </div>
        </div>

        {/* Budget */}
        <div className="mt-4 border-t border-stone-100 pt-4 dark:border-stone-800">
          <label
            htmlFor="filter-budget"
            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400"
          >
            Max budget (RM)
          </label>
          <select
            id="filter-budget"
            value={filters.budget}
            onChange={(e) => set("budget", Number(e.target.value))}
            className={selectCls}
          >
            <option value={0}>Any budget</option>
            {[300, 400, 500, 600, 800, 1000].map((b) => (
              <option key={b} value={b}>
                Under RM {b}
              </option>
            ))}
          </select>
        </div>

        {/* Event type filters */}
        <div className="mt-4 grid gap-4 border-t border-stone-100 pt-4 md:grid-cols-2 dark:border-stone-800">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              Bridal event
            </legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={filters.bridal === "any"}
                onClick={() => set("bridal", "any")}
                className={chipCls(filters.bridal === "any")}
              >
                Any
              </button>
              {BRIDAL_EVENTS.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  aria-pressed={filters.bridal === ev.id}
                  onClick={() => set("bridal", ev.id)}
                  className={chipCls(filters.bridal === ev.id)}
                >
                  {ev.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
              Non-bridal event
            </legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={filters.nonBridal === "any"}
                onClick={() => set("nonBridal", "any")}
                className={chipCls(filters.nonBridal === "any")}
              >
                Any
              </button>
              {NON_BRIDAL_EVENTS.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  aria-pressed={filters.nonBridal === ev.id}
                  onClick={() => set("nonBridal", ev.id)}
                  className={chipCls(filters.nonBridal === ev.id)}
                >
                  {ev.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      {/* Results header */}
      <div className="mt-8 flex items-center justify-between">
        <p className="text-sm text-stone-600 dark:text-stone-400" aria-live="polite">
          Showing{" "}
          <span className="font-semibold text-stone-900 dark:text-stone-100">{results.length}</span>{" "}
          {pluralize(results.length, "artist")}
        </p>
        {active && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400"
          >
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
          <p className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            No artists match your filters
          </p>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Try widening your search — new artists join Leish! every week.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-5 text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400"
          >
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

export default function ArtistsBrowserWithSuspense({ artists }: { artists: Artist[] }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-20 text-center text-stone-500">
          Loading artists…
        </div>
      }
    >
      <ArtistsBrowser artists={artists} />
    </Suspense>
  );
}
