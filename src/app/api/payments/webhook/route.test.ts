// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { getDb } from "@/server/db";
import { hashPassword } from "@/server/password";
import { createBookingPayment } from "@/server/payments";
import { DEFAULT_BOOKING_FEE_SEN } from "@/server/settings";

/**
 * Tests for the Billplz webhook route.
 *
 * The emphasis here is the *alerting* contract rather than the happy path
 * (which `src/server/payments.test.ts` already covers at the unit level). This
 * webhook is the only thing that can confirm a booking, and its failure modes
 * mostly return 200 or 401 rather than throwing — so without an explicit
 * `reportError()` call they would be invisible. These tests pin that down, so
 * nobody "tidies up" the reporting later and silently reintroduces the gap.
 */

interface ReportContext {
  route?: string;
  metadata?: {
    reason?: string;
    hasSignatureHeader?: boolean;
    apiKeyConfigured?: boolean;
    billId?: string;
  };
}

const reportError = vi.fn<(err: unknown, context: ReportContext) => Promise<void>>(async () => {});

vi.mock("@/server/errors", () => ({
  reportError: (err: unknown, context: ReportContext) => reportError(err, context),
}));

// Slack notification is best-effort and network-bound; stub it out.
vi.mock("@/server/notifications", () => ({
  notifySlackPayment: vi.fn(async () => {}),
}));

const { POST } = await import("./route");

const API_KEY = "test-billplz-api-key";
const originalApiKey = process.env.BILLPLZ_API_KEY;

function sign(body: string, key = API_KEY): string {
  return createHmac("sha256", key).update(body).digest("hex");
}

function webhookRequest(body: string, signature?: string | null): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set("x-billplz-signature", signature ?? sign(body));
  return new Request("http://localhost/api/payments/webhook", {
    method: "POST",
    headers,
    body,
  });
}

/** The `reason` recorded on the most recent reportError call. */
function lastReason(): string | undefined {
  const call = reportError.mock.calls.at(-1) as
    [unknown, { metadata?: { reason?: string } }] | undefined;
  return call?.[1]?.metadata?.reason;
}

async function seedBookingWithFeePayment(): Promise<{ bookingId: string; billId: string }> {
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
      "accepted",
      new Date().toISOString(),
    );

  const payment = await createBookingPayment(bookingId, "deposit", DEFAULT_BOOKING_FEE_SEN);
  const row = (await getDb()
    .prepare("SELECT provider_ref FROM payments WHERE id = ?")
    .get(payment.id)) as { provider_ref: string | null } | undefined;

  return { bookingId, billId: row?.provider_ref ?? payment.id };
}

beforeEach(async () => {
  reportError.mockClear();
  process.env.BILLPLZ_API_KEY = API_KEY;
  await getDb().prepare("DELETE FROM payments").run();
  await getDb().prepare("DELETE FROM bookings").run();
  await getDb().prepare("DELETE FROM users").run();
});

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.BILLPLZ_API_KEY;
  else process.env.BILLPLZ_API_KEY = originalApiKey;
});

describe("POST /api/payments/webhook — signature rejection", () => {
  it("rejects a bad signature with 401 and raises an alert", async () => {
    const body = JSON.stringify({ id: "bill_1", paid: true, state: "paid" });
    const res = await POST(webhookRequest(body, "0".repeat(64)));

    expect(res.status).toBe(401);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(lastReason()).toBe("invalid_signature");
  });

  it("rejects a missing signature header and raises an alert", async () => {
    const body = JSON.stringify({ id: "bill_1", paid: true, state: "paid" });
    const res = await POST(webhookRequest(body, null));

    expect(res.status).toBe(401);
    expect(lastReason()).toBe("invalid_signature");
    const call = reportError.mock.calls.at(-1) as [
      unknown,
      { metadata: { hasSignatureHeader: boolean } },
    ];
    expect(call[1].metadata.hasSignatureHeader).toBe(false);
  });

  it("records whether the API key is configured, to distinguish misconfig from forgery", async () => {
    delete process.env.BILLPLZ_API_KEY;
    const body = JSON.stringify({ id: "bill_1", paid: true, state: "paid" });

    const res = await POST(webhookRequest(body, "a".repeat(64)));

    expect(res.status).toBe(401);
    const call = reportError.mock.calls.at(-1) as [
      unknown,
      { metadata: { apiKeyConfigured: boolean } },
    ];
    // Without the key EVERY callback fails — the alert must make that obvious.
    expect(call[1].metadata.apiKeyConfigured).toBe(false);
  });

  it("does not touch payment state when the signature is bad", async () => {
    const { billId } = await seedBookingWithFeePayment();
    const body = JSON.stringify({ id: billId, paid: true, state: "paid" });

    await POST(webhookRequest(body, "f".repeat(64)));

    const row = (await getDb()
      .prepare("SELECT status FROM payments WHERE provider_ref = ?")
      .get(billId)) as { status: string } | undefined;
    expect(row?.status).not.toBe("paid");
  });
});

describe("POST /api/payments/webhook — payloads that are not a paid confirmation", () => {
  it("acks an unpaid callback without alerting", async () => {
    const body = JSON.stringify({ id: "bill_1", paid: false, state: "due" });
    const res = await POST(webhookRequest(body));

    expect(res.status).toBe(200);
    // Routine, not a failure — must not create alert noise.
    expect(reportError).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(webhookRequest("not json at all"));
    expect(res.status).toBe(400);
  });

  it("rejects a payload with no bill id with 400", async () => {
    const body = JSON.stringify({ paid: true, state: "paid" });
    const res = await POST(webhookRequest(body));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/payments/webhook — signed but inconsistent with our data", () => {
  it("alerts on a paid callback for a bill we have no record of", async () => {
    const body = JSON.stringify({ id: "bill_unknown", paid: true, state: "paid" });
    const res = await POST(webhookRequest(body));

    // Still acked, so Billplz stops retrying...
    expect(res.status).toBe(200);
    // ...but it must not pass silently.
    expect(lastReason()).toBe("unknown_bill");
  });
});

describe("POST /api/payments/webhook — happy path", () => {
  it("marks the payment paid and does not alert", async () => {
    const { billId } = await seedBookingWithFeePayment();
    const body = JSON.stringify({ id: billId, paid: true, state: "paid" });

    const res = await POST(webhookRequest(body));

    expect(res.status).toBe(200);
    const row = (await getDb()
      .prepare("SELECT status FROM payments WHERE provider_ref = ?")
      .get(billId)) as { status: string } | undefined;
    expect(row?.status).toBe("paid");
    expect(reportError).not.toHaveBeenCalled();
  });

  it("is idempotent — a duplicate callback does not alert", async () => {
    const { billId } = await seedBookingWithFeePayment();
    const body = JSON.stringify({ id: billId, paid: true, state: "paid" });

    await POST(webhookRequest(body));
    reportError.mockClear();

    // Billplz retries; the second delivery changes nothing. `markBillPaid`
    // reports 0 changed rows, which must NOT be mistaken for an unknown bill.
    const res = await POST(webhookRequest(body));
    expect(res.status).toBe(200);

    const row = (await getDb()
      .prepare("SELECT status FROM payments WHERE provider_ref = ?")
      .get(billId)) as { status: string } | undefined;
    expect(row?.status).toBe("paid");
  });
});
