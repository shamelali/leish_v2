import { NextResponse } from "next/server";
import { getDb, toPublicUser, type UserRow } from "@/server/db";
import { verifyPassword } from "@/server/password";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/server/session";
import { loginSchema } from "@/server/validation";
import { enforceRateLimit, enforceSameOrigin, jsonError, readJson } from "@/server/http";
import { logger } from "@/server/logger";

export async function POST(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;
  const limited = await enforceRateLimit(request, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;

  const parsed = loginSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { email, password } = parsed.data;
  const db = await getDb();

  const user = (await db.prepare("SELECT * FROM users WHERE email = ?").get(email)) as
    UserRow | undefined;
  if (!user || !verifyPassword(password, user.password)) {
    // Same message for unknown email and wrong password (no user enumeration).
    logger.warn({ email }, "failed login attempt");
    return jsonError("Invalid email or password", 401);
  }

  const token = await createSessionToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  logger.info({ userId: user.id }, "login succeeded");

  const response = NextResponse.json({ user: toPublicUser(user) });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
