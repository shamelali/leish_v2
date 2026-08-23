// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { requireAdmin, logAdminAction, isLastAdmin } from "./admin-auth";
import { createSessionToken } from "./session";
import { getDb } from "./db";

function seedUser(id: string, role: string) {
  const db = getDb();
  return db
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, `${id}@test.local`, "Test", role, "x:y", new Date().toISOString());
}

function requestWithCookie(token?: string): Request {
  const headers = new Headers();
  if (token) headers.set("cookie", `leish_session=${token}`);
  return new Request("http://localhost/api/admin", { headers });
}

async function tokenFor(userId: string) {
  return createSessionToken({
    sub: userId,
    email: `${userId}@test.local`,
    name: "Test",
    role: "admin",
    jti: randomUUID(),
  });
}

describe("requireAdmin", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when no session cookie is present", async () => {
    const { error, user } = await requireAdmin(requestWithCookie());
    expect(user).toBeUndefined();
    expect(error?.status).toBe(401);
    await expect(error?.json()).resolves.toEqual({ error: "Not authenticated" });
  });

  it("returns 401 for an invalid or tampered token", async () => {
    const { error, user } = await requireAdmin(requestWithCookie("not-a-jwt"));
    expect(user).toBeUndefined();
    expect(error?.status).toBe(401);
  });

  it("returns 401 when the session user no longer exists", async () => {
    const token = await tokenFor("ghost-admin");
    const { error, user } = await requireAdmin(requestWithCookie(token));
    expect(user).toBeUndefined();
    expect(error?.status).toBe(401);
  });

  it("returns 403 for a valid session with a non-admin role", async () => {
    seedUser("plain-customer", "customer");
    const payload = {
      sub: "plain-customer",
      email: "plain-customer@test.local",
      name: "Test",
      role: "customer" as const,
      jti: randomUUID(),
    };
    const token = await createSessionToken(payload);
    const { error, user } = await requireAdmin(requestWithCookie(token));
    expect(user).toBeUndefined();
    expect(error?.status).toBe(403);
    await expect(error?.json()).resolves.toEqual({
      error: "Forbidden — admin access required",
    });
  });

  it("returns the admin user for a valid admin session", async () => {
    seedUser("real-admin", "admin");
    const token = await tokenFor("real-admin");
    const { error, user } = await requireAdmin(requestWithCookie(token));
    expect(error).toBeUndefined();
    expect(user?.id).toBe("real-admin");
    expect(user?.role).toBe("admin");
  });

  it("extracts the session cookie from a multi-cookie header", async () => {
    seedUser("multi-cookie-admin", "admin");
    const token = await tokenFor("multi-cookie-admin");
    const headers = new Headers({
      cookie: `other=1; leish_session=${token}; another=2`,
    });
    const { error, user } = await requireAdmin(
      new Request("http://localhost/api/admin", { headers }),
    );
    expect(error).toBeUndefined();
    expect(user?.id).toBe("multi-cookie-admin");
  });
});

describe("logAdminAction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes an audit entry with serialized details", async () => {
    seedUser("audit-writer", "admin");
    const adminId = "audit-writer";
    const targetId = randomUUID();

    await logAdminAction(adminId, "update_user", "users", targetId, {
      fields: ["role"],
    });

    const row = (await getDb()
      .prepare("SELECT * FROM admin_audit_log WHERE admin_user_id = ? AND action = ?")
      .get(adminId, "update_user")) as
      | {
          id: string;
          target_table: string;
          target_id: string | null;
          details: string;
        }
      | undefined;

    expect(row).toBeDefined();
    expect(row!.target_table).toBe("users");
    expect(row!.target_id).toBe(targetId);
    expect(JSON.parse(row!.details)).toEqual({ fields: ["role"] });
  });

  it("accepts a null target_id", async () => {
    await logAdminAction("audit-writer", "export_report", "reports", null);

    const row = (await getDb()
      .prepare("SELECT * FROM admin_audit_log WHERE admin_user_id = ? AND action = ?")
      .get("audit-writer", "export_report")) as { target_id: null } | undefined;

    expect(row).toBeDefined();
    expect(row!.target_id).toBeNull();
  });

  it("does not throw when the audit write fails (fail-open)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      getDb().exec("DROP TABLE admin_audit_log");
      await expect(
        logAdminAction("audit-writer", "dropped_table_action", "t", null),
      ).resolves.toBeUndefined();
      expect(consoleError).toHaveBeenCalled();
    } finally {
      // Recreate the table so later tests/files are unaffected.
      getDb().exec(`CREATE TABLE IF NOT EXISTS admin_audit_log (
        id TEXT PRIMARY KEY,
        admin_user_id TEXT NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        target_table TEXT NOT NULL,
        target_id TEXT,
        details TEXT,
        created_at TEXT NOT NULL
      )`);
    }
  });
});

describe("isLastAdmin", () => {
  async function seed(role: string) {
    const id = randomUUID();
    await getDb()
      .prepare(
        "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, 'x:y', ?)",
      )
      .run(id, `${id}@t.local`, "T", role, new Date().toISOString());
    return id;
  }
  async function remove(id: string) {
    await getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
  }

  it("flags a sole admin as the last admin", async () => {
    const admin = await seed("admin");
    // Remove any other admins so this one is the only one.
    const others = (await getDb()
      .prepare("SELECT id FROM users WHERE role='admin' AND id != ?")
      .all(admin)) as { id: string }[];
    for (const o of others) {
      await getDb().prepare("UPDATE users SET role='customer' WHERE id=?").run(o.id);
      await remove(o.id);
    }
    expect(await isLastAdmin(admin)).toBe(true);
    await remove(admin);
  });

  it("does not flag when other admins remain or the user is not an admin", async () => {
    const a1 = await seed("admin");
    const a2 = await seed("admin");
    expect(await isLastAdmin(a1)).toBe(false);

    const customer = await seed("customer");
    expect(await isLastAdmin(customer)).toBe(false);

    await remove(a1);
    await remove(a2);
    await remove(customer);
  });
});

describe("requireAdmin rate limiting", () => {
  it("returns 429 once the per-IP budget is exhausted", async () => {
    const ip = `10.0.0.${Math.floor(Math.random() * 250) + 2}`;
    let lastStatus = 0;
    // The budget is 300/min; fire just past it with unauthenticated requests.
    for (let i = 0; i < 305; i++) {
      const headers = new Headers({ "x-forwarded-for": ip });
      const res = await requireAdmin(new Request("http://localhost/x", { headers }));
      lastStatus = res.error?.status ?? 200;
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);
  });
});
