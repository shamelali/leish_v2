// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getDb } from "./db";

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
