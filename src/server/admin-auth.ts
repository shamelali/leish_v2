import { NextResponse } from "next/server";
import { getDb, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { getClientIp, rateLimit } from "@/server/ratelimit";

/**
 * Require a valid admin session. Returns the admin user or a JSON error response.
 * Used by every admin API route to enforce admin-only access.
 *
 * Two-tier rate limiting:
 * 1. Pre-auth: IP-based (catches brute-force before session validation)
 * 2. Post-auth: userId + IP (prevents shared-NAT false positives)
 */
export async function requireAdmin(request: Request) {
  // Tier 1: Pre-auth IP rate limit (catches brute-force attacks early).
  const ip = getClientIp(request);
  const preAuthResult = await rateLimit(`admin-ip:${ip}`, 300, 60_000);
  if (!preAuthResult.allowed) {
    return {
      error: NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(preAuthResult.retryAfterMs / 1000)) },
        },
      ),
    };
  }

  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    UserRow | undefined;
  if (!user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  if (user.role !== "admin") {
    return {
      error: NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 }),
    };
  }

  // Tier 2: Post-auth userId + IP rate limit (prevents shared-NAT collisions).
  const postAuthResult = await rateLimit(`admin-user:${user.id}:${ip}`, 500, 60_000);
  if (!postAuthResult.allowed) {
    return {
      error: NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(postAuthResult.retryAfterMs / 1000)) },
        },
      ),
    };
  }

  return { user };
}

/**
 * True when `userId` is an admin AND is the only remaining one. Callers use
 * this to block demotions/deletions that would lock every admin out.
 */
export async function isLastAdmin(userId: string): Promise<boolean> {
  const row = await getDb().prepare("SELECT role FROM users WHERE id = ?").get<{
    role: string;
  }>(userId);
  if (!row || row.role !== "admin") return false;
  const count = await getDb()
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
    .get<{ n: number }>();
  return (count?.n ?? 0) <= 1;
}

/**
 * Atomically attempt to demote or delete the target user, but ONLY if doing
 * so won't leave zero admins. Returns { ok: true } on success or
 * { ok: false, reason } if the guard blocked the operation.
 *
 * This replaces the TOCTOU pattern (read count → decide → write) with a
 * single conditional statement that the database executes atomically.
 */
export async function atomicAdminGuard(
  targetUserId: string,
  action: "demote" | "delete",
  newRole: string = "customer",
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getDb();

  // Verify the target is currently an admin.
  const row = await db
    .prepare("SELECT role FROM users WHERE id = ?")
    .get<{ role: string }>(targetUserId);
  if (!row || row.role !== "admin") {
    // Not an admin — no demotion guard needed.
    return { ok: true };
  }

  if (action === "demote") {
    // Atomic: update role only if there's more than one admin. Single
    // statement with the count subquery avoids the TOCTOU window and the
    // double-write bug where the guard set role='customer' then the caller
    // re-updated to the requested role without the guard.
    const result = await db
      .prepare(
        `UPDATE users SET role = ? WHERE id = ? AND (
          SELECT COUNT(*) FROM users WHERE role = 'admin'
        ) > 1`,
      )
      .run(newRole, targetUserId);

    if (result.changes === 0) {
      return { ok: false, reason: "Cannot demote the last remaining admin" };
    }
    // Force re-login with new role — stale JWT would otherwise live 7 days.
    await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetUserId);
    return { ok: true };
  }

  // action === "delete"
  const result = await db
    .prepare(
      `DELETE FROM users WHERE id = ? AND (
        SELECT COUNT(*) FROM users WHERE role = 'admin'
      ) > 1`,
    )
    .run(targetUserId);

  if (result.changes === 0) {
    return { ok: false, reason: "Cannot delete the last remaining admin" };
  }
  return { ok: true };
}

/**
 * Log an admin action to the audit trail.
 * When `requireAudit` is true (for sensitive actions like demotions/deletions),
 * the function throws on failure to prevent unrecorded mutations.
 */
export async function logAdminAction(
  adminUserId: string,
  action: string,
  targetTable: string,
  targetId: string | null,
  details: Record<string, unknown> = {},
  options?: { requireAudit?: boolean },
) {
  try {
    const { randomUUID } = await import("node:crypto");
    const db = getDb();
    await db
      .prepare(
        `INSERT INTO admin_audit_log (id, admin_user_id, action, target_table, target_id, details, created_at)
         VALUES (@id, @admin_user_id, @action, @target_table, @target_id, @details, @created_at)`,
      )
      .run({
        id: randomUUID(),
        admin_user_id: adminUserId,
        action,
        target_table: targetTable,
        target_id: targetId,
        details: JSON.stringify(details),
        created_at: new Date().toISOString(),
      });
  } catch (err) {
    console.error("[admin-audit] failed to write audit log:", err);
    // For sensitive actions, block the request if audit write fails.
    if (options?.requireAudit) {
      throw new Error(
        `[admin-audit] critical: audit write failed for action "${action}". ` +
          `The operation has been rolled back to prevent an unrecorded mutation.`,
      );
    }
  }
}
