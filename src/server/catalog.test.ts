// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  addEntityReview,
  createArtist,
  createStudio,
  deleteArtist,
  deleteStudio,
  findReviewableBooking,
  getArtistById,
  getArtistBySlug,
  getStudioById,
  getStudioBySlug,
  listAllArtists,
  listAllStudios,
  listArtists,
  listEntityReviews,
  resolveArtist,
  resolveStudio,
  updateArtist,
  updateStudio,
} from "./catalog";
import {
  TEST_ARTIST_A,
  TEST_ARTIST_B,
  TEST_STUDIO_A,
  insertArtistFixture,
  insertCatalogFixtures,
  insertStudioFixture,
} from "@/test/catalog-fixtures";

async function createUser(role = "customer") {
  const id = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      `${id}@test.local`,
      "Test User",
      role,
      hashPassword("password123"),
      new Date().toISOString(),
    );
  return id;
}

async function createBooking(userId: string, artistId: string, status: string) {
  const id = randomUUID();
  await getDb()
    .prepare(
      `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      userId,
      artistId,
      "Fixture Artist A",
      "Engagement Makeup",
      480,
      "2026-01-01",
      "10:00 AM",
      status,
      new Date().toISOString(),
    );
  return id;
}

async function resetCatalog() {
  const db = getDb();
  for (const table of ["reviews", "bookings", "artist_profiles", "studio_profiles", "referrals"]) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
  await db.prepare("DELETE FROM artists").run();
  await db.prepare("DELETE FROM studios").run();
  await db.prepare("DELETE FROM users").run();
}

describe("catalog repository", () => {
  beforeEach(resetCatalog);

  it("returns an empty catalog when nothing has been onboarded", async () => {
    // No demo seed exists — a fresh database is an empty marketplace.
    expect(await listAllArtists()).toEqual([]);
    expect(await listAllStudios()).toEqual([]);
    expect(await getArtistById(TEST_ARTIST_A)).toBeNull();
  });

  it("looks up artists by id and slug", async () => {
    await insertCatalogFixtures();
    const byId = await getArtistById(TEST_ARTIST_A);
    expect(byId?.name).toBe("Fixture Artist A");
    expect(byId?.services.length).toBeGreaterThan(0);

    const bySlug = await getArtistBySlug(TEST_ARTIST_A);
    expect(bySlug?.id).toBe(TEST_ARTIST_A);
    expect(bySlug?.slug).toBe(TEST_ARTIST_A);

    expect(await getArtistById("nope")).toBeNull();
    expect((await getStudioById(TEST_STUDIO_A))?.name).toBe("Fixture Studio A");
    expect((await getStudioBySlug(TEST_STUDIO_A))?.id).toBe(TEST_STUDIO_A);
  });

  it("creates admin-onboarded artists with a UUID id and a separate slug", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createArtist({
      name: `Zara Onboarded ${suffix}`,
      state: "Selangor",
      area: "Cyberjaya",
      priceFrom: 400,
    });
    expect(created).not.toBeNull();
    expect(created!.slug).toBe(`zara-onboarded-${suffix}`);
    expect(created!.id).not.toBe(created!.slug);
    expect(created!.image).toBe("/images/hero.jpg");

    // Profile pages look up by slug; bookings still use the UUID id.
    expect((await getArtistBySlug(created!.slug!))?.id).toBe(created!.id);
    expect((await resolveArtist(created!.slug!))?.id).toBe(created!.id);
    expect((await resolveArtist(created!.id))?.slug).toBe(created!.slug);
  });

  it("creates admin-onboarded studios with a UUID id and a separate slug", async () => {
    const suffix = randomUUID().slice(0, 8);
    const created = await createStudio({
      name: `Glam Studio ${suffix}`,
      state: "Kuala Lumpur",
      area: "Bangsar",
      address: "123 Glam St",
      priceFrom: 500,
    });
    expect(created).not.toBeNull();
    expect(created!.slug).toBe(`glam-studio-${suffix}`);
    expect(created!.id).not.toBe(created!.slug);
    expect(created!.image).toBe("/images/hero.jpg");

    // Profile pages look up by slug
    expect((await getStudioBySlug(created!.slug!))?.id).toBe(created!.id);
    expect((await resolveStudio(created!.slug!))?.id).toBe(created!.id);
    expect((await resolveStudio(created!.id))?.slug).toBe(created!.slug);
  });

  it("createArtist persists yearsExperience and portfolio at insert time", async () => {
    const created = await createArtist({
      name: `Portfolio Artist ${randomUUID().slice(0, 8)}`,
      state: "Selangor",
      area: "Shah Alam",
      yearsExperience: 7,
      portfolio: ["https://instagram.com/portfolio.artist"],
    });
    expect(created!.yearsExperience).toBe(7);
    expect(created!.portfolio).toEqual(["https://instagram.com/portfolio.artist"]);

    // Defaults when omitted.
    const bare = await createArtist({ name: `Bare Artist ${randomUUID().slice(0, 8)}` });
    expect(bare!.yearsExperience).toBe(0);
    expect(bare!.portfolio).toEqual([]);
  });

  it("deleteArtist removes the row by id and by slug lookups", async () => {
    const created = await createArtist({ name: `Doomed Artist ${randomUUID().slice(0, 8)}` });
    expect(await deleteArtist(created!.id)).toBe(true);
    expect(await getArtistById(created!.id)).toBeNull();
    expect(await getArtistBySlug(created!.slug!)).toBeNull();
    // Second delete is a no-op.
    expect(await deleteArtist(created!.id)).toBe(false);
    expect(await deleteArtist("does-not-exist")).toBe(false);
  });

  it("deleteStudio removes the row by id and by slug lookups", async () => {
    const created = await createStudio({ name: `Doomed Studio ${randomUUID().slice(0, 8)}` });
    expect(await deleteStudio(created!.id)).toBe(true);
    expect(await getStudioById(created!.id)).toBeNull();
    expect(await getStudioBySlug(created!.slug!)).toBeNull();
    expect(await deleteStudio(created!.id)).toBe(false);
  });

  it("filters artists by state, budget, query and bridal tags", async () => {
    await insertCatalogFixtures();

    const johor = await listArtists({ state: "Johor" });
    expect(johor.map((a) => a.id)).toEqual([TEST_ARTIST_B]);
    expect(johor.every((a) => a.state === "Johor")).toBe(true);

    const budget = await listArtists({ budget: 300 });
    expect(budget.map((a) => a.id)).toEqual([TEST_ARTIST_B]);
    expect(budget.every((a) => a.priceFrom <= 300)).toBe(true);

    const query = await listArtists({ query: "airbrush" });
    expect(query.map((a) => a.id)).toEqual([TEST_ARTIST_B]);

    const bridal = await listArtists({ bridal: "full-package" });
    expect(bridal.map((a) => a.id)).toEqual([TEST_ARTIST_A]);
    expect(bridal.every((a) => a.bridal.includes("full-package"))).toBe(true);
  });

  it("updates whitelisted artist fields with JSON serialization", async () => {
    await insertArtistFixture();
    const updated = await updateArtist(TEST_ARTIST_A, {
      tagline: "New tagline",
      priceFrom: 400,
      verified: true,
      specialties: ["Natural", "Dewy Skin"],
    });
    expect(updated?.tagline).toBe("New tagline");
    expect(updated?.priceFrom).toBe(400);
    expect(updated?.verified).toBe(true);
    expect(updated?.specialties).toEqual(["Natural", "Dewy Skin"]);

    // Non-whitelisted fields are ignored entirely.
    const untouched = await updateArtist(TEST_ARTIST_A, { rating: 1.0 } as never);
    expect(untouched).toBeNull();
  });

  it("updates whitelisted studio fields with JSON serialization", async () => {
    await insertStudioFixture();
    const updated = await updateStudio(TEST_STUDIO_A, {
      tagline: "Updated tagline",
      priceFrom: 600,
      services: ["Makeup", "Hair"],
      hours: "10am-8pm",
      phone: "+60198765432",
    });
    expect(updated?.tagline).toBe("Updated tagline");
    expect(updated?.priceFrom).toBe(600);
    expect(updated?.services).toEqual(["Makeup", "Hair"]);
    expect(updated?.hours).toBe("10am-8pm");
    expect(updated?.phone).toBe("+60198765432");

    // Non-whitelisted fields are ignored entirely.
    const untouched = await updateStudio(TEST_STUDIO_A, { rating: 1.0 } as never);
    expect(untouched).toBeNull();
  });

  it("listAllArtists supports pagination", async () => {
    await insertCatalogFixtures();
    const page1 = await listAllArtists({ limit: 1, offset: 0 });
    const page2 = await listAllArtists({ limit: 1, offset: 1 });
    expect(page1).toHaveLength(1);
    expect(page2).toHaveLength(1);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it("listAllStudios supports pagination", async () => {
    await insertStudioFixture();
    await insertStudioFixture({
      id: "fixture-studio-b",
      name: "Fixture Studio B",
      state: "Penang",
      area: "George Town",
    });
    const page1 = await listAllStudios({ limit: 1, offset: 0 });
    const page2 = await listAllStudios({ limit: 1, offset: 1 });
    expect(page1).toHaveLength(1);
    expect(page2).toHaveLength(1);
    expect(page1[0].id).not.toBe(page2[0].id);
  });

  it("listAllArtists caps unpaginated results at 500", async () => {
    const all = await listAllArtists();
    expect(all.length).toBeLessThanOrEqual(500);
  });

  it("listAllStudios caps unpaginated results at 500", async () => {
    const all = await listAllStudios();
    expect(all.length).toBeLessThanOrEqual(500);
  });
});

describe("catalog reviews", () => {
  beforeEach(resetCatalog);

  it("blends a live review into the entity aggregate", async () => {
    await insertArtistFixture();
    const before = await getArtistById(TEST_ARTIST_A);
    expect(before).not.toBeNull();

    const review = await addEntityReview({
      entityType: "artist",
      entityId: TEST_ARTIST_A,
      authorName: "Test Client",
      rating: 1,
      event: "Reception",
      text: "Not what I expected at all.",
    });
    expect(review.rating).toBe(1);

    const after = await getArtistById(TEST_ARTIST_A);
    expect(after?.reviewCount).toBe((before?.reviewCount ?? 0) + 1);
    // rating moved down toward 1 but stays above it given the 4.9 fixture.
    expect(after!.rating).toBeLessThan(before!.rating);
    expect(after!.rating).toBeGreaterThan(1);
  });

  it("rejects a second review for the same booking", async () => {
    await insertArtistFixture();
    const userId = await createUser();
    const bookingId = await createBooking(userId, TEST_ARTIST_A, "completed");

    await addEntityReview({
      entityType: "artist",
      entityId: TEST_ARTIST_A,
      bookingId,
      authorName: "X",
      rating: 5,
      text: "Great",
    });
    await expect(
      addEntityReview({
        entityType: "artist",
        entityId: TEST_ARTIST_A,
        bookingId,
        authorName: "Y",
        rating: 4,
        text: "Also great",
      }),
    ).rejects.toThrow("ALREADY_REVIEWED");
  });

  it("gates reviewable bookings on completed + unreviewed", async () => {
    await insertArtistFixture();
    const userId = await createUser();

    // No booking at all.
    expect(await findReviewableBooking(userId, "artist", TEST_ARTIST_A)).toBeNull();

    // Requested booking doesn't qualify.
    await createBooking(userId, TEST_ARTIST_A, "requested");
    expect(await findReviewableBooking(userId, "artist", TEST_ARTIST_A)).toBeNull();

    // Completed booking qualifies.
    const completedId = await createBooking(userId, TEST_ARTIST_A, "completed");
    const found = await findReviewableBooking(userId, "artist", TEST_ARTIST_A);
    expect(found?.id).toBe(completedId);

    // …until reviewed.
    await addEntityReview({
      entityType: "artist",
      entityId: TEST_ARTIST_A,
      bookingId: completedId,
      userId,
      authorName: "Test User",
      rating: 5,
      text: "Wonderful experience overall.",
    });
    expect(await findReviewableBooking(userId, "artist", TEST_ARTIST_A)).toBeNull();
  });

  it("findReviewableBooking returns null for studio type (out of scope)", async () => {
    const userId = await createUser();
    expect(await findReviewableBooking(userId, "studio", TEST_STUDIO_A)).toBeNull();
  });

  it("lists entity reviews for artists", async () => {
    await insertArtistFixture();
    await addEntityReview({
      entityType: "artist",
      entityId: TEST_ARTIST_A,
      authorName: "Reviewer 1",
      rating: 5,
      text: "Excellent!",
    });
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));
    await addEntityReview({
      entityType: "artist",
      entityId: TEST_ARTIST_A,
      authorName: "Reviewer 2",
      rating: 4,
      text: "Good",
    });

    const reviews = await listEntityReviews("artist", TEST_ARTIST_A);
    expect(reviews.length).toBe(2);
    expect(reviews[0].rating).toBe(4); // Reviewer 2 (newer) first
    expect(reviews[1].rating).toBe(5); // Reviewer 1 (older) second
    // Ordered by created_at DESC
    expect(reviews[0].author).toBe("Reviewer 2");
  });

  it("lists entity reviews for studios", async () => {
    await insertStudioFixture();
    await addEntityReview({
      entityType: "studio",
      entityId: TEST_STUDIO_A,
      authorName: "Studio Reviewer",
      rating: 5,
      text: "Great studio!",
    });

    const reviews = await listEntityReviews("studio", TEST_STUDIO_A);
    expect(reviews.length).toBe(1);
    expect(reviews[0].rating).toBe(5);
    expect(reviews[0].author).toBe("Studio Reviewer");
  });
});
