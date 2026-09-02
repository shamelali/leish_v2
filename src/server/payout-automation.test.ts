// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import { clearSettingsCache } from "./settings";
import { createPayoutForBooking } from "./payouts";
import { runPayoutAutomation } from "./payout-automation";

vi.mock("./booking-emails", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./booking-emails")>();
  return { ...actual, notifyPayoutSettled: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("./notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./notifications")>();
  return { ...actual, notifySlackPayoutSummary: vi.fn().mockResolvedValue(undefined) };
});

async function createTestUser(role: "customer" | "artist" = "artist"): Promise<string> {
  const userId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      userId,
      `${userId}@test.local`,
      "Test User",
      role,
      hashPassword("pw"),
      new Date().toISOString(),
    );
  return userId;
}

async function createTestBooking(userId: string, date: string): Promise<string> {
  const bookingId = randomUUID();
  await getDb()
    .prepare(
      `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at)
       VALUES (?, ?, ?, 'Aisha Azman', 'Solemnization', 100000, ?, '10:00', 'completed', ?)`,
    )
    .run(bookingId, userId, "aisha-azman", date, new Date().toISOString());
  return bookingId;
}

describe("payout automation", () => {
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

  it("auto-settles payouts past their settleable_at date", async () => {
    const bkId = await createTestBooking(customerUserId, "2026-08-01");
    await getDb()
      .prepare("INSERT INTO artist_profiles (user_id, artist_id, claimed_at) VALUES (?, ?, ?)")
      .run(artistUserId, "aisha-azman", new Date().toISOString());

    const payout = await createPayoutForBooking(bkId, {
      artistId: "aisha-azman",
      eventDate: "2026-08-01",
      quoteTotalSen: 100_000,
    });

    expect(payout).not.toBeNull();
    expect(payout!.status).toBe("pending");

    const result = await runPayoutAutomation();

    expect(result.settled).toBe(1);
    expect(result.failed).toBe(0);

    const updated = (await getDb()
      .prepare("SELECT * FROM payouts WHERE id = ?")
      .get(payout!.id)) as { status: string; settled_at: string | null } | undefined;
    expect(updated!.status).toBe("settled");
    expect(updated!.settled_at).not.toBeNull();
  });

  it("does not settle payouts before settleable_at date", async () => {
    const bkId = await createTestBooking(customerUserId, "2099-01-01");
    await getDb()
      .prepare("INSERT INTO artist_profiles (user_id, artist_id, claimed_at) VALUES (?, ?, ?)")
      .run(artistUserId, "aisha-azman", new Date().toISOString());

    const payout = await createPayoutForBooking(bkId, {
      artistId: "aisha-azman",
      eventDate: "2099-01-01",
      quoteTotalSen: 100_000,
    });

    expect(payout).not.toBeNull();
    expect(payout!.status).toBe("pending");

    const result = await runPayoutAutomation();

    expect(result.settled).toBe(0);
    expect(result.failed).toBe(0);

    const stillPending = (await getDb()
      .prepare("SELECT * FROM payouts WHERE id = ?")
      .get(payout!.id)) as { status: string } | undefined;
    expect(stillPending!.status).toBe("pending");
  });

  it("does not settle already-settled payouts", async () => {
    const bkId = await createTestBooking(customerUserId, "2026-08-01");
    await getDb()
      .prepare("INSERT INTO artist_profiles (user_id, artist_id, claimed_at) VALUES (?, ?, ?)")
      .run(artistUserId, "aisha-azman", new Date().toISOString());

    const payout = await createPayoutForBooking(bkId, {
      artistId: "aisha-azman",
      eventDate: "2026-08-01",
      quoteTotalSen: 100_000,
    });

    await getDb()
      .prepare("UPDATE payouts SET status = 'settled', settled_at = ? WHERE id = ?")
      .run(new Date().toISOString(), payout!.id);

    const result = await runPayoutAutomation();

    expect(result.settled).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("handles payouts with null settleable_at", async () => {
    const bkId = await createTestBooking(customerUserId, "2026-08-01");

    const payout = await createPayoutForBooking(bkId, {
      artistId: "aisha-azman",
      eventDate: null,
      quoteTotalSen: 100_000,
    });

    expect(payout).not.toBeNull();
    expect(payout!.settleable_at).toBeNull();

    const result = await runPayoutAutomation();

    expect(result.settled).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("counts remaining pending payouts correctly", async () => {
    const bkId1 = await createTestBooking(customerUserId, "2099-01-01");
    const bkId2 = await createTestBooking(customerUserId, "2099-01-02");

    await createPayoutForBooking(bkId1, {
      artistId: "aisha-azman",
      eventDate: "2099-01-01",
      quoteTotalSen: 100_000,
    });
    await createPayoutForBooking(bkId2, {
      artistId: "aisha-azman",
      eventDate: "2099-01-02",
      quoteTotalSen: 50_000,
    });

    const result = await runPayoutAutomation();

    expect(result.settled).toBe(0);
    expect(result.pendingRemaining).toBe(2);
  });
});
