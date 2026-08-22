// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { requireAdmin, logAdminAction } from "./admin-auth";
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
