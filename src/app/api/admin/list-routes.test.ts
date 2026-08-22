// @vitest-environment node

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { GET as usersGET } from "./users/route";
import { GET as auditGET } from "./audit/route";
import { createSessionToken } from "@/server/session";
import { getDb } from "@/server/db";
import { logAdminAction } from "@/server/admin-auth";

const ADMIN_ID = `lr-admin-${randomUUID()}`;

beforeAll(async () => {
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, 'admin', 'x:y', ?)",
    )
    .run(ADMIN_ID, `${ADMIN_ID}@test.local`, "List Routes Admin", new Date().toISOString());
});

async function adminCookie(): Promise<string> {
  const token = await createSessionToken({
    sub: ADMIN_ID,
    email: `${ADMIN_ID}@test.local`,
    name: "List Routes Admin",
    role: "admin",
    jti: randomUUID(),
  });
  return `leish_session=${token}`;
}

function seedUser(id: string, role: string, name: string, createdAtOffsetMs = 0) {
  return getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      `${id}@test.local`,
      name,
      role,
      "x:y",
      new Date(Date.now() + createdAtOffsetMs).toISOString(),
    );
}

async function seedAudit(action: string, targetTable: string) {
  await logAdminAction(ADMIN_ID, action, targetTable, null, {});
}

function get(handler: typeof usersGET | typeof auditGET, path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return handler(new Request(`http://localhost${path}`, { headers }));
}

describe("GET /api/admin/users filters", () => {
  const suffix = randomUUID().slice(0, 8);

  afterEach(async () => {
    await Promise.all([getDb().prepare("DELETE FROM users WHERE id LIKE 'listroutes-%'").run()]);
  });

  it("returns 401 without an admin session", async () => {
    const res = await get(usersGET, "/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("lists users with total", async () => {
    seedUser(`listroutes-u1-${suffix}`, "customer", "Zarif User");
    seedUser(`listroutes-u2-${suffix}`, "artist", "Melur User");

    const res = await get(usersGET, "/api/admin/users", await adminCookie());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      users: Array<{ id: string }>;
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.users.length).toBeGreaterThanOrEqual(2);
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it("filters by case-insensitive search on name or email", async () => {
    seedUser(`listroutes-s1-${suffix}`, "customer", "Nadia SearchTarget");
    seedUser(`listroutes-s2-${suffix}`, "customer", "Unrelated Person");

    const res = await get(usersGET, `/api/admin/users?search=searchtarget`, await adminCookie());
    const body = (await res.json()) as { users: Array<{ name: string }>; total: number };

    expect(body.total).toBe(1);
    expect(body.users[0]!.name).toBe("Nadia SearchTarget");
  });

  it("filters by role", async () => {
    seedUser(`listroutes-r1-${suffix}`, "studio", "Studio One");
    seedUser(`listroutes-r2-${suffix}`, "customer", "Customer One");

    const res = await get(usersGET, `/api/admin/users?role=studio`, await adminCookie());
    const body = (await res.json()) as { users: Array<{ role: string }> };

    expect(body.users.length).toBeGreaterThan(0);
    for (const u of body.users) expect(u.role).toBe("studio");
  });

  it("ignores invalid role values rather than filtering", async () => {
    seedUser(`listroutes-i1-${suffix}`, "customer", "Plain Customer");

    const res = await get(usersGET, `/api/admin/users?role=superadmin`, await adminCookie());
    const body = (await res.json()) as { users: unknown[] };
    expect(body.users.length).toBeGreaterThanOrEqual(1);
  });

  it("applies limit and offset pagination", async () => {
    seedUser(`listroutes-p1-${suffix}`, "customer", "Page A", -3000);
    seedUser(`listroutes-p2-${suffix}`, "customer", "Page B", -2000);
    seedUser(`listroutes-p3-${suffix}`, "customer", "Page C", -1000);

    const page1 = await get(
      usersGET,
      `/api/admin/users?limit=2&offset=0&search=listroutes-p`,
      await adminCookie(),
    );
    const b1 = (await page1.json()) as { users: Array<{ name: string }>; total: number };
    expect(b1.total).toBe(3);
    expect(b1.users.map((u) => u.name)).toEqual(["Page C", "Page B"]);

    const page2 = await get(
      usersGET,
      `/api/admin/users?limit=2&offset=2&search=listroutes-p`,
      await adminCookie(),
    );
    const b2 = (await page2.json()) as { users: Array<{ name: string }> };
    expect(b2.users.map((u) => u.name)).toEqual(["Page A"]);
  });
});

describe("GET /api/admin/audit filters", () => {
  const suffix = randomUUID().slice(0, 8);

  it("returns 401 without an admin session", async () => {
    const res = await get(auditGET, "/api/admin/audit");
    expect(res.status).toBe(401);
  });

  it("filters by case-insensitive action substring", async () => {
    await seedAudit(`seed_users_${suffix}_ONE`, "users");
    await seedAudit(`delete_thing_${suffix}_TWO`, "payments");

    const res = await get(
      auditGET,
      `/api/admin/audit?action=SEED_USERS_${suffix.toUpperCase()}`,
      await adminCookie(),
    );
    const body = (await res.json()) as { entries: Array<{ action: string }>; total: number };

    expect(body.total).toBe(1);
    expect(body.entries[0]!.action).toBe(`seed_users_${suffix}_ONE`);
  });

  it("filters by exact target table", async () => {
    await seedAudit(`audit_a_${suffix}`, "quotations");
    await seedAudit(`audit_b_${suffix}`, "bookings");

    const res = await get(auditGET, `/api/admin/audit?targetTable=quotations`, await adminCookie());
    const body = (await res.json()) as {
      entries: Array<{ target_table: string; action: string }>;
    };

    const ours = body.entries.filter((e) => e.action.endsWith(suffix));
    expect(ours.length).toBe(1);
    expect(ours[0]!.target_table).toBe("quotations");
  });

  it("joins admin user details into entries", async () => {
    await seedAudit(`joincheck_${suffix}`, "users");

    const res = await get(
      auditGET,
      `/api/admin/audit?action=joincheck_${suffix}`,
      await adminCookie(),
    );
    const body = (await res.json()) as {
      entries: Array<{ admin_user_id: string; admin_email: string | null }>;
    };

    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]!.admin_user_id).toBe(ADMIN_ID);
    expect(body.entries[0]!.admin_email).toBe(`${ADMIN_ID}@test.local`);
  });
});
