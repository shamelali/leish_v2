import type { Artist, BridalEvent, NonBridalEvent } from "./types";
export { parseBudget, parseExperienceYears } from "./concierge/filters";

export type BridalFilter = "any" | BridalEvent;
export type NonBridalFilter = "any" | NonBridalEvent;

export type DateFilter = "" | "today" | "tomorrow" | "nextweek" | "nextmonth" | "custom";

export interface ArtistFilters {
  query: string;
  state: string;
  area: string;
  date: DateFilter;
  customDate: string;
  bridal: BridalFilter;
  nonBridal: NonBridalFilter;
  /** Max budget (MYR) — matches artists whose priceFrom is within budget. */
  budget: number;
}

export const DEFAULT_ARTIST_FILTERS: ArtistFilters = {
  query: "",
  state: "",
  area: "",
  date: "",
  customDate: "",
  bridal: "any",
  nonBridal: "any",
  budget: 0,
};

/**
 * Pure, deterministic artist filtering used by the /artists page.
 * Kept free of React/hooks so it can be unit-tested in isolation.
 *
 * Date filtering is availability-based ("today"/"tomorrow" match artists whose
 * availability slots mention that day) because slot availability lives outside
 * the catalog tables.
 */
export function filterArtists(artists: Artist[], filters: ArtistFilters): Artist[] {
  const query = filters.query.trim().toLowerCase();

  return artists.filter((artist) => {
    if (query) {
      const haystack =
        `${artist.name} ${artist.tagline} ${artist.specialties.join(" ")} ${artist.area} ${artist.state}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.state && artist.state !== filters.state) return false;
    if (filters.area && artist.area !== filters.area) return false;
    if (filters.bridal !== "any" && !artist.bridal.includes(filters.bridal)) return false;
    if (filters.nonBridal !== "any" && !artist.nonBridal.includes(filters.nonBridal)) return false;
    if (filters.budget > 0 && artist.priceFrom > filters.budget) return false;
    if (filters.date === "today") {
      return artist.availability.some((a) => a.toLowerCase().startsWith("today"));
    }
    if (filters.date === "tomorrow") {
      return artist.availability.some((a) => a.toLowerCase().startsWith("tomorrow"));
    }
    if (filters.date === "custom" && filters.customDate) return true;
    return true;
  });
}

export function hasActiveArtistFilters(filters: ArtistFilters): boolean {
  return Boolean(
    filters.query ||
    filters.state ||
    filters.area ||
    filters.date !== "" ||
    filters.bridal !== "any" ||
    filters.nonBridal !== "any" ||
    filters.budget > 0,
  );
}

/**
 * Homepage category tiles → the filter preset behind `/artists?category=<slug>`.
 * Shared so the tile counts always match what the listing shows.
 */
export const CATEGORY_TO_FILTER: Record<string, Partial<ArtistFilters>> = {
  bridal: { bridal: "full-package" },
  engagement: { bridal: "engagement" },
  graduation: { nonBridal: "graduation" },
  corporate: { nonBridal: "corporate" },
};

/**
 * Real per-category artist counts for the homepage tiles. There is no seeded
 * figure to fall back on: an empty catalog yields zeros.
 */
export function countArtistsByCategory(artists: Artist[]): Record<string, number> {
  return Object.fromEntries(
    Object.entries(CATEGORY_TO_FILTER).map(([slug, preset]) => [
      slug,
      filterArtists(artists, { ...DEFAULT_ARTIST_FILTERS, ...preset }).length,
    ]),
  );
}
