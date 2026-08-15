// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashPassword } from "./password";
import {
  BOOKING_FEE_SEN,
  createBookingFeePayment,
  getBookingIdForBill,
  getPaymentForBooking,
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
