// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import { findExpiredQuotations, markQuotationExpired } from "./quotations";

function createBookingAndQuote(expiresInMs: number) {
  const userId = randomUUID();
  getDb()
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
  getDb()
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

  const quoteId = randomUUID();
  getDb()
    .prepare(
      "INSERT INTO quotations (id, booking_id, base_fee, extras, total, status, created_at, expires_at) VALUES (?, ?, ?, '[]', ?, 'pending', ?, ?)",
    )
    .run(
      quoteId,
      bookingId,
      100_000,
      100_000,
      new Date().toISOString(),
      new Date(Date.now() + expiresInMs).toISOString(),
    );
  return { bookingId, quoteId };
}

describe("quotation expiry sweep", () => {
  beforeEach(() => {
    getDb().prepare("DELETE FROM quotations").run();
    getDb().prepare("DELETE FROM bookings").run();
    getDb().prepare("DELETE FROM users").run();
  });

  it("finds only pending quotations past their expiry", async () => {
    createBookingAndQuote(-1000); // expired
    createBookingAndQuote(60_000); // still valid

    const expired = await findExpiredQuotations();
    expect(expired).toHaveLength(1);
  });

  it("marks a quotation expired only when pending", async () => {
    const { quoteId } = createBookingAndQuote(-1000);
    expect(await markQuotationExpired(quoteId)).toBe(true);
    // Second call: already expired → no change.
    expect(await markQuotationExpired(quoteId)).toBe(false);
  });

  it("does not pick up already-expired quotations", async () => {
    const { quoteId } = createBookingAndQuote(-1000);
    await markQuotationExpired(quoteId);
    expect(await findExpiredQuotations()).toHaveLength(0);
  });
});
