// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  BOOKING_FEE_SEN,
  activePaymentProvider,
  createBookingFeePayment,
  getBookingIdForBill,
  getPaymentForBooking,
  markBillPaid,
  refundBalance,
  verifyBillplzSignature,
} from "./payments";

async function createTestUserAndBooking() {
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

describe("booking fee payments (dev provider)", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
  });

  it("charges the flat RM 200 booking fee", async () => {
    const bookingId = await createTestUserAndBooking();
    const payment = await createBookingFeePayment(bookingId);

    expect(payment.amount).toBe(BOOKING_FEE_SEN); // 20,000 sen = RM 200
    expect(payment.currency).toBe("MYR");
    expect(payment.provider).toBe("dev");
    expect(payment.status).toBe("required");
    expect(payment.provider_ref).toMatch(/^dev_/);
  });

  it("links the booking id back from the bill reference", async () => {
    const bookingId = await createTestUserAndBooking();
    const payment = await createBookingFeePayment(bookingId);
    expect(await getBookingIdForBill(payment.provider_ref!)).toBe(bookingId);
  });

  it("is retrievable by booking id", async () => {
    const bookingId = await createTestUserAndBooking();
    await createBookingFeePayment(bookingId);
    const found = await getPaymentForBooking(bookingId);
    expect(found?.booking_id).toBe(bookingId);
    expect(found?.amount).toBe(BOOKING_FEE_SEN);
  });

  it("returns null when no payment exists", async () => {
    expect(await getPaymentForBooking("nope")).toBeNull();
    expect(await getBookingIdForBill("nope")).toBeNull();
  });
});

describe("billplz webhook signature verification", () => {
  const apiKey = "test-billplz-api-key";

  it("accepts a valid signature", async () => {
    const rawBody = JSON.stringify({ id: "bill_123", paid: true });
    const signature = createHmac("sha256", apiKey).update(rawBody).digest("hex");
    expect(verifyBillplzSignature(rawBody, signature, apiKey)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const rawBody = JSON.stringify({ id: "bill_123", paid: true });
    const signature = createHmac("sha256", apiKey).update(rawBody).digest("hex");
    const tampered = JSON.stringify({ id: "bill_999", paid: true });
    expect(verifyBillplzSignature(tampered, signature, apiKey)).toBe(false);
  });

  it("rejects a wrong key", async () => {
    const rawBody = JSON.stringify({ id: "bill_123", paid: true });
    const signature = createHmac("sha256", "other-key").update(rawBody).digest("hex");
    expect(verifyBillplzSignature(rawBody, signature, "a-different-key")).toBe(false);
  });

  it("rejects a missing signature or key", async () => {
    const rawBody = "{}";
    expect(verifyBillplzSignature(rawBody, null, apiKey)).toBe(false);
    expect(verifyBillplzSignature(rawBody, "abc", "")).toBe(false);
  });
});

describe("activePaymentProvider", () => {
  it("returns dev when BILLPLZ env vars are not set", () => {
    const origKey = process.env.BILLPLZ_API_KEY;
    const origCollection = process.env.BILLPLZ_COLLECTION_ID;
    delete process.env.BILLPLZ_API_KEY;
    delete process.env.BILLPLZ_COLLECTION_ID;
    try {
      expect(activePaymentProvider()).toBe("dev");
    } finally {
      if (origKey !== undefined) process.env.BILLPLZ_API_KEY = origKey;
      if (origCollection !== undefined) process.env.BILLPLZ_COLLECTION_ID = origCollection;
    }
  });

  it("returns billplz when both env vars are set", () => {
    const origKey = process.env.BILLPLZ_API_KEY;
    const origCollection = process.env.BILLPLZ_COLLECTION_ID;
    process.env.BILLPLZ_API_KEY = "test-key";
    process.env.BILLPLZ_COLLECTION_ID = "test-collection";
    try {
      expect(activePaymentProvider()).toBe("billplz");
    } finally {
      if (origKey !== undefined) process.env.BILLPLZ_API_KEY = origKey;
      else delete process.env.BILLPLZ_API_KEY;
      if (origCollection !== undefined) process.env.BILLPLZ_COLLECTION_ID = origCollection;
      else delete process.env.BILLPLZ_COLLECTION_ID;
    }
  });
});

describe("markBillPaid", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
  });

  it("marks a payment as paid and returns true", async () => {
    const bookingId = await createTestUserAndBooking();
    const payment = await createBookingFeePayment(bookingId);
    const changed = await markBillPaid(payment.provider_ref!);
    expect(changed).toBe(true);
    const updated = await getPaymentForBooking(bookingId);
    expect(updated?.status).toBe("paid");
  });

  it("returns false for an unknown bill id", async () => {
    expect(await markBillPaid("nonexistent")).toBe(false);
  });
});

describe("refundBalance (dev provider)", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
  });

  it("refunds the balance for a paid booking", async () => {
    const bookingId = await createTestUserAndBooking();
    const payment = await createBookingFeePayment(bookingId);
    await markBillPaid(payment.provider_ref!);
    const refunded = await refundBalance(bookingId, 30_000);
    expect(refunded?.status).toBe("refunded");
  });

  it("returns null when no payment exists", async () => {
    const result = await refundBalance("nonexistent", 30_000);
    expect(result).toBeNull();
  });

  it("returns payment without refunding when amount is zero or negative", async () => {
    const bookingId = await createTestUserAndBooking();
    const payment = await createBookingFeePayment(bookingId);
    await markBillPaid(payment.provider_ref!);
    const result = await refundBalance(bookingId, 0);
    expect(result?.status).toBe("paid"); // unchanged
  });

  it("returns null when payment is not yet paid", async () => {
    const bookingId = await createTestUserAndBooking();
    await createBookingFeePayment(bookingId);
    const result = await refundBalance(bookingId, 30_000);
    expect(result).toBeNull();
  });
});

describe("billplz payment creation (mocked fetch)", () => {
  const origKey = process.env.BILLPLZ_API_KEY;
  const origCollection = process.env.BILLPLZ_COLLECTION_ID;
  const origSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(async () => {
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
    process.env.BILLPLZ_API_KEY = "test-billplz-key";
    process.env.BILLPLZ_COLLECTION_ID = "test-collection";
    process.env.NEXT_PUBLIC_SITE_URL = "https://leish.my";
  });

  afterEach(() => {
    if (origKey !== undefined) process.env.BILLPLZ_API_KEY = origKey;
    else delete process.env.BILLPLZ_API_KEY;
    if (origCollection !== undefined) process.env.BILLPLZ_COLLECTION_ID = origCollection;
    else delete process.env.BILLPLZ_COLLECTION_ID;
    if (origSiteUrl !== undefined) process.env.NEXT_PUBLIC_SITE_URL = origSiteUrl;
    else delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("creates a billplz bill when API is configured", async () => {
    const bookingId = await createTestUserAndBooking();
    const mockResponse = { id: "bill_abc123", url: "https://billplz.com/pay/abc123" };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }) as typeof fetch;
    try {
      const payment = await createBookingFeePayment(bookingId);
      expect(payment.provider).toBe("billplz");
      expect(payment.provider_ref).toBe("bill_abc123");
      expect(payment.provider_url).toBe("https://billplz.com/pay/abc123");
      expect(payment.amount).toBe(BOOKING_FEE_SEN);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws when billplz API returns an error", async () => {
    const bookingId = await createTestUserAndBooking();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve("Unprocessable"),
      json: () => Promise.resolve({ error: { message: "Invalid" } }),
    }) as typeof fetch;
    try {
      await expect(createBookingFeePayment(bookingId)).rejects.toThrow("Failed to create payment");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
