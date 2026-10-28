import fs from "node:fs";
import path from "node:path";

/**
 * E2E catalog fixtures.
 *
 * The application has no demo seed: a fresh database is an empty catalog. The
 * Playwright webServer command therefore runs `seed-fixtures.ts` against a
 * throwaway SQLite file before `next start`, then the specs read the created
 * ids from the state file written here.
 *
 * This is test scaffolding, not application data — nothing in src/ references it.
 */

export interface ArtistFixture {
  id: string;
  name: string;
  tagline: string;
  state: string;
  area: string;
  priceFrom: number;
  rating: number;
  reviewCount: number;
  specialties: string[];
  services: { name: string; price: number; duration: string }[];
  bridal: string[];
  nonBridal: string[];
  availability: string[];
  reviews: { author: string; rating: number; date: string; event: string; text: string }[];
}

export interface StudioFixture {
  id: string;
  name: string;
  tagline: string;
  state: string;
  area: string;
  address: string;
  services: string[];
  priceFrom: number;
  hours: string;
  phone: string;
}

export const FIXTURE_ARTISTS: ArtistFixture[] = [
  {
    id: "e2e-artist-a",
    name: "E2E Artist A",
    tagline: "Fixture bridal artist",
    state: "Selangor",
    area: "Cyberjaya",
    priceFrom: 680,
    rating: 4.9,
    reviewCount: 1,
    specialties: ["Bridal", "Soft Glam"],
    services: [
      { name: "Reception Makeup", price: 680, duration: "3 hours" },
      { name: "Bridal Trial", price: 300, duration: "2 hours" },
    ],
    bridal: ["full-package", "engagement", "reception"],
    nonBridal: ["dinner", "graduation"],
    availability: ["Tomorrow 10:00", "Next week 14:00"],
    reviews: [
      {
        author: "E2E Reviewer",
        rating: 5,
        date: "May 2026",
        event: "Full Bridal Package",
        text: "E2E fixture review: made the whole morning feel calm and effortless.",
      },
    ],
  },
  {
    id: "e2e-artist-b",
    name: "E2E Artist B",
    tagline: "Fixture airbrush artist",
    state: "Johor",
    area: "Johor Bahru",
    priceFrom: 250,
    rating: 4.5,
    reviewCount: 0,
    specialties: ["Airbrush", "Bridal"],
    services: [{ name: "Reception Makeup", price: 250, duration: "2 hours" }],
    bridal: ["engagement", "reception"],
    nonBridal: ["dinner"],
    availability: ["Today 09:00"],
    reviews: [],
  },
];

export const FIXTURE_STUDIOS: StudioFixture[] = [
  {
    id: "e2e-studio",
    name: "E2E Studio",
    tagline: "Fixture studio",
    state: "Kuala Lumpur",
    area: "Bangsar",
    address: "1 Fixture Street",
    services: ["Bridal Trials", "Express Glam"],
    priceFrom: 300,
    hours: "10am-8pm",
    phone: "+60300000000",
  },
];

export interface CatalogFixtureState {
  artists: Record<string, { id: string; slug: string; name: string; services: string[] }>;
  studios: Record<string, { id: string; slug: string; name: string }>;
}

// Kept beside the throwaway database rather than in test-results/: Playwright
// wipes its output directory on every run.
export const FIXTURE_STATE_FILE = path.join("data", "e2e-catalog.json");

/** Read the ids created by `seed-fixtures.ts` (run by the webServer command). */
export function readFixtureState(): CatalogFixtureState {
  try {
    return JSON.parse(fs.readFileSync(FIXTURE_STATE_FILE, "utf8")) as CatalogFixtureState;
  } catch (err) {
    throw new Error(
      `E2E catalog fixtures missing at ${FIXTURE_STATE_FILE}. ` +
        `The webServer command must run e2e/support/seed-fixtures.ts before next start. ` +
        `(${err instanceof Error ? err.message : String(err)})`,
    );
  }
}
