// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { getDb, closeDb } from "../db";
import { hashPassword } from "../password";
import {
  createQuotation,
  getActiveQuotation,
  markQuotationExpired,
  findExpiredQuotations,
} from "../quotations";
import {
  createBookingPayment,
  getPaymentForBooking,
  markBillPaid,
  refundBalancePayment,
} from "../payments";
import { createSessionToken, verifySessionToken, revokeSession } from "../session";
import { storeVerificationToken, validateVerificationToken } from "../verify-email";
import { storeResetToken, validateResetToken } from "../reset-token";

const PG = Boolean(process.env.DATABASE_URL);
const d = PG ? describe : describe.skip;

let uid = 0;
function id(prefix: string) {
  return `${prefix}-${++uid}-${Date.now()}`;
}

function futureDateISO(): string {
  const d = new Date(Date.now() + 14 * 86_400_000);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

async function createTestUser(role: "customer" | "artist" = "customer") {
  const db = getDb();
  const userId = id("user");
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, `${userId}@test.com`, `User ${userId}`, role, hashPassword("pw"), 1, 1, now);
  return userId;
}

beforeAll(async () => {
  if (!PG) return;
  process.env.SESSION_SECRET = "pg-test-secret-32-bytes-long!!!!!!!!!!";
  process.env.BILLPLZ_API_KEY = "";
  process.env.BILLPLZ_COLLECTION_ID = "";
  const db = getDb();
  await db.prepare("SELECT 1").get();
});

afterAll(async () => {
  if (!PG) return;
  await closeDb();
});

// ── Full booking lifecycle ──────────────────────────────────────────────────

d("booking lifecycle (customer flow)", () => {
  let db: ReturnType<typeof getDb>;
  let customerId: string;
  let artistId: string;

  beforeEach(() => {
    db = getDb();
  });

  it("complete lifecycle: register → book → accept → quotation → pay → confirm → complete", async () => {
    // 1. Register customer and artist
    customerId = await createTestUser("customer");
    artistId = await createTestUser("artist");

    // 2. Customer creates a booking
    const bkId = id("bk");
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, notes, event_type, venue, guest_count, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?)`,
      )
      .run(
        bkId,
        customerId,
        artistId,
        "Test Artist",
        "Bridal Makeup",
        150000,
        futureDateISO(),
        "10:00",
        "Test booking",
        "Bridal",
        "KLCC",
        100,
        now,
      );

    // 3. Verify booking exists as requested
    let bkRow = (await db.prepare("SELECT status FROM bookings WHERE id = ?").get(bkId)) as Record<
      string,
      unknown
    >;
    expect(bkRow.status).toBe("requested");

    // 4. Artist accepts (status -> accepted)
    await db.prepare("UPDATE bookings SET status = 'accepted' WHERE id = ?").run(bkId);
    bkRow = (await db.prepare("SELECT status FROM bookings WHERE id = ?").get(bkId)) as Record<
      string,
      unknown
    >;
    expect(bkRow.status).toBe("accepted");

    // 5. Artist sends quotation
    const quotation = await createQuotation(bkId, {
      baseFee: 80000,
      travelFee: 5000,
      earlyCallFee: 3000,
      accommodationFee: 2000,
      extras: [{ label: "Hijab styling", amount: 10000 }],
      artistNote: "Includes trial",
    });
    expect(quotation.total).toBe(100000);
    expect(quotation.status).toBe("pending");

    // 6. Verify active quotation
    const activeQ = await getActiveQuotation(bkId);
    expect(activeQ).toBeTruthy();
    expect(activeQ!.id).toBe(quotation.id);

    // 7. Customer pays booking fee (dev provider)
    const payment = await createBookingPayment(bkId, "deposit", 20000);
    expect(payment.amount).toBe(20000); // RM 200
    expect(payment.status).toBe("required");
    expect(payment.provider).toBe("dev");

    // 8. Verify payment record
    const fetchedPayment = await getPaymentForBooking(bkId);
    expect(fetchedPayment).toBeTruthy();
    expect(fetchedPayment!.booking_id).toBe(bkId);

    // 9. Mark payment paid (simulates webhook)
    const marked = await markBillPaid(payment.provider_ref!);
    expect(marked).toBe(true);

    // 10. Confirm booking (status -> confirmed)
    await db.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = ?").run(bkId);
    bkRow = (await db.prepare("SELECT status FROM bookings WHERE id = ?").get(bkId)) as Record<
      string,
      unknown
    >;
    expect(bkRow.status).toBe("confirmed");

    // 11. Artist completes
    await db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(bkId);
    bkRow = (await db.prepare("SELECT status FROM bookings WHERE id = ?").get(bkId)) as Record<
      string,
      unknown
    >;
    expect(bkRow.status).toBe("completed");
  });
});

// ── Quotation lifecycle ─────────────────────────────────────────────────────

d("quotation lifecycle (expiry + supersede)", () => {
  it("create, supersede, and expire quotations", async () => {
    const db = getDb();
    const customerId = await createTestUser("customer");
    const artistId = await createTestUser("artist");
    const bkId = id("qb");

    await db
      .prepare(
        `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)`,
      )
      .run(
        bkId,
        customerId,
        artistId,
        "A",
        "S",
        10000,
        futureDateISO(),
        "10:00",
        new Date().toISOString(),
      );

    // Create first quotation
    const q1 = await createQuotation(bkId, { baseFee: 50000 });
    expect(q1.status).toBe("pending");

    // Create second quotation (supersedes first)
    const q2 = await createQuotation(bkId, { baseFee: 60000 });
    expect(q2.status).toBe("pending");

    // First should be superseded now
    const active = await getActiveQuotation(bkId);
    expect(active!.id).toBe(q2.id);

    // Find expired (none yet)
    const expired1 = await findExpiredQuotations();
    expect(expired1.every((q) => q.id !== q2.id)).toBe(true);

    // Manually mark expired
    const marked = await markQuotationExpired(q2.id);
    expect(marked).toBe(true);

    // q1 was superseded, q2 is expired → getActiveQuotation returns expired q2
    const activeAfter = await getActiveQuotation(bkId);
    expect(activeAfter).not.toBeNull();
    expect(activeAfter!.status).toBe("expired");
  });
});

// ── Payment refund ──────────────────────────────────────────────────────────

d("payment refund", () => {
  it("refund balance on dev provider", async () => {
    const db = getDb();
    const customerId = await createTestUser("customer");
    const bkId = id("rb");
    const artistId = id("artref");

    await db
      .prepare(
        `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)`,
      )
      .run(
        bkId,
        customerId,
        artistId,
        "A",
        "S",
        10000,
        futureDateISO(),
        "11:00",
        new Date().toISOString(),
      );

    // Create and pay deposit, then create and pay a balance
    const payment = await createBookingPayment(bkId, "deposit", 20000);
    await new Promise((r) => setTimeout(r, 150));
    await markBillPaid(payment.provider_ref!);

    const balance = await createBookingPayment(bkId, "balance", 15000);
    await new Promise((r) => setTimeout(r, 150));
    await markBillPaid(balance.provider_ref!);

    // Refund
    const paidBalance = await getPaymentForBooking(bkId, "balance");
    const refunded = await refundBalancePayment(paidBalance!);
    expect(refunded.status).toBe("refunded");

    // Verify final state
    const final = await getPaymentForBooking(bkId, "balance");
    expect(final!.status).toBe("refunded");
  });

  it("no refund on unpaid booking", async () => {
    const db = getDb();
    const customerId = await createTestUser("customer");
    const bkId = id("nrb");
    const artistId = id("artnr");

    await db
      .prepare(
        `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?)`,
      )
      .run(
        bkId,
        customerId,
        artistId,
        "A",
        "S",
        10000,
        futureDateISO(),
        "11:00",
        new Date().toISOString(),
      );

    await createBookingPayment(bkId, "balance", 15000); // status = required (not paid)

    const balance = await getPaymentForBooking(bkId, "balance");
    await expect(refundBalancePayment(balance!)).rejects.toThrow(
      "Only paid balances can be refunded",
    );
  });
});

// ── Sessions ────────────────────────────────────────────────────────────────

d("session management against PG", () => {
  it("create, verify, and revoke a session token", async () => {
    const userId = await createTestUser("customer");

    const token = await createSessionToken({
      sub: userId,
      email: `${userId}@test.com`,
      name: `User ${userId}`,
      role: "customer",
      jti: id("jti"),
    });

    // Verify
    const payload = await verifySessionToken(token);
    expect(payload).toBeTruthy();
    expect(payload!.sub).toBe(userId);
    expect(payload!.role).toBe("customer");

    // Revoke
    await revokeSession(payload!.jti);

    // Verify revoked
    const revoked = await verifySessionToken(token);
    expect(revoked).toBeNull();
  });
});

// ── Email verification tokens ───────────────────────────────────────────────

d("email verification tokens against PG", () => {
  it("store and validate verification token", async () => {
    const userId = await createTestUser("customer");
    const db = getDb();

    // Reset to unverified
    await db.prepare("UPDATE users SET email_verified = 0 WHERE id = ?").run(userId);

    // Store token
    const token = await storeVerificationToken(userId);
    expect(token).toBeTruthy();
    expect(token.length).toBe(64); // 32 bytes hex

    // Validate
    const found = await validateVerificationToken(token);
    expect(found).toBe(userId);

    // Validate again — storeVerificationToken does NOT consume the token
    const found2 = await validateVerificationToken(token);
    expect(found2).toBe(userId);
  });

  it("rejects expired verification token", async () => {
    const userId = await createTestUser("customer");
    const db = getDb();

    const { randomBytes, createHash } = await import("node:crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const past = new Date(Date.now() - 86400000).toISOString();

    await db
      .prepare(
        `INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(randomBytes(16).toString("hex"), userId, tokenHash, past, past);

    const found = await validateVerificationToken(token);
    expect(found).toBeNull();
  });
});

// ── Password reset tokens ───────────────────────────────────────────────────

d("password reset tokens against PG", () => {
  it("store, validate, and consume reset token", async () => {
    const userId = await createTestUser("customer");

    const token = await storeResetToken(userId);
    expect(token).toBeTruthy();
    expect(token.length).toBe(64);

    // First validation succeeds
    const result = await validateResetToken(token);
    expect(result).toBeTruthy();
    expect(result!.userId).toBe(userId);

    // Second validation fails (single-use: consumed)
    const result2 = await validateResetToken(token);
    expect(result2).toBeNull();
  });

  it("rejects expired reset token", async () => {
    const userId = await createTestUser("customer");
    const db = getDb();

    const { randomBytes, createHash } = await import("node:crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const past = new Date(Date.now() - 3600000).toISOString();

    await db
      .prepare(
        `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(randomBytes(16).toString("hex"), userId, tokenHash, past, past);

    const result = await validateResetToken(token);
    expect(result).toBeNull();
  });

  it("invalidateResetTokens clears all tokens for user", async () => {
    const userId = await createTestUser("customer");
    const db = getDb();

    await storeResetToken(userId);
    await storeResetToken(userId);

    const before = (await db
      .prepare("SELECT COUNT(*) as cnt FROM password_resets WHERE user_id = ?")
      .get(userId)) as Record<string, unknown>;
    expect(Number(before.cnt)).toBeGreaterThanOrEqual(2);

    await import("../reset-token").then((m) => m.invalidateResetTokens(userId));

    const after = (await db
      .prepare("SELECT COUNT(*) as cnt FROM password_resets WHERE user_id = ?")
      .get(userId)) as Record<string, unknown>;
    expect(Number(after.cnt)).toBe(0);
  });
});
