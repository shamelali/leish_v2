import { NextResponse } from "next/server";
import { getDb, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { getClientIp, rateLimit } from "@/server/ratelimit";

/**
 * Require a valid admin session. Returns the admin user or a JSON error response.
 * Used by every admin API route to enforce admin-only access.
 */
export async function requireAdmin(request: Request) {
  // Generous per-IP budget: the admin panel makes many read calls, but this
  // still caps abuse (credential stuffing, runaway scripts) before auth runs.
  const result = await rateLimit(`admin:${getClientIp(request)}`, 300, 60_000);
  if (!result.allowed) {
    return {
      error: NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) } },
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
 * Log an admin action to the audit trail.
 */
export async function logAdminAction(
  adminUserId: string,
  action: string,
  targetTable: string,
  targetId: string | null,
  details: Record<string, unknown> = {},
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
    // Audit log failures should never block the request — log and continue.
    console.error("[admin-audit] failed to write audit log:", err);
  }
}
