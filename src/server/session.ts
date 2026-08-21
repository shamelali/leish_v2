import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/lib/types";
import { getDb } from "@/server/db";
import { logger } from "@/server/logger";

/**
 * Session management: a signed, httpOnly, same-site cookie holding a JWT.
 * Each token carries a unique `jti` recorded in the `sessions` table so a
 * session can be revoked server-side (e.g. on logout) before it naturally
 * expires. Revocation state lives in the same db-facade (SQLite/Postgres) as
 * the rest of the app — no external dependency required.
 */

const COOKIE_NAME = "leish_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is required in production");
    }
    // Dev-only fallback so the demo works without configuration.
    return new TextEncoder().encode("dev-only-insecure-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  jti: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const { sub, email, name, role, jti } = payload;

  const jwt = await new SignJWT({ email, name, role, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());

  // Record the JTI so the session can be revoked before its natural expiry.
  try {
    const db = getDb();
    const now = new Date();
    await db
      .prepare(
        "INSERT INTO sessions (jti, user_id, revoked, expires_at, created_at) VALUES (@jti, @user_id, 0, @expires_at, @created_at)",
      )
      .run({
        jti,
        user_id: sub,
        expires_at: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
        created_at: now.toISOString(),
      });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "[session] failed to record jti",
    );
  }

  return jwt;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });

    if (!payload.sub || !payload.email || !payload.name || !payload.role || !payload.jti) {
      return null;
    }

    // Reject tokens whose JTI has been explicitly revoked.
    try {
      const db = getDb();
      const row = (await db
        .prepare("SELECT revoked FROM sessions WHERE jti = ?")
        .get(String(payload.jti))) as { revoked: number } | undefined;
      if (row && row.revoked) return null;
    } catch (err) {
      // On a lookup failure, fail open on validity (the JWT signature and
      // expiry still gate access) but log for visibility.
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "[session] revocation lookup failed",
      );
    }

    return {
      sub: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
      jti: String(payload.jti),
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
export { SESSION_TTL_SECONDS };

/** Cookie options shared by login/register (set) and logout (clear). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Revoke a JTI (call on logout). */
export async function revokeSession(jti: string): Promise<void> {
  try {
    const db = getDb();
    await db.prepare("UPDATE sessions SET revoked = 1 WHERE jti = ?").run(jti);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "[session] failed to revoke jti",
    );
  }
}
