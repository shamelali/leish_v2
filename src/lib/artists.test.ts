import { describe, expect, it } from "vitest";
import { SEED_ARTISTS } from "./data";
import { DEFAULT_ARTIST_FILTERS, filterArtists, hasActiveArtistFilters } from "./artists";

describe("filterArtists", () => {
  it("returns all artists when no filters are set", () => {
    expect(filterArtists(SEED_ARTISTS, DEFAULT_ARTIST_FILTERS)).toHaveLength(SEED_ARTISTS.length);
  });

  it("filters by case-insensitive query across name, tagline, specialties and location", () => {
    const byName = filterArtists(SEED_ARTISTS, { ...DEFAULT_ARTIST_FILTERS, query: "AISHA" });
    expect(byName.map((a) => a.id)).toEqual(["aisha-azman"]);

    const byArea = filterArtists(SEED_ARTISTS, {
      ...DEFAULT_ARTIST_FILTERS,
      query: "pasir gudang",
    });
    expect(byArea.map((a) => a.id)).toEqual(["sofia-rahim"]);

    const bySpecialty = filterArtists(SEED_ARTISTS, {
      ...DEFAULT_ARTIST_FILTERS,
      query: "airbrush",
    });
    expect(bySpecialty.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by state", () => {
    const johor = filterArtists(SEED_ARTISTS, { ...DEFAULT_ARTIST_FILTERS, state: "Johor" });
    expect(johor.every((a) => a.state === "Johor")).toBe(true);
  });

  it("filters by area only when it matches", () => {
    const cyberjaya = filterArtists(SEED_ARTISTS, { ...DEFAULT_ARTIST_FILTERS, area: "Cyberjaya" });
    expect(cyberjaya.every((a) => a.area === "Cyberjaya")).toBe(true);
    expect(cyberjaya.map((a) => a.id)).toEqual(["aisha-azman", "hana-mustafa"]);
  });

  it("filters by bridal event type", () => {
    const fullPackage = filterArtists(SEED_ARTISTS, {
      ...DEFAULT_ARTIST_FILTERS,
      bridal: "full-package",
    });
    expect(fullPackage.every((a) => a.bridal.includes("full-package"))).toBe(true);
  });

  it("filters by non-bridal event type", () => {
    const corporate = filterArtists(SEED_ARTISTS, {
      ...DEFAULT_ARTIST_FILTERS,
      nonBridal: "corporate",
    });
    expect(corporate.every((a) => a.nonBridal.includes("corporate"))).toBe(true);
    expect(corporate.map((a) => a.id)).toContain("maya-tan");
  });

  it("filters by tomorrow availability", () => {
    const tomorrow = filterArtists(SEED_ARTISTS, { ...DEFAULT_ARTIST_FILTERS, date: "tomorrow" });
    expect(tomorrow.length).toBeGreaterThan(0);
    expect(
      tomorrow.every((a) => a.availability.some((s) => s.toLowerCase().startsWith("tomorrow"))),
    ).toBe(true);
  });

  it("returns an empty list when no artist matches", () => {
    const none = filterArtists(SEED_ARTISTS, { ...DEFAULT_ARTIST_FILTERS, state: "Sabah" });
    expect(none).toEqual([]);
  });

  it("filters by max budget", () => {
    const affordable = filterArtists(SEED_ARTISTS, { ...DEFAULT_ARTIST_FILTERS, budget: 400 });
    expect(affordable.every((a) => a.priceFrom <= 400)).toBe(true);
    expect(affordable.map((a) => a.id)).not.toContain("aisha-azman"); // RM 680
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
