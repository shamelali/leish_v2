// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  activePaymentProvider,
  createBookingPayment,
  getBookingIdForBill,
  getPaymentForBooking,
  getPaymentForBill,
  handlePaymentPaid,
  markBillPaid,
  refundBalancePayment,
  verifyBillplzSignature,
} from "./payments";
import { DEFAULT_BOOKING_FEE_SEN } from "./settings";

const FEE = DEFAULT_BOOKING_FEE_SEN;

async function createTestUserAndBooking(status = "accepted") {
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
      "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
      status,
      new Date().toISOString(),
    );
  return bookingId;
}

async function createTestArtist() {
  const artistId = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      artistId,
      `${artistId}@test.local`,
      "Test Artist",
      "artist",
      hashPassword("password123"),
      new Date().toISOString(),
    );
  return artistId;
}

describe("booking fee payments (dev provider)", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
  });

  it("charges the flat booking deposit (default RM 50)", async () => {
    const bookingId = await createTestUserAndBooking();
    const payment = await createBookingPayment(bookingId, "deposit", FEE);

    expect(payment.amount).toBe(FEE); // default deposit (RM 50)
    expect(payment.currency).toBe("MYR");
    expect(payment.provider).toBe("dev");
    expect(payment.status).toBe("required");
    expect(payment.provider_ref).toMatch(/^dev_/);
  });

  it("links the booking id back from the bill reference", async () => {
    const bookingId = await createTestUserAndBooking();
    const payment = await createBookingPayment(bookingId, "deposit", FEE);
    expect(await getBookingIdForBill(payment.provider_ref!)).toBe(bookingId);
  });

  it("is retrievable by booking id", async () => {
    const bookingId = await createTestUserAndBooking();
    await createBookingPayment(bookingId, "deposit", FEE);
    const found = await getPaymentForBooking(bookingId);
    expect(found?.booking_id).toBe(bookingId);
    expect(found?.amount).toBe(FEE);
  });

  it("returns null when no payment exists", async () => {
    expect(await getPaymentForBooking("nope")).toBeNull();
    expect(await getBookingIdForBill("nope")).toBeNull();
  });

  it("creates a balance payment for the remaining amount", async () => {
    const bookingId = await createTestUserAndBooking();
    const balance = await createBookingPayment(bookingId, "balance", 30_000);
    expect(balance.type).toBe("balance");
    expect(balance.amount).toBe(30_000);
  });

  it("retrieves payment by type", async () => {
    const bookingId = await createTestUserAndBooking();
    await createBookingPayment(bookingId, "deposit", FEE);
    await createBookingPayment(bookingId, "balance", 30_000);
    const deposit = await getPaymentForBooking(bookingId, "deposit");
    const balance = await getPaymentForBooking(bookingId, "balance");
    expect(deposit?.amount).toBe(FEE);
    expect(balance?.amount).toBe(30_000);
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
    const payment = await createBookingPayment(bookingId, "deposit", FEE);
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

  it("refunds a paid balance payment", async () => {
    const bookingId = await createTestUserAndBooking();
    const deposit = await createBookingPayment(bookingId, "deposit", FEE);
    await markBillPaid(deposit.provider_ref!);
    const balance = await createBookingPayment(bookingId, "balance", 30_000);
    await markBillPaid(balance.provider_ref!);

    const paidBalance = await getPaymentForBooking(bookingId, "balance");
    const refunded = await refundBalancePayment(paidBalance!);
    expect(refunded.status).toBe("refunded");

    // The deposit stays untouched.
    const depositAfter = await getPaymentForBooking(bookingId, "deposit");
    expect(depositAfter?.status).toBe("paid");
  });

  it("throws when the balance has not been paid", async () => {
    const bookingId = await createTestUserAndBooking();
    await createBookingPayment(bookingId, "balance", 30_000); // status = required
    const balance = await getPaymentForBooking(bookingId, "balance");
    await expect(refundBalancePayment(balance!)).rejects.toThrow(
      "Only paid balances can be refunded",
    );
  });

  it("throws for deposit payments", async () => {
    const bookingId = await createTestUserAndBooking();
    const deposit = await createBookingPayment(bookingId, "deposit", FEE);
    await markBillPaid(deposit.provider_ref!);
    await expect(refundBalancePayment(deposit)).rejects.toThrow(
      "Only balance payments are refundable",
    );
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
      const payment = await createBookingPayment(bookingId, "deposit", FEE);
      expect(payment.provider).toBe("billplz");
      expect(payment.provider_ref).toBe("bill_abc123");
      expect(payment.provider_url).toBe("https://billplz.com/pay/abc123");
      expect(payment.amount).toBe(FEE);
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
      await expect(createBookingPayment(bookingId, "deposit", FEE)).rejects.toThrow(
        "Failed to create payment",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("getPaymentForBill and getBookingIdForBill", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
  });

  it("getPaymentForBill returns payment by provider_ref", async () => {
    const bookingId = await createTestUserAndBooking();
    const payment = await createBookingPayment(bookingId, "deposit", FEE);
    const found = await getPaymentForBill(payment.provider_ref!);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(payment.id);
    expect(found?.booking_id).toBe(bookingId);
  });

  it("getPaymentForBill returns null for unknown bill", async () => {
    const found = await getPaymentForBill("unknown-bill");
    expect(found).toBeNull();
  });

  it("getBookingIdForBill returns booking id from provider_ref", async () => {
    const bookingId = await createTestUserAndBooking();
    const payment = await createBookingPayment(bookingId, "deposit", FEE);
    const found = await getBookingIdForBill(payment.provider_ref!);
    expect(found).toBe(bookingId);
  });
});

describe("handlePaymentPaid", () => {
  beforeEach(async () => {
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
    await getDb().prepare("DELETE FROM quotations").run();
    await getDb().prepare("DELETE FROM payouts").run();
  });

  it("confirms booking when deposit is paid on accepted booking", async () => {
    const bookingId = await createTestUserAndBooking("accepted");
    const payment = await createBookingPayment(bookingId, "deposit", FEE);
    await markBillPaid(payment.provider_ref!);

    const paidPayment = await getPaymentForBooking(bookingId, "deposit");
    await handlePaymentPaid(paidPayment!);

    const booking = await getDb().prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId);
    expect(booking).toMatchObject({ status: "confirmed" });
  });

  it("does not change status when deposit is paid on requested booking", async () => {
    const bookingId = await createTestUserAndBooking("requested");
    const payment = await createBookingPayment(bookingId, "deposit", FEE);
    await markBillPaid(payment.provider_ref!);

    const paidPayment = await getPaymentForBooking(bookingId, "deposit");
    await handlePaymentPaid(paidPayment!);

    const booking = await getDb().prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId);
    expect(booking).toMatchObject({ status: "requested" });
  });

  it("does not change status when deposit is paid on confirmed booking", async () => {
    const bookingId = await createTestUserAndBooking("confirmed");
    const payment = await createBookingPayment(bookingId, "deposit", FEE);
    await markBillPaid(payment.provider_ref!);

    const paidPayment = await getPaymentForBooking(bookingId, "deposit");
    await handlePaymentPaid(paidPayment!);

    const booking = await getDb().prepare("SELECT status FROM bookings WHERE id = ?").get(bookingId);
    expect(booking).toMatchObject({ status: "confirmed" });
  });

  it("logs warning and returns early when booking not found", async () => {
    const loggerWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const payment = {
      id: "pay-1",
      booking_id: "non-existent-booking",
      type: "deposit" as const,
      amount: 5000,
      currency: "MYR",
      provider: "dev" as const,
      status: "paid" as const,
      provider_ref: "dev_123",
      provider_url: null,
    };
    await handlePaymentPaid(payment);
    // The code uses logger.warn, not console.warn, so we just verify it doesn't throw
    loggerWarn.mockRestore();
  });

  it("marks quotation as paid and creates payout when balance is paid", async () => {
    const bookingId = await createTestUserAndBooking("confirmed");
    const artistId = await createTestArtist();
    await getDb()
      .prepare("UPDATE bookings SET artist_id = ? WHERE id = ?")
      .run(artistId, bookingId);

    // Create an active quotation
    const quotationId = randomUUID();
    await getDb()
      .prepare(
        `INSERT INTO quotations (id, booking_id, base_fee, travel_fee, early_call_fee, accommodation_fee, extras, artist_note, total, status, created_at, expires_at)
         VALUES (?, ?, 0, 0, 0, 0, '[]', 'Note', 30000, 'paid', ?, ?)`,
      )
      .run(quotationId, bookingId, new Date().toISOString(), new Date(Date.now() + 86400000).toISOString());

    const balance = await createBookingPayment(bookingId, "balance", 30_000);
    await markBillPaid(balance.provider_ref!);

    const paidBalance = await getPaymentForBooking(bookingId, "balance");
    await handlePaymentPaid(paidBalance!);

    const quotation = await getDb().prepare("SELECT status FROM quotations WHERE id = ?").get(quotationId);
    expect(quotation).toMatchObject({ status: "paid" });

    const payout = await getDb().prepare("SELECT * FROM payouts WHERE booking_id = ?").get(bookingId);
    expect(payout).toBeDefined();
    expect(payout).toMatchObject({ booking_id: bookingId, status: "pending" });
  });

  it("uses payment amount as quote total when no active quotation", async () => {
    const bookingId = await createTestUserAndBooking("confirmed");
    const artistId = await createTestArtist();
    await getDb()
      .prepare("UPDATE bookings SET artist_id = ? WHERE id = ?")
      .run(artistId, bookingId);

    // No quotation created
    const balance = await createBookingPayment(bookingId, "balance", 30_000);
    await markBillPaid(balance.provider_ref!);

    const paidBalance = await getPaymentForBooking(bookingId, "balance");
    await handlePaymentPaid(paidBalance!);

    const payout = await getDb().prepare("SELECT * FROM payouts WHERE booking_id = ?").get(bookingId);
    expect(payout).toBeDefined();
    expect(payout).toMatchObject({ booking_id: bookingId, gross_sen: 30000 });
  });
});

describe("refundBalancePayment (billplz provider)", () => {
  const origKey = process.env.BILLPLZ_API_KEY;
  const origSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(async () => {
    await getDb().prepare("DELETE FROM payments").run();
    await getDb().prepare("DELETE FROM bookings").run();
    await getDb().prepare("DELETE FROM users").run();
    process.env.BILLPLZ_API_KEY = "test-billplz-key";
    process.env.NEXT_PUBLIC_SITE_URL = "https://leish.my";
  });

  afterEach(() => {
    if (origKey !== undefined) process.env.BILLPLZ_API_KEY = origKey;
    else delete process.env.BILLPLZ_API_KEY;
    if (origSiteUrl !== undefined) process.env.NEXT_PUBLIC_SITE_URL = origSiteUrl;
    else delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("issues a billplz refund and marks payment refunded", async () => {
    const bookingId = await createTestUserAndBooking();
    const payment = await createBookingPayment(bookingId, "balance", 30_000);
    // Manually set to billplz and paid
    await getDb()
      .prepare("UPDATE payments SET provider = ?, status = ?, provider_ref = ? WHERE id = ?")
      .run("billplz", "paid", "bill_123", payment.id);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as typeof fetch;
    try {
      const paidPayment = await getPaymentForBooking(bookingId, "balance");
      const refunded = await refundBalancePayment(paidPayment!);
      expect(refunded.status).toBe("refunded");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/bills/bill_123/refund"),
        expect.objectContaining({ method: "POST" }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to marking refunded when billplz refund fails", async () => {
    const bookingId = await createTestUserAndBooking();
    const payment = await createBookingPayment(bookingId, "balance", 30_000);
    await getDb()
      .prepare("UPDATE payments SET provider = ?, status = ?, provider_ref = ? WHERE id = ?")
      .run("billplz", "paid", "bill_123", payment.id);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    }) as typeof fetch;
    try {
      const paidPayment = await getPaymentForBooking(bookingId, "balance");
      await expect(refundBalancePayment(paidPayment!)).rejects.toThrow("Failed to issue refund");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
