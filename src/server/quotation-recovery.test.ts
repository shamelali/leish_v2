// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/server/db";
import { runQuotationRecoverySweep } from "./quotation-recovery";

// Mock email and logger so tests only exercise the sweep logic.
vi.mock("./booking-emails", () => ({
  sendQuotationRecoveryEmail: vi.fn().mockResolvedValue(undefined),
  notifyBookingStatusChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendQuotationRecoveryEmail, notifyBookingStatusChanged } from "./booking-emails";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

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
  date?: string;
  time?: string;
  recoverySentAt?: string | null;
}) {
  await getDb()
    .prepare(
      `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, quotation_recovery_sent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.id,
      params.userId,
      params.artistId,
      `Artist ${params.artistId}`,
      "Bridal Makeup",
      50000,
      params.date ?? daysAhead(14),
      params.time ?? "10:00",
      params.status,
      params.recoverySentAt ?? null,
      new Date().toISOString(),
    );
}

async function seedQuotation(params: {
  id: string;
  bookingId: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}) {
  await getDb()
    .prepare(
      `INSERT INTO quotations (id, booking_id, base_fee, total, status, created_at, expires_at)
       VALUES (?, ?, 50000, 50000, ?, ?, ?)`,
    )
    .run(params.id, params.bookingId, params.status, params.createdAt, params.expiresAt);
}

async function getBooking(id: string) {
  return (await getDb().prepare("SELECT * FROM bookings WHERE id = ?").get(id)) as {
    status: string;
    quotation_recovery_sent_at: string | null;
  };
}

describe("runQuotationRecoverySweep", () => {
  beforeEach(async () => {
    // Clean up all tables before each test
    await getDb().prepare("DELETE FROM quotations").run();
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

  it("sends a recovery email once the expiry grace window has passed", async () => {
    await seedBooking({
      id: "b-1",
      userId: "user-1",
      artistId: "artist-1",
      status: "accepted",
      time: "10:00",
    });
    await seedQuotation({
      id: "q-1",
      bookingId: "b-1",
      status: "expired",
      createdAt: hoursAgo(50),
      expiresAt: hoursAgo(26), // > 24h past expiry
    });

    const result = await runQuotationRecoverySweep();

    expect(result.recovered).toBe(1);
    expect(result.released).toBe(0);
    expect(sendQuotationRecoveryEmail).toHaveBeenCalledTimes(1);
    expect(sendQuotationRecoveryEmail).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "b-1", ownerUserId: "user-1" }),
    );

    const booking = await getBooking("b-1");
    expect(booking.quotation_recovery_sent_at).toBeTruthy();
    expect(booking.status).toBe("accepted"); // not released yet
  });

  it("skips bookings whose quotation expired within the grace window", async () => {
    await seedBooking({
      id: "b-1",
      userId: "user-1",
      artistId: "artist-1",
      status: "accepted",
      time: "10:00",
    });
    await seedQuotation({
      id: "q-1",
      bookingId: "b-1",
      status: "expired",
      createdAt: hoursAgo(4),
      expiresAt: hoursAgo(2), // < 24h past expiry
    });

    const result = await runQuotationRecoverySweep();

    expect(result.recovered).toBe(0);
    expect(sendQuotationRecoveryEmail).not.toHaveBeenCalled();
    const booking = await getBooking("b-1");
    expect(booking.quotation_recovery_sent_at).toBeNull();
  });

  it("skips bookings that still have a pending quotation", async () => {
    await seedBooking({
      id: "b-1",
      userId: "user-1",
      artistId: "artist-1",
      status: "accepted",
      time: "10:00",
    });
    // Older quotation expired, but a newer pending one exists — client is deciding.
    await seedQuotation({
      id: "q-1",
      bookingId: "b-1",
      status: "expired",
      createdAt: hoursAgo(72),
      expiresAt: hoursAgo(48),
    });
    await seedQuotation({
      id: "q-2",
      bookingId: "b-1",
      status: "pending",
      createdAt: hoursAgo(10),
      expiresAt: hoursAgo(-14), // in the future
    });

    const result = await runQuotationRecoverySweep();

    expect(result.recovered).toBe(0);
    expect(sendQuotationRecoveryEmail).not.toHaveBeenCalled();
  });

  it("is idempotent — skips bookings already stamped for recovery", async () => {
    await seedBooking({
      id: "b-1",
      userId: "user-1",
      artistId: "artist-1",
      status: "accepted",
      time: "10:00",
      recoverySentAt: hoursAgo(20), // already emailed
    });
    await seedQuotation({
      id: "q-1",
      bookingId: "b-1",
      status: "expired",
      createdAt: hoursAgo(70),
      expiresAt: hoursAgo(48), // < 7d, so no release either
    });

    const result = await runQuotationRecoverySweep();

    expect(result.recovered).toBe(0);
    expect(result.released).toBe(0);
    expect(sendQuotationRecoveryEmail).not.toHaveBeenCalled();
    expect(notifyBookingStatusChanged).not.toHaveBeenCalled();
    const booking = await getBooking("b-1");
    expect(booking.status).toBe("accepted");
  });

  it("releases the slot once the release grace window passes after recovery", async () => {
    await seedBooking({
      id: "b-1",
      userId: "user-1",
      artistId: "artist-1",
      status: "accepted",
      time: "10:00",
      recoverySentAt: hoursAgo(190), // recovery email already sent
    });
    await seedQuotation({
      id: "q-1",
      bookingId: "b-1",
      status: "expired",
      createdAt: hoursAgo(220),
      expiresAt: hoursAgo(200), // > 7 days past expiry
    });

    const result = await runQuotationRecoverySweep();

    expect(result.released).toBe(1);
    expect(result.notified).toBe(1);
    expect(notifyBookingStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "b-1", status: "cancelled" }),
    );
    const booking = await getBooking("b-1");
    expect(booking.status).toBe("cancelled");
  });

  it("never releases a booking that never received the recovery email", async () => {
    await seedBooking({
      id: "b-1",
      userId: "user-1",
      artistId: "artist-1",
      status: "accepted",
      time: "10:00",
    });
    await seedQuotation({
      id: "q-1",
      bookingId: "b-1",
      status: "expired",
      createdAt: hoursAgo(320),
      expiresAt: hoursAgo(300), // way past release window, but not stamped
    });

    const result = await runQuotationRecoverySweep();

    // Recovery email goes out instead; release happens on a later sweep.
    expect(result.recovered).toBe(1);
    expect(result.released).toBe(0);
    const booking = await getBooking("b-1");
    expect(booking.status).toBe("accepted");
  });

  it("ignores bookings without an expired latest quotation or non-accepted status", async () => {
    // Confirmed booking — paid and active, not abandoned.
    await seedBooking({
      id: "b-1",
      userId: "user-1",
      artistId: "artist-1",
      status: "confirmed",
      time: "10:00",
    });
    await seedQuotation({
      id: "q-1",
      bookingId: "b-1",
      status: "expired",
      createdAt: hoursAgo(72),
      expiresAt: hoursAgo(48),
    });

    // Accepted booking whose latest quotation was paid — not abandoned.
    await seedBooking({
      id: "b-2",
      userId: "user-2",
      artistId: "artist-2",
      status: "accepted",
      time: "11:00",
    });
    await seedQuotation({
      id: "q-2",
      bookingId: "b-2",
      status: "paid",
      createdAt: hoursAgo(72),
      expiresAt: hoursAgo(48),
    });

    const result = await runQuotationRecoverySweep();

    expect(result.recovered).toBe(0);
    expect(result.released).toBe(0);
    expect(sendQuotationRecoveryEmail).not.toHaveBeenCalled();
    const b1 = await getBooking("b-1");
    const b2 = await getBooking("b-2");
    expect(b1.status).toBe("confirmed");
    expect(b2.status).toBe("accepted");
  });
});
