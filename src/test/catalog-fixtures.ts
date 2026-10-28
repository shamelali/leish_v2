import { getDb } from "@/server/db";

/**
 * Deterministic catalog rows for tests.
 *
 * The application ships with NO demo catalog: production starts empty and
 * artists arrive via onboarding/admin. Tests that exercise catalog reads still
 * need rows, so they insert them here instead of relying on a seed step.
 *
 * Everything is idempotent (`ON CONFLICT DO NOTHING`), so a `beforeEach` can
 * call these helpers without worrying about prior state.
 */

export const TEST_ARTIST_A = "fixture-artist-a";
export const TEST_ARTIST_B = "fixture-artist-b";
export const TEST_STUDIO_A = "fixture-studio-a";

const NOW = "2026-01-01T00:00:00.000Z";

interface ArtistFixture {
  id?: string;
  slug?: string;
  name?: string;
  state?: string;
  area?: string;
  priceFrom?: number;
  rating?: number;
  reviewCount?: number;
  specialties?: string[];
  bridal?: string[];
  nonBridal?: string[];
  availability?: string[];
  tagline?: string;
}

export async function insertArtistFixture(fixture: ArtistFixture = {}): Promise<string> {
  const id = fixture.id ?? TEST_ARTIST_A;
  await getDb()
    .prepare(
      `INSERT INTO artists (id, slug, name, tagline, bio, image, rating, review_count,
                            state, area, price_from, verified, years_experience,
                            specialties, services, bridal, non_bridal, availability,
                            portfolio, referral_code, referred_by, referral_earnings,
                            created_at, updated_at)
       VALUES (?, ?, ?, ?, '', '/images/hero.jpg', ?, ?, ?, ?, ?, 1, 5, ?, ?, ?, ?, ?, '[]', '', NULL, 0, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(
      id,
      fixture.slug ?? id,
      fixture.name ?? "Fixture Artist A",
      fixture.tagline ?? "Fixture tagline",
      fixture.rating ?? 4.8,
      fixture.reviewCount ?? 20,
      fixture.state ?? "Selangor",
      fixture.area ?? "Cyberjaya",
      fixture.priceFrom ?? 480,
      JSON.stringify(fixture.specialties ?? ["Bridal", "Soft Glam", "Airbrush"]),
      JSON.stringify([{ name: "Reception Makeup", price: 480, duration: "3 hours" }]),
      JSON.stringify(fixture.bridal ?? ["full-package", "engagement", "reception"]),
      JSON.stringify(fixture.nonBridal ?? ["dinner", "graduation"]),
      JSON.stringify(fixture.availability ?? ["Tomorrow 10:00", "Next week 14:00"]),
      NOW,
      NOW,
    );
  return id;
}

interface StudioFixture {
  id?: string;
  slug?: string;
  name?: string;
  state?: string;
  area?: string;
  priceFrom?: number;
}

export async function insertStudioFixture(fixture: StudioFixture = {}): Promise<string> {
  const id = fixture.id ?? TEST_STUDIO_A;
  await getDb()
    .prepare(
      `INSERT INTO studios (id, slug, name, tagline, description, image, rating, review_count,
                            state, area, address, services, price_from, hours, phone,
                            referral_code, referred_by, referral_earnings, created_at, updated_at)
       VALUES (?, ?, ?, 'Fixture tagline', '', '/images/hero.jpg', 4.7, 12, ?, ?, '1 Fixture St',
               '["Bridal Trials","Express Glam"]', ?, '10am-8pm', '+60300000000', '', NULL, 0, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(
      id,
      fixture.slug ?? id,
      fixture.name ?? "Fixture Studio A",
      fixture.state ?? "Kuala Lumpur",
      fixture.area ?? "Bangsar",
      fixture.priceFrom ?? 300,
      NOW,
      NOW,
    );
  return id;
}

/** Insert the standard pair of artist fixtures + one studio fixture. */
export async function insertCatalogFixtures(): Promise<void> {
  await insertArtistFixture({
    id: TEST_ARTIST_A,
    name: "Fixture Artist A",
    state: "Selangor",
    area: "Cyberjaya",
    priceFrom: 680,
    rating: 4.9,
    reviewCount: 182,
    specialties: ["Bridal", "Soft Glam"],
  });
  await insertArtistFixture({
    id: TEST_ARTIST_B,
    name: "Fixture Artist B",
    state: "Johor",
    area: "Johor Bahru",
    priceFrom: 250,
    rating: 4.5,
    reviewCount: 40,
    specialties: ["Bridal", "Airbrush"],
    bridal: ["engagement", "reception"],
    nonBridal: ["dinner"],
    availability: ["Today 09:00"],
  });
  await insertStudioFixture();
}
