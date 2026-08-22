// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import { clearSettingsCache } from "./settings";
import {
  createPayoutForBooking,
  listPayouts,
  updatePayoutStatus,
} from "./payouts";

async function createTestUser(role: "customer" | "artist" = "artist"): Promise<string> {
  const userId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(userId, `${userId}@test.local`, "Test User", role, hashPassword("pw"), new Date().toISOString());
  return userId;
}

async function createTestBooking(userId: string, date: string): Promise<string> {
  const bookingId = randomUUID();
  await getDb()
    .prepare(
      `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at)
       VALUES (?, ?, ?, 'Aisha Azman', 'Solemnization', 100000, ?, '10:00', 'confirmed', ?)`,
    )
    .run(bookingId, userId, "aisha-azman", date, new Date().toISOString());
  return bookingId;
}

describe("artist payouts", () => {
  let customerUserId: string;
  let artistUserId: string;

  beforeEach(async () => {
    clearSettingsCache();
    await getDb().prepare("DELETE FROM payouts").run();
    await getDb().prepare("DELETE FROM artist_profiles").run();
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM quotations").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
    customerUserId = await createTestUser("customer");
    artistUserId = await createTestUser("artist");
  });

  it("creates a payout: net = total − commission − deposit", async () => {
    const bkId = await createTestBooking(customerUserId, "2026-09-01");
    // Claim the profile so the payout is linked to the artist user.
    await getDb()
      .prepare("INSERT INTO artist_profiles (user_id, artist_id, claimed_at) VALUES (?, ?, ?)")
      .run(artistUserId, "aisha-azman", new Date().toISOString());

    const payout = await createPayoutForBooking(bkId, {
      artistId: "aisha-azman",
      eventDate: "2026-09-01",
      quoteTotalSen: 100_000,
    });

    expect(payout).not.toBeNull();
    expect(payout!.gross_sen).toBe(100_000);
    expect(payout!.commission_sen).toBe(10_000); // default 10%
    expect(payout!.net_sen).toBe(85_000); // 100000 − 10000 − 5000 deposit
    expect(payout!.status).toBe("pending");
    expect(payout!.artist_user_id).toBe(artistUserId);
    // Settleable 24h after the event date (local midnight parse).
    const expectedSettleable = new Date(
      new Date(`2026-09-01T00:00:00`).getTime() + 24 * 3_600_000,
    ).toISOString();
    expect(payout!.settleable_at).toBe(expectedSettleable);
  });

  it("is idempotent per booking", async () => {
    const bkId = await createTestBooking(customerUserId, "2026-09-01");
    const first = await createPayoutForBooking(bkId, {
      artistId: "aisha-azman",
      eventDate: null,
      quoteTotalSen: 50_000,
    });
    const second = await createPayoutForBooking(bkId, {
      artistId: "aisha-azman",
      eventDate: null,
      quoteTotalSen: 50_000,
    });
    expect(second!.id).toBe(first!.id);
  });

  it("waives commission for small quotes and handles unclaimed artists", async () => {
    const bkId = await createTestBooking(customerUserId, "2026-09-01");
    const payout = await createPayoutForBooking(bkId, {
      artistId: "unclaimed-artist",
      eventDate: null,
      quoteTotalSen: 9_000,
    });
    expect(payout!.commission_sen).toBe(0);
    expect(payout!.notes).toContain("waived");
    expect(payout!.net_sen).toBe(4_000); // 9000 − 0 commission − 5000 deposit
    expect(payout!.artist_user_id).toBeNull();
    expect(payout!.settleable_at).toBeNull();
  });

  it("lists payouts with booking join and status filter", async () => {
    const bkId = await createTestBooking(customerUserId, "2026-09-01");
    await createPayoutForBooking(bkId, {
      artistId: "aisha-azman",
      eventDate: "2026-09-01",
      quoteTotalSen: 100_000,
    });

    const all = await listPayouts();
    expect(all).toHaveLength(1);
    expect(all[0].artist_name).toBe("Aisha Azman");
    expect(all[0].service).toBe("Solemnization");
    expect(all[0].event_date).toBe("2026-09-01");

    const pending = await listPayouts("pending");
    expect(pending).toHaveLength(1);
    expect(await listPayouts("settled")).toHaveLength(0);
  });

  it("settles and fails payouts", async () => {
    const bkId = await createTestBooking(customerUserId, "2026-09-01");
    const payout = await createPayoutForBooking(bkId, {
      artistId: "aisha-azman",
      eventDate: null,
      quoteTotalSen: 100_000,
    });

    const settled = await updatePayoutStatus(payout!.id, "settled", "DuitNow ref 123");
    expect(settled!.status).toBe("settled");
    expect(settled!.settled_at).not.toBeNull();
    expect(settled!.notes).toBe("DuitNow ref 123");

    expect(await updatePayoutStatus("nope", "failed")).toBeNull();

    const failedList = await listPayouts("settled");
    expect(failedList).toHaveLength(1);
  });
});
