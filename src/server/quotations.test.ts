// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  createQuotation,
  getActiveQuotation,
  isQuotationExpired,
  quotationTotal,
} from "./quotations";

async function createTestBooking() {
  const userId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      userId,
      `${userId}@test.local`,
      "Test User",
      "customer",
      hashPassword("password123"),
      new Date().toISOString(),
    );

  const bookingId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)",
    )
    .run(
      bookingId,
      userId,
      "aisha-azman",
      "Aisha Azman",
      "Solemnization Makeup",
      580,
      "2026-09-01",
      "10:00 AM",
      new Date().toISOString(),
    );
  return bookingId;
}

describe("quotationTotal", () => {
  it("sums base + travel + early call + accommodation + extras", async () => {
    const total = quotationTotal({
      baseFee: 100_000,
      travelFee: 20_000,
      earlyCallFee: 10_000,
      accommodationFee: 30_000,
      extras: [
        { label: "Extra look", amount: 15_000 },
        { label: "Hair", amount: 5_000 },
      ],
    });
    expect(total).toBe(180_000);
  });

  it("defaults optional fees to zero", async () => {
    expect(quotationTotal({ baseFee: 50_000 })).toBe(50_000);
  });
});

describe("quotations (24h window)", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM quotations").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
  });

  it("creates a pending quotation with a 24h expiry", async () => {
    const bookingId = await createTestBooking();
    const quote = await createQuotation(bookingId, {
      baseFee: 100_000,
      travelFee: 20_000,
      extras: [{ label: "Hair", amount: 5_000 }],
      artistNote: "Look forward to it!",
    });

    expect(quote.status).toBe("pending");
    expect(quote.total).toBe(125_000);
    expect(quote.artist_note).toBe("Look forward to it!");
    const window = new Date(quote.expires_at).getTime() - new Date(quote.created_at).getTime();
    expect(window).toBe(24 * 60 * 60 * 1000);
  });

  it("supersedes a previous pending quotation", async () => {
    const bookingId = await createTestBooking();
    await createQuotation(bookingId, { baseFee: 100_000 });
    const second = await createQuotation(bookingId, { baseFee: 120_000 });

    const active = await getActiveQuotation(bookingId);
    expect(active?.id).toBe(second.id);
    expect(active?.status).toBe("pending");
  });

  it("marks an expired pending quotation when read", async () => {
    const bookingId = await createTestBooking();
    await createQuotation(bookingId, { baseFee: 100_000 });

    // Force the quotation to be expired.
    await getDb()
      .prepare("UPDATE quotations SET expires_at = ? WHERE booking_id = ?")
      .run(new Date(Date.now() - 1000).toISOString(), bookingId);

    const active = await getActiveQuotation(bookingId);
    expect(active?.status).toBe("expired");
    expect(isQuotationExpired(active!)).toBe(false); // already flipped
  });

  it("returns null when no quotation exists", async () => {
    const bookingId = await createTestBooking();
    expect(await getActiveQuotation(bookingId)).toBeNull();
  });
});
