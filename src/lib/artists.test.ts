import { describe, expect, it } from "vitest";
import {
  CATEGORY_TO_FILTER,
  countArtistsByCategory,
  DEFAULT_ARTIST_FILTERS,
  filterArtists,
  hasActiveArtistFilters,
} from "./artists";
import { CATEGORIES } from "./data";
import type { Artist } from "./types";

/**
 * Local fixtures: the catalog has no demo seed, so the pure filter helper is
 * exercised against literal artists defined here.
 */
function makeArtist(overrides: Partial<Artist> & Pick<Artist, "id" | "name">): Artist {
  return {
    slug: overrides.id,
    tagline: "Fixture tagline",
    bio: "",
    image: "/images/hero.jpg",
    rating: 4.8,
    reviewCount: 10,
    state: "Selangor",
    area: "Cyberjaya",
    priceFrom: 480,
    specialties: ["Bridal", "Soft Glam"],
    services: [],
    bridal: ["reception"],
    nonBridal: ["dinner"],
    availability: ["Tomorrow 10:00"],
    portfolio: [],
    verified: true,
    yearsExperience: 5,
    reviews: [],
    ...overrides,
  };
}

const ARTISTS: Artist[] = [
  makeArtist({
    id: "aina-zulkifli",
    name: "Aina Zulkifli",
    area: "Cyberjaya",
    priceFrom: 680,
    specialties: ["Bridal", "Soft Glam"],
    bridal: ["full-package", "reception"],
  }),
  makeArtist({
    id: "sofia-rahim",
    name: "Sofia Rahim",
    state: "Johor",
    area: "Pasir Gudang",
    priceFrom: 250,
    specialties: ["Airbrush"],
    bridal: ["engagement"],
    nonBridal: ["corporate"],
    availability: ["Today 09:00"],
  }),
  makeArtist({
    id: "maya-tan",
    name: "Maya Tan",
    area: "Cyberjaya",
    priceFrom: 400,
    specialties: ["Airbrush", "Editorial"],
    nonBridal: ["corporate", "graduation"],
    availability: ["Next week 14:00"],
  }),
];

describe("filterArtists", () => {
  it("returns all artists when no filters are set", () => {
    expect(filterArtists(ARTISTS, DEFAULT_ARTIST_FILTERS)).toHaveLength(ARTISTS.length);
  });

  it("filters by case-insensitive query across name, tagline, specialties and location", () => {
    const byName = filterArtists(ARTISTS, { ...DEFAULT_ARTIST_FILTERS, query: "AINA" });
    expect(byName.map((a) => a.id)).toEqual(["aina-zulkifli"]);

    const byArea = filterArtists(ARTISTS, {
      ...DEFAULT_ARTIST_FILTERS,
      query: "pasir gudang",
    });
    expect(byArea.map((a) => a.id)).toEqual(["sofia-rahim"]);

    const bySpecialty = filterArtists(ARTISTS, {
      ...DEFAULT_ARTIST_FILTERS,
      query: "airbrush",
    });
    expect(bySpecialty.map((a) => a.id)).toEqual(["sofia-rahim", "maya-tan"]);
  });

  it("filters by state", () => {
    const johor = filterArtists(ARTISTS, { ...DEFAULT_ARTIST_FILTERS, state: "Johor" });
    expect(johor.map((a) => a.id)).toEqual(["sofia-rahim"]);
  });

  it("filters by area only when it matches", () => {
    const cyberjaya = filterArtists(ARTISTS, { ...DEFAULT_ARTIST_FILTERS, area: "Cyberjaya" });
    expect(cyberjaya.every((a) => a.area === "Cyberjaya")).toBe(true);
    expect(cyberjaya.map((a) => a.id)).toEqual(["aina-zulkifli", "maya-tan"]);
  });

  it("filters by bridal event type", () => {
    const fullPackage = filterArtists(ARTISTS, {
      ...DEFAULT_ARTIST_FILTERS,
      bridal: "full-package",
    });
    expect(fullPackage.map((a) => a.id)).toEqual(["aina-zulkifli"]);
  });

  it("filters by non-bridal event type", () => {
    const corporate = filterArtists(ARTISTS, {
      ...DEFAULT_ARTIST_FILTERS,
      nonBridal: "corporate",
    });
    expect(corporate.every((a) => a.nonBridal.includes("corporate"))).toBe(true);
    expect(corporate.map((a) => a.id)).toContain("maya-tan");
  });

  it("filters by tomorrow availability", () => {
    const tomorrow = filterArtists(ARTISTS, { ...DEFAULT_ARTIST_FILTERS, date: "tomorrow" });
    expect(tomorrow.map((a) => a.id)).toEqual(["aina-zulkifli"]);
  });

  it("returns an empty list when no artist matches", () => {
    const none = filterArtists(ARTISTS, { ...DEFAULT_ARTIST_FILTERS, state: "Sabah" });
    expect(none).toEqual([]);
  });

  it("filters by max budget", () => {
    const affordable = filterArtists(ARTISTS, { ...DEFAULT_ARTIST_FILTERS, budget: 400 });
    expect(affordable.every((a) => a.priceFrom <= 400)).toBe(true);
    expect(affordable.map((a) => a.id)).not.toContain("aina-zulkifli"); // RM 680
  });
});

describe("hasActiveArtistFilters", () => {
  it("is false with no filters", () => {
    expect(hasActiveArtistFilters(DEFAULT_ARTIST_FILTERS)).toBe(false);
  });

  it("is true when any dimension is set", () => {
    expect(hasActiveArtistFilters({ ...DEFAULT_ARTIST_FILTERS, query: "x" })).toBe(true);
    expect(hasActiveArtistFilters({ ...DEFAULT_ARTIST_FILTERS, state: "Johor" })).toBe(true);
    expect(hasActiveArtistFilters({ ...DEFAULT_ARTIST_FILTERS, bridal: "reception" })).toBe(true);
  });
});

describe("countArtistsByCategory", () => {
  it("derives homepage tile counts from the artists it is given", () => {
    const counts = countArtistsByCategory(ARTISTS);
    expect(counts.bridal).toBe(1); // aina — full-package
    expect(counts.engagement).toBe(1); // sofia — engagement
    expect(counts.graduation).toBe(1); // maya — graduation
    expect(counts.corporate).toBe(2); // sofia + maya
  });

  it("returns zeros for an empty catalog (no seeded fallback)", () => {
    expect(countArtistsByCategory([])).toEqual({
      bridal: 0,
      engagement: 0,
      graduation: 0,
      corporate: 0,
    });
  });

  it("covers every homepage category slug", () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_TO_FILTER[category.slug]).toBeDefined();
    }
  });
});
