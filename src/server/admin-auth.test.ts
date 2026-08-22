// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { requireAdmin, logAdminAction } from "./admin-auth";
import { createSessionToken } from "./session";
import { getDb } from "./db";

async function seedUser(id: string, role: string) {
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, `${id}@test.local`, "Test", role, "x:y", new Date().toISOString());
}

async function cleanUp(id: string) {
  await getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
  await getDb().prepare("DELETE FROM admin_audit_log WHERE admin_user_id = ?").run(id);
}

function requestWithCookie(token?: string) {
  const headers = new Headers();
  if (token) headers.set("cookie", `leish_session=${token}`);
  return new Request("http://localhost/api/admin/test", { headers });
}

describe("requireAdmin", () => {
  const userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds.splice(0)) await cleanUp(id);
  });

  it("returns 401 without a session cookie", async () => {
    const res = await requireAdmin(requestWithCookie());
    expect(res.error).toBeDefined();
    expect(res.error!.status).toBe(401);
    expect(await res.error!.json()).toEqual({ error: "Not authenticated" });
  });

  it("returns 401 for an invalid token", async () => {
    const res = await requireAdmin(requestWithCookie("not-a-jwt"));
    expect(res.error?.status).toBe(401);
  });

  it("returns 401 when the session user no longer exists", async () => {
    const token = await createSessionToken({
      sub: randomUUID(),
      email: "ghost@test.local",
      name: "Ghost",
      role: "admin",
      jti: randomUUID(),
    });
    const res = await requireAdmin(requestWithCookie(token));
    expect(res.error?.status).toBe(401);
  });

  it("returns 403 for a non-admin user", async () => {
    const id = randomUUID();
    userIds.push(id);
    await seedUser(id, "customer");
    const token = await createSessionToken({
      sub: id,
      email: `${id}@test.local`,
      name: "Test",
      role: "customer",
      jti: randomUUID(),
    });
    const res = await requireAdmin(requestWithCookie(token));
    expect(res.error?.status).toBe(403);
    expect(await res.error!.json()).toEqual({ error: "Forbidden — admin access required" });
  });

  it("returns the user for a valid admin session", async () => {
    const id = randomUUID();
    userIds.push(id);
    await seedUser(id, "admin");
    const token = await createSessionToken({
      sub: id,
      email: `${id}@test.local`,
      name: "Test",
      role: "admin",
      jti: randomUUID(),
    });
    const res = await requireAdmin(requestWithCookie(token));
    expect(res.error).toBeUndefined();
    expect(res.user?.id).toBe(id);
    expect(res.user?.role).toBe("admin");
  });
});

describe("logAdminAction", () => {
  // audit rows reference users(id), so each test seeds a real admin user.
  async function seedAdmin() {
    const id = randomUUID();
    await getDb()
      .prepare(
        "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, 'admin', 'x:y', ?)",
      )
      .run(id, `${id}@test.local`, "Test Admin", new Date().toISOString());
    return id;
  }

  async function removeAdmin(id: string) {
    await getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
    await getDb().prepare("DELETE FROM admin_audit_log WHERE admin_user_id = ?").run(id);
  }

  it("writes an audit entry with serialized details", async () => {
    const adminId = await seedAdmin();
    const targetId = randomUUID();
    await logAdminAction(adminId, "user.ban", "users", targetId, { reason: "test" });

    const row = (
      await getDb()
        .prepare("SELECT * FROM admin_audit_log WHERE admin_user_id = ? AND action = ?")
        .all(adminId, "user.ban")
    )[0] as
      | { id: string; target_table: string; target_id: string; details: string; created_at: string }
      | undefined;

    expect(row).toBeDefined();
    expect(row!.target_table).toBe("users");
    expect(row!.target_id).toBe(targetId);
    expect(JSON.parse(row!.details)).toEqual({ reason: "test" });
    expect(new Date(row!.created_at).toString()).not.toBe("Invalid Date");

    await removeAdmin(adminId);
  });

  it("allows null target_id and defaults details to {}", async () => {
    const adminId = await seedAdmin();
    await logAdminAction(adminId, "settings.update", "platform_settings", null);

    const row = (
      await getDb()
        .prepare("SELECT * FROM admin_audit_log WHERE admin_user_id = ? AND action = ?")
        .all(adminId, "settings.update")
    )[0] as { id: string; target_id: null; details: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.target_id).toBeNull();
    expect(JSON.parse(row!.details)).toEqual({});

    await removeAdmin(adminId);
  });

  it("does not throw when the insert fails", async () => {
    // Non-existent admin id violates the FK — must resolve, never throw.
    await expect(
      logAdminAction("no-such-admin", "__invalid_action__", "does_not_exist", null),
    ).resolves.toBeUndefined();
  });
});
