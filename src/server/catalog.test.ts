// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  addEntityReview,
  findReviewableBooking,
  getArtistById,
  getArtistBySlug,
  getStudioById,
  listAllArtists,
  listAllStudios,
  listArtists,
  listEntityReviews,
  updateArtist,
} from "./catalog";
import { seedCatalog } from "./catalog-seed";

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
      "Aisha Azman",
      "Engagement Makeup",
      480,
      "2026-01-01",
      "10:00 AM",
      status,
      new Date().toISOString(),
    );
  return id;
}

describe("catalog repository", () => {
  beforeEach(async () => {
    // Fresh slate per test; ensureCatalogSeeded lazily re-seeds on read.
    const db = getDb();
    for (const table of ["reviews", "bookings", "users", "catalog_overrides"]) {
      await db.prepare(`DELETE FROM ${table}`).run();
    }
  });

  it("lazily seeds the full catalog on first read", async () => {
    const artists = await listAllArtists();
    expect(artists.length).toBeGreaterThanOrEqual(7);
    expect(artists.some((a) => a.id === "aisha-azman")).toBe(true);

    const studios = await listAllStudios();
    expect(studios.length).toBeGreaterThanOrEqual(4);
    expect(studios.some((s) => s.id === "glow-room-cyberjaya")).toBe(true);
  });

  it("seeding is idempotent", async () => {
    await seedCatalog();
    const before = (await listEntityReviews("artist", "aisha-azman")).length;
    await seedCatalog();
    await seedCatalog();
    const after = (await listEntityReviews("artist", "aisha-azman")).length;
    expect(after).toBe(before);

    const artists = await listAllArtists();
    expect(artists.filter((a) => a.id === "aisha-azman")).toHaveLength(1);
  });

  it("looks up artists by id and slug", async () => {
    const byId = await getArtistById("maya-tan");
    expect(byId?.name).toBe("Maya Tan");
    expect(byId?.services.length).toBeGreaterThan(0);

    const bySlug = await getArtistBySlug("maya-tan");
    expect(bySlug?.id).toBe("maya-tan");

    expect(await getArtistById("nope")).toBeNull();
    expect((await getStudioById("bangsar-beauty-bar"))?.name).toBe("Bangsar Beauty Bar");
  });

  it("filters artists by state, budget and query", async () => {
    const johor = await listArtists({ state: "Johor" });
    expect(johor.map((a) => a.id)).toContain("sofia-rahim");
    expect(johor.every((a) => a.state === "Johor")).toBe(true);

    const budget = await listArtists({ budget: 300 });
    expect(budget.every((a) => a.priceFrom <= 300)).toBe(true);

    const query = await listArtists({ query: "airbrush" });
    expect(query.map((a) => a.id)).toContain("sofia-rahim");

    const bridal = await listArtists({ bridal: "full-package" });
    expect(bridal.every((a) => a.bridal.includes("full-package"))).toBe(true);
  });

  it("updates whitelisted fields with JSON serialization", async () => {
    await listAllArtists();
    const updated = await updateArtist("nur-fatin", {
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
    const untouched = await updateArtist("nur-fatin", { rating: 1.0 } as never);
    expect(untouched).toBeNull();
  });

  it("folds legacy catalog_overrides into columns on re-seed", async () => {
    await listAllArtists();
    await getDb()
      .prepare(
        `INSERT INTO catalog_overrides (id, entity_type, entity_id, field, value, created_at, updated_at)
         VALUES (?, 'artist', 'hana-mustafa', 'tagline', '"Overridden tagline"', ?, ?)`,
      )
      .run(randomUUID(), new Date().toISOString(), new Date().toISOString());

    await seedCatalog();

    const artist = await getArtistById("hana-mustafa");
    expect(artist?.tagline).toBe("Overridden tagline");

    const remaining = (await getDb()
      .prepare("SELECT COUNT(*) AS c FROM catalog_overrides")
      .get()) as { c: number };
    expect(remaining.c).toBe(0);
  });
});

describe("catalog reviews", () => {
  beforeEach(async () => {
    const db = getDb();
    for (const table of ["reviews", "bookings", "users"]) {
      await db.prepare(`DELETE FROM ${table}`).run();
    }
    await listAllArtists();
  });

  it("blends a live review into the seeded aggregate", async () => {
    const before = await getArtistById("devi-ramasamy");
    expect(before).not.toBeNull();

    const review = await addEntityReview({
      entityType: "artist",
      entityId: "devi-ramasamy",
      authorName: "Test Client",
      rating: 1,
      event: "Reception",
      text: "Not what I expected at all.",
    });
    expect(review.rating).toBe(1);

    const after = await getArtistById("devi-ramasamy");
    expect(after?.reviewCount).toBe((before?.reviewCount ?? 0) + 1);
    // rating moved down toward 1 but stays above it given the seeded 4.8.
    expect(after!.rating).toBeLessThan(before!.rating);
    expect(after!.rating).toBeGreaterThan(1);
  });

  it("rejects a second review for the same booking", async () => {
    const userId = await createUser();
    const bookingId = await createBooking(userId, "aisha-azman", "completed");

    await addEntityReview({
      entityType: "artist",
      entityId: "aisha-azman",
      bookingId,
      authorName: "X",
      rating: 5,
      text: "Great",
    });
    await expect(
      addEntityReview({
        entityType: "artist",
        entityId: "aisha-azman",
        bookingId,
        authorName: "Y",
        rating: 4,
        text: "Also great",
      }),
    ).rejects.toThrow("ALREADY_REVIEWED");
  });

  it("gates reviewable bookings on completed + unreviewed", async () => {
    const userId = await createUser();

    // No booking at all.
    expect(await findReviewableBooking(userId, "artist", "aisha-azman")).toBeNull();

    // Requested booking doesn't qualify.
    await createBooking(userId, "aisha-azman", "requested");
    expect(await findReviewableBooking(userId, "artist", "aisha-azman")).toBeNull();

    // Completed booking qualifies.
    const completedId = await createBooking(userId, "aisha-azman", "completed");
    const found = await findReviewableBooking(userId, "artist", "aisha-azman");
    expect(found?.id).toBe(completedId);

    // …until reviewed.
    await addEntityReview({
      entityType: "artist",
      entityId: "aisha-azman",
      bookingId: completedId,
      userId,
      authorName: "Test User",
      rating: 5,
      text: "Wonderful experience overall.",
    });
    expect(await findReviewableBooking(userId, "artist", "aisha-azman")).toBeNull();
  });
});
