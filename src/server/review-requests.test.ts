// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/server/db";
import { runReviewRequestSweep } from "./review-requests";

// Mock email and logger so tests only exercise the sweep logic.
vi.mock("./booking-emails", () => ({
  sendReviewRequestEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendReviewRequestEmail } from "./booking-emails";

async function seedUser(id: string, role = "customer") {
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, `${id}@test.local`, "Test User", role, "x:y", new Date().toISOString());
}

async function seedArtist(id: string) {
  await getDb()
    .prepare(
      `INSERT INTO artists (id, name, slug, bio, rating, review_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0.0, 0, ?, ?)`,
    )
    .run(
      id,
      `Artist ${id}`,
      id,
      "Test artist bio",
      new Date().toISOString(),
      new Date().toISOString(),
    );
}

async function seedBooking(params: {
  id: string;
  userId: string;
  artistId: string;
  status: string;
  date: string;
  time?: string;
  reviewRequestedAt?: string;
}) {
  await getDb()
    .prepare(
      `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, review_requested_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.id,
      params.userId,
      params.artistId,
      `Artist ${params.artistId}`,
      "Bridal Makeup",
      50000,
      params.date,
      params.time ?? "10:00",
      params.status,
      params.reviewRequestedAt ?? null,
      new Date().toISOString(),
    );
}

async function seedReview(bookingId: string, artistId: string) {
  await getDb()
    .prepare(
      `INSERT INTO reviews (id, entity_type, entity_id, booking_id, author_name, rating, text, created_at)
       VALUES (?, 'artist', ?, ?, ?, 5, 'Great!', ?)`,
    )
    .run(`rev-${bookingId}`, artistId, bookingId, "Test User", new Date().toISOString());
}

describe("runReviewRequestSweep", () => {
  beforeEach(async () => {
    // Clean up all tables before each test
    await getDb().prepare("DELETE FROM reviews").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM artists").run();
    await getDb().prepare("DELETE FROM users").run();

    await seedUser("user-1");
    await seedUser("user-2");
    await seedUser("user-3");
    await seedArtist("artist-1");
    await seedArtist("artist-2");

    vi.clearAllMocks();
  });

  it("sends review requests for completed bookings past the delay window", async () => {
    const pastDate = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    await seedBooking({
      id: "b-1",
      userId: "user-1",
      artistId: "artist-1",
      status: "completed",
      date: pastDate,
    });

    const now = new Date();
    const result = await runReviewRequestSweep(now);

    expect(result.requested).toBe(1);
    expect(result.errors).toBe(0);
    expect(sendReviewRequestEmail).toHaveBeenCalledTimes(1);
    expect(sendReviewRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: "b-1",
        ownerUserId: "user-1",
        artistName: "Artist artist-1",
      }),
    );

    const row = (await getDb()
      .prepare("SELECT review_requested_at FROM bookings WHERE id = ?")
      .get("b-1")) as { review_requested_at: string };
    expect(row.review_requested_at).toBeTruthy();
  });

  it("skips completed bookings within the delay window (less than 24h)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await seedBooking({
      id: "b-2",
      userId: "user-1",
      artistId: "artist-1",
      status: "completed",
      date: today,
    });

    const now = new Date();
    const result = await runReviewRequestSweep(now);

    expect(result.requested).toBe(0);
    expect(sendReviewRequestEmail).not.toHaveBeenCalled();
  });

  it("skips bookings that already have review_requested_at", async () => {
    const pastDate = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    await seedBooking({
      id: "b-3",
      userId: "user-1",
      artistId: "artist-1",
      status: "completed",
      date: pastDate,
      reviewRequestedAt: new Date().toISOString(),
    });

    const now = new Date();
    const result = await runReviewRequestSweep(now);

    expect(result.requested).toBe(0);
    expect(sendReviewRequestEmail).not.toHaveBeenCalled();
  });

  it("skips bookings that already have a review", async () => {
    const pastDate = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    await seedBooking({
      id: "b-4",
      userId: "user-1",
      artistId: "artist-1",
      status: "completed",
      date: pastDate,
    });
    await seedReview("b-4", "artist-1");

    const now = new Date();
    const result = await runReviewRequestSweep(now);

    expect(result.requested).toBe(0);
    expect(sendReviewRequestEmail).not.toHaveBeenCalled();
  });

  it("skips non-completed bookings", async () => {
    const pastDate = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    // Use different times to avoid unique constraint on (artist_id, date, time)
    await seedBooking({
      id: "b-5",
      userId: "user-1",
      artistId: "artist-1",
      status: "requested",
      date: pastDate,
      time: "09:00",
    });
    await seedBooking({
      id: "b-6",
      userId: "user-2",
      artistId: "artist-1",
      status: "accepted",
      date: pastDate,
      time: "10:00",
    });
    await seedBooking({
      id: "b-7",
      userId: "user-3",
      artistId: "artist-1",
      status: "confirmed",
      date: pastDate,
      time: "11:00",
    });
    await seedBooking({
      id: "b-8",
      userId: "user-1",
      artistId: "artist-1",
      status: "cancelled",
      date: pastDate,
      time: "12:00",
    });

    const now = new Date();
    const result = await runReviewRequestSweep(now);

    expect(result.requested).toBe(0);
    expect(sendReviewRequestEmail).not.toHaveBeenCalled();
  });

  it("handles multiple eligible bookings", async () => {
    const pastDate = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    await seedBooking({
      id: "b-9",
      userId: "user-1",
      artistId: "artist-1",
      status: "completed",
      date: pastDate,
    });
    await seedBooking({
      id: "b-10",
      userId: "user-2",
      artistId: "artist-2",
      status: "completed",
      date: pastDate,
    });

    const now = new Date();
    const result = await runReviewRequestSweep(now);

    expect(result.requested).toBe(2);
    expect(sendReviewRequestEmail).toHaveBeenCalledTimes(2);
  });

  it("counts errors when email send fails", async () => {
    const pastDate = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    await seedBooking({
      id: "b-11",
      userId: "user-1",
      artistId: "artist-1",
      status: "completed",
      date: pastDate,
    });

    vi.mocked(sendReviewRequestEmail).mockRejectedValueOnce(new Error("SMTP error"));

    const now = new Date();
    const result = await runReviewRequestSweep(now);

    expect(result.requested).toBe(0);
    expect(result.errors).toBe(1);

    const row = (await getDb()
      .prepare("SELECT review_requested_at FROM bookings WHERE id = ?")
      .get("b-11")) as { review_requested_at: string | null };
    expect(row.review_requested_at).toBeNull();
  });
});
