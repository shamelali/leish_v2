// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  addEntityReview,
  createArtist,
  createStudio,
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
    expect(bySlug?.slug).toBe("maya-tan");

    expect(await getArtistById("nope")).toBeNull();
    expect((await getStudioById("bangsar-beauty-bar"))?.name).toBe("Bangsar Beauty Bar");
    expect((await getStudioBySlug("bangsar-beauty-bar"))?.id).toBe("bangsar-beauty-bar");
  });

  it("creates admin-onboarded artists with a UUID id and a separate slug", async () => {
    await listAllArtists();
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
    await listAllStudios();
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

  it("updates whitelisted artist fields with JSON serialization", async () => {
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

  it("updates whitelisted studio fields with JSON serialization", async () => {
    await listAllStudios();
    const updated = await updateStudio("bangsar-beauty-bar", {
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
    const untouched = await updateStudio("bangsar-beauty-bar", { rating: 1.0 } as never);
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

  it("listAllArtists supports pagination", async () => {
    await listAllArtists(); // ensure seeded
    const page1 = await listAllArtists({ limit: 3, offset: 0 });
    const page2 = await listAllArtists({ limit: 3, offset: 3 });
    expect(page1.length).toBeLessThanOrEqual(3);
    expect(page2.length).toBeLessThanOrEqual(3);
    // No overlap between pages
    const page1Ids = new Set(page1.map((a) => a.id));
    const page2Ids = new Set(page2.map((a) => a.id));
    expect(page1Ids.size).toBe(page1.length);
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
  });

  it("listAllStudios supports pagination", async () => {
    await listAllStudios(); // ensure seeded
    const page1 = await listAllStudios({ limit: 2, offset: 0 });
    const page2 = await listAllStudios({ limit: 2, offset: 2 });
    expect(page1.length).toBeLessThanOrEqual(2);
    expect(page2.length).toBeLessThanOrEqual(2);
    const page1Ids = new Set(page1.map((s) => s.id));
    const page2Ids = new Set(page2.map((s) => s.id));
    expect(page1Ids.size).toBe(page1.length);
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
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
  beforeEach(async () => {
    const db = getDb();
    for (const table of ["reviews", "bookings", "users"]) {
      await db.prepare(`DELETE FROM ${table}`).run();
    }
    await listAllArtists();
    // Clear seeded reviews so tests start with a clean slate
    await db.prepare("DELETE FROM reviews").run();
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

  it("findReviewableBooking returns null for studio type (out of scope)", async () => {
    const userId = await createUser();
    expect(await findReviewableBooking(userId, "studio", "bangsar-beauty-bar")).toBeNull();
  });

  it("lists entity reviews for artists", async () => {
    await listAllArtists();
    await addEntityReview({
      entityType: "artist",
      entityId: "aisha-azman",
      authorName: "Reviewer 1",
      rating: 5,
      text: "Excellent!",
    });
    // Small delay to ensure different timestamps
    await new Promise((r) => setTimeout(r, 10));
    await addEntityReview({
      entityType: "artist",
      entityId: "aisha-azman",
      authorName: "Reviewer 2",
      rating: 4,
      text: "Good",
    });

    const reviews = await listEntityReviews("artist", "aisha-azman");
    expect(reviews.length).toBe(2);
    expect(reviews[0].rating).toBe(4); // Reviewer 2 (newer) first
    expect(reviews[1].rating).toBe(5); // Reviewer 1 (older) second
    // Ordered by created_at DESC
    expect(reviews[0].author).toBe("Reviewer 2");
  });

  it("lists entity reviews for studios", async () => {
    await listAllStudios();
    await addEntityReview({
      entityType: "studio",
      entityId: "bangsar-beauty-bar",
      authorName: "Studio Reviewer",
      rating: 5,
      text: "Great studio!",
    });

    const reviews = await listEntityReviews("studio", "bangsar-beauty-bar");
    expect(reviews.length).toBe(1);
    expect(reviews[0].rating).toBe(5);
    expect(reviews[0].author).toBe("Studio Reviewer");
  });
});
