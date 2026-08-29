import { NextResponse } from "next/server";
import { getDb, type UserRow } from "@/server/db";
import { verifySessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/server/session";
import { jsonError, statefulRoute } from "@/server/http";
import { logger } from "@/server/logger";
import { atomicAdminGuard } from "@/server/admin-auth";

/**
 * DELETE /api/me
 * GDPR-style "right to erasure": deletes the signed-in account and all
 * related data (bookings, quotations, payments, messages, tokens cascade
 * via FK ON DELETE CASCADE on both backends), then clears the session
 * cookie. Requires ?confirm=1 to avoid accidental deletion.
 */
export const DELETE = statefulRoute(
  async function DELETE(request: Request) {
    const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
    const payload = token ? await verifySessionToken(token) : null;
    if (!payload) return jsonError("Not authenticated", 401);

    const url = new URL(request.url);
    if (url.searchParams.get("confirm") !== "1") {
      return jsonError("Pass ?confirm=1 to delete your account permanently.", 400);
    }

    const db = getDb();
    const user = (await db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
      UserRow | undefined;
    if (!user) return jsonError("Not authenticated", 401);

    // Prevent last admin from self-deleting and locking the platform.
    if (user.role === "admin") {
      const guard = await atomicAdminGuard(user.id, "delete");
      if (!guard.ok) {
        return jsonError(guard.reason, 409);
      }
      // Guard already deleted when ok; ensure cookie cleared.
      const response = NextResponse.json({ deleted: true });
      response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
      logger.info({ userId: user.id }, "account deleted (right to erasure, admin)");
      return response;
    }

    await db.prepare("DELETE FROM users WHERE id = ?").run(user.id);

    const response = NextResponse.json({ deleted: true });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    logger.info({ userId: user.id }, "account deleted (right to erasure)");
    return response;
  },
  { route: "DELETE /api/me" },
);
