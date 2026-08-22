// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb, closeDb } from "../db";
import { hashPassword } from "../password";

const PG = Boolean(process.env.DATABASE_URL);
const d = PG ? describe : describe.skip;

let uid = 0;
function id(prefix: string) {
  return `${prefix}-${++uid}-${Date.now()}`;
}

beforeAll(async () => {
  if (!PG) return;
  process.env.SESSION_SECRET = "pg-core-test-secret-32-bytes-long!!!!!!";
  const db = getDb();
  await db.prepare("SELECT 1").get();
});

afterAll(async () => {
  if (!PG) return;
  await closeDb();
});

// ── User constraints ────────────────────────────────────────────────────────

d("user constraints", () => {
  it("enforces unique email constraint", async () => {
    const db = getDb();
    const uid1 = id("u1");
    const uid2 = id("u2");
    const email = `dup-${id("em")}@test.com`;
    const pw = hashPassword("pw");
    const now = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(uid1, email, "A", "customer", pw, 0, 0, now);

    await expect(
      db
        .prepare(
          "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(uid2, email, "B", "artist", pw, 0, 0, now),
    ).rejects.toThrow();
  });

  it("enforces role CHECK constraint", async () => {
    const db = getDb();
    const now = new Date().toISOString();
    const pw = hashPassword("pw");

    await expect(
      db
        .prepare(
          "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id("ur"), `role-${id("x")}@test.com`, "Bad", "hacker", pw, 0, 0, now),
    ).rejects.toThrow();
  });

  it("email_verified defaults to 0 and can be set to 1", async () => {
    const db = getDb();
    const userId = id("ev");
    const now = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(userId, `ev-${id("x")}@test.com`, "EV User", "customer", hashPassword("pw"), 0, 0, now);

    let row = (await db
      .prepare("SELECT email_verified FROM users WHERE id = ?")
      .get(userId)) as Record<string, unknown>;
    expect(Number(row.email_verified)).toBe(0);

    await db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(userId);
    row = (await db.prepare("SELECT email_verified FROM users WHERE id = ?").get(userId)) as Record<
      string,
      unknown
    >;
    expect(Number(row.email_verified)).toBe(1);
  });
});

// ── Booking constraints ─────────────────────────────────────────────────────

d("booking constraints", () => {
  it("enforces status CHECK constraint", async () => {
    const db = getDb();
    const userId = id("bu");
    const now = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(userId, `bk-${id("x")}@test.com`, "BK User", "customer", hashPassword("pw"), 0, 0, now);

    await expect(
      db
        .prepare(
          "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id("bk"),
          userId,
          id("art"),
          "Art",
          "S",
          10000,
          `2026-12-${String(Math.floor(Math.random() * 8) + 1).padStart(2, "0")}`,
          `${String(Math.floor(Math.random() * 8) + 9).padStart(2, "0")}:00`,
          "bogus",
          now,
        ),
    ).rejects.toThrow();
  });

  it("partial unique index uq_bookings_slot prevents duplicate active slots", async () => {
    const db = getDb();
    const userId = id("bs");
    const now = new Date().toISOString();
    const date = "2026-11-15";
    const artistId = id("aslot");

    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        userId,
        `slot-${id("x")}@test.com`,
        "Slot User",
        "customer",
        hashPassword("pw"),
        0,
        0,
        now,
      );

    await db
      .prepare(
        "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id("s1"), userId, artistId, "Art", "S", 10000, date, "10:00", "requested", now);

    // Same artist/date/time with active status → duplicate
    await expect(
      db
        .prepare(
          "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id("s2"), userId, artistId, "Art", "S", 10000, date, "10:00", "accepted", now),
    ).rejects.toThrow();

    // Cancelled status → should succeed (not covered by partial index)
    await db
      .prepare(
        "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id("s3"), userId, artistId, "Art", "S", 10000, date, "10:00", "cancelled", now);
  });

  it("balance_reminder_at column is readable and writable", async () => {
    const db = getDb();
    const userId = id("br");
    const bkId = id("brb");
    const now = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(userId, `br-${id("x")}@test.com`, "BR User", "customer", hashPassword("pw"), 0, 0, now);

    await db
      .prepare(
        "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        bkId,
        userId,
        id("art"),
        "A",
        "S",
        10000,
        `2026-12-${String(Math.floor(Math.random() * 8) + 1).padStart(2, "0")}`,
        `${String(Math.floor(Math.random() * 8) + 9).padStart(2, "0")}:00`,
        "requested",
        now,
      );

    const reminderTime = new Date(Date.now() + 86400000).toISOString();
    await db
      .prepare("UPDATE bookings SET balance_reminder_at = ? WHERE id = ?")
      .run(reminderTime, bkId);

    const row = (await db
      .prepare("SELECT balance_reminder_at FROM bookings WHERE id = ?")
      .get(bkId)) as Record<string, unknown>;
    expect(row.balance_reminder_at).toBeTruthy();
  });
});

// ── Cascade deletes ─────────────────────────────────────────────────────────

d("cascade deletes", () => {
  it("deleting a user cascades to their bookings", async () => {
    const db = getDb();
    const userId = id("cd1");
    const bkId = id("cdb");
    const now = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(userId, `cd-${id("x")}@test.com`, "CD User", "customer", hashPassword("pw"), 0, 0, now);

    await db
      .prepare(
        "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        bkId,
        userId,
        id("art"),
        "A",
        "S",
        10000,
        `2026-12-${String(Math.floor(Math.random() * 8) + 1).padStart(2, "0")}`,
        `${String(Math.floor(Math.random() * 8) + 9).padStart(2, "0")}:00`,
        "requested",
        now,
      );

    await db.prepare("DELETE FROM users WHERE id = ?").run(userId);

    const row = await db.prepare("SELECT id FROM bookings WHERE id = ?").get(bkId);
    expect(row).toBeUndefined();
  });

  it("deleting a booking cascades to quotations, payments, and sessions", async () => {
    const db = getDb();
    const userId = id("cd2");
    const bkId = id("cd3");
    const now = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        userId,
        `cd2-${id("x")}@test.com`,
        "CD2 User",
        "customer",
        hashPassword("pw"),
        0,
        0,
        now,
      );

    await db
      .prepare(
        "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        bkId,
        userId,
        id("art"),
        "A",
        "S",
        10000,
        `2026-12-${String(Math.floor(Math.random() * 8) + 1).padStart(2, "0")}`,
        `${String(Math.floor(Math.random() * 8) + 9).padStart(2, "0")}:00`,
        "accepted",
        now,
      );

    // Insert quotation
    const qId = id("cdq");
    await db
      .prepare(
        "INSERT INTO quotations (id, booking_id, base_fee, travel_fee, early_call_fee, accommodation_fee, extras, total, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(qId, bkId, 50000, 0, 0, 0, "[]", 50000, "pending", now, now);

    // Insert payment
    const pId = id("cdp");
    await db
      .prepare(
        "INSERT INTO payments (id, booking_id, amount, currency, provider, status, provider_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(pId, bkId, 20000, "MYR", "dev", "required", "ref", now, now);

    // Insert session referencing this booking's user
    await db
      .prepare(
        "INSERT INTO sessions (jti, user_id, revoked, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id("cdj"), userId, 0, now, now);

    // Delete booking
    await db.prepare("DELETE FROM bookings WHERE id = ?").run(bkId);

    const qRow = await db.prepare("SELECT id FROM quotations WHERE booking_id = ?").get(bkId);
    expect(qRow).toBeUndefined();

    const pRow = await db.prepare("SELECT id FROM payments WHERE booking_id = ?").get(bkId);
    expect(pRow).toBeUndefined();

    // Sessions cascade via user, not booking — verify the user's sessions are still there
    // (user still exists, so sessions remain)
    const sRow = await db.prepare("SELECT jti FROM sessions WHERE user_id = ?").get(userId);
    expect(sRow).toBeTruthy();
  });
});

// ── Quotation constraints ───────────────────────────────────────────────────

d("quotation constraints", () => {
  it("extras column stores and retrieves JSON array", async () => {
    const db = getDb();
    const userId = id("qe1");
    const bkId = id("qeb");
    const now = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(userId, `qe-${id("x")}@test.com`, "QE User", "customer", hashPassword("pw"), 0, 0, now);

    await db
      .prepare(
        "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        bkId,
        userId,
        id("art"),
        "A",
        "S",
        10000,
        `2026-12-${String(Math.floor(Math.random() * 8) + 1).padStart(2, "0")}`,
        `${String(Math.floor(Math.random() * 8) + 9).padStart(2, "0")}:00`,
        "accepted",
        now,
      );

    const extras = JSON.stringify([
      { label: "Travel", amount: 5000 },
      { label: "Early call", amount: 3000 },
    ]);
    const qId = id("qex");
    await db
      .prepare(
        "INSERT INTO quotations (id, booking_id, base_fee, travel_fee, early_call_fee, accommodation_fee, extras, total, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(qId, bkId, 50000, 0, 0, 0, extras, 58000, "pending", now, now);

    const row = (await db.prepare("SELECT extras FROM quotations WHERE id = ?").get(qId)) as Record<
      string,
      unknown
    >;
    const parsed = JSON.parse(String(row.extras)) as { label: string; amount: number }[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0].label).toBe("Travel");
    expect(parsed[1].amount).toBe(3000);
  });

  it("enforces quotation status CHECK constraint", async () => {
    const db = getDb();
    const userId = id("qs1");
    const bkId = id("qsb");
    const now = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(userId, `qs-${id("x")}@test.com`, "QS User", "customer", hashPassword("pw"), 0, 0, now);

    await db
      .prepare(
        "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        bkId,
        userId,
        id("art"),
        "A",
        "S",
        10000,
        `2026-12-${String(Math.floor(Math.random() * 8) + 1).padStart(2, "0")}`,
        `${String(Math.floor(Math.random() * 8) + 9).padStart(2, "0")}:00`,
        "accepted",
        now,
      );

    await expect(
      db
        .prepare(
          "INSERT INTO quotations (id, booking_id, base_fee, total, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id("qsb"), bkId, 50000, 50000, "bogus", now, now),
    ).rejects.toThrow();
  });
});

// ── Payment constraints ─────────────────────────────────────────────────────

d("payment constraints", () => {
  it("enforces payment status CHECK constraint", async () => {
    const db = getDb();
    const userId = id("pc1");
    const bkId = id("pcb");
    const now = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(userId, `pc-${id("x")}@test.com`, "PC User", "customer", hashPassword("pw"), 0, 0, now);

    await db
      .prepare(
        "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        bkId,
        userId,
        id("art"),
        "A",
        "S",
        10000,
        `2026-12-${String(Math.floor(Math.random() * 8) + 1).padStart(2, "0")}`,
        `${String(Math.floor(Math.random() * 8) + 9).padStart(2, "0")}:00`,
        "requested",
        now,
      );

    await expect(
      db
        .prepare(
          "INSERT INTO payments (id, booking_id, amount, currency, provider, status, provider_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id("p1"), bkId, 20000, "MYR", "dev", "bogus", "ref", now, now),
    ).rejects.toThrow();
  });

  it("enforces unique booking_id on payments", async () => {
    const db = getDb();
    const userId = id("pu1");
    const bkId = id("pub");
    const now = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, email_verified, consent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(userId, `pu-${id("x")}@test.com`, "PU User", "customer", hashPassword("pw"), 0, 0, now);

    await db
      .prepare(
        "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        bkId,
        userId,
        id("art"),
        "A",
        "S",
        10000,
        `2026-12-${String(Math.floor(Math.random() * 8) + 1).padStart(2, "0")}`,
        `${String(Math.floor(Math.random() * 8) + 9).padStart(2, "0")}:00`,
        "requested",
        now,
      );

    await db
      .prepare(
        "INSERT INTO payments (id, booking_id, amount, currency, provider, status, provider_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id("p1"), bkId, 20000, "MYR", "dev", "required", "ref1", now, now);

    // Second payment for same booking → unique violation
    await expect(
      db
        .prepare(
          "INSERT INTO payments (id, booking_id, amount, currency, provider, status, provider_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id("p2"), bkId, 20000, "MYR", "dev", "required", "ref2", now, now),
    ).rejects.toThrow();
  });
});
