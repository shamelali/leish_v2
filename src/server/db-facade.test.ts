// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getDb, toPublicUser, asRows, bind, isPostgres, type UserRow } from "./db";

describe("sqlite facade positional run", () => {
  it("binds 5 positional string args (devSend pattern)", async () => {
    const db = getDb();
    await db.exec("CREATE TABLE IF NOT EXISTS _t (a TEXT, b TEXT, c TEXT, d TEXT, e TEXT)");
    await db.prepare("DELETE FROM _t").run();
    const r = await db
      .prepare("INSERT INTO _t (a,b,c,d,e) VALUES (?,?,?,?,?)")
      .run("id1", "to@x", "subject", "body", new Date().toISOString());
    expect(r.changes).toBe(1);
    const row = await db.prepare("SELECT * FROM _t").get<{ a: string }>();
    expect(row?.a).toBe("id1");
  });
});

describe("slot uniqueness (partial unique index)", () => {
  it("rejects a second active booking for the same artist/date/time", async () => {
    const db = getDb();
    await db
      .prepare(
        "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("u-slot", "u@slot.test", "Slot", "customer", "x:y", new Date().toISOString());
    const slot = { artist: "aisha-azman", date: "2026-09-10", time: "10:00 AM" };
    const base = {
      id: "",
      user_id: "u-slot",
      artist_id: slot.artist,
      artist_name: "Aisha",
      service: "S",
      price: 100,
      date: slot.date,
      time: slot.time,
      notes: null,
      event_type: "X",
      venue: null,
      guest_count: 0,
      created_at: new Date().toISOString(),
    };
    const ins = (id: string, status: string) =>
      db
        .prepare(
          "INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, notes, event_type, venue, guest_count, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          base.user_id,
          base.artist_id,
          base.artist_name,
          base.service,
          base.price,
          base.date,
          base.time,
          base.notes,
          base.event_type,
          base.venue,
          base.guest_count,
          status,
          base.created_at,
        );

    await ins("slot-1", "requested");
    // Same slot, active status → must fail.
    await expect(ins("slot-2", "accepted")).rejects.toThrow();
    // Same slot, cancelled → allowed (partial index ignores it).
    await expect(ins("slot-3", "cancelled")).resolves.toBeTruthy();
  });
});

describe("db helpers", () => {
  it("toPublicUser strips password and converts email_verified", () => {
    const user: UserRow = {
      id: "u1",
      email: "a@b.com",
      name: "Alice",
      role: "customer",
      password: "hashed",
      email_verified: 1,
      consent: 1,
      consent_timestamp: null,
      created_at: "2026-01-01",
    };
    const pub = toPublicUser(user);
    expect(pub.id).toBe("u1");
    expect(pub.email).toBe("a@b.com");
    expect(pub.emailVerified).toBe(true);
    expect(pub).not.toHaveProperty("password");
  });

  it("toPublicUser handles email_verified = 0", () => {
    const user: UserRow = {
      id: "u2",
      email: "b@c.com",
      name: "Bob",
      role: "artist",
      password: "hashed",
      email_verified: 0,
      consent: 0,
      consent_timestamp: null,
      created_at: "2026-01-01",
    };
    expect(toPublicUser(user).emailVerified).toBe(false);
  });

  it("asRows casts an array of records", () => {
    const rows = [{ a: 1 }, { a: 2 }];
    expect(asRows<{ a: number }>(rows)).toEqual(rows);
  });

  it("bind casts an object for named params", () => {
    const row = { id: "x", val: 42 };
    const bound = bind(row);
    expect(bound.id).toBe("x");
    expect(bound.val).toBe(42);
  });

  it("isPostgres returns false when DATABASE_URL is not set", () => {
    const orig = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(isPostgres()).toBe(false);
    } finally {
      if (orig !== undefined) process.env.DATABASE_URL = orig;
    }
  });

  it("getDb returns a facade", () => {
    const db = getDb();
    expect(db).toBeDefined();
    expect(typeof db.prepare).toBe("function");
    expect(typeof db.exec).toBe("function");
  });

  it("isPostgres returns true when DATABASE_URL is set", () => {
    const orig = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://localhost/test";
    try {
      expect(isPostgres()).toBe(true);
    } finally {
      if (orig !== undefined) process.env.DATABASE_URL = orig;
      else delete process.env.DATABASE_URL;
    }
  });
});
