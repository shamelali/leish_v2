import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb, bind, toPublicUser, type UserRow } from "@/server/db";
import { hashPassword } from "@/server/password";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/server/session";
import { registerSchema } from "@/server/validation";
import { enforceRateLimit, enforceSameOrigin, jsonError, readJson } from "@/server/http";
import { logger } from "@/server/logger";
import { sendEmail } from "@/server/email";
import { createVerifyUrl } from "@/server/verify-email";

export async function POST(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;
  const limited = await enforceRateLimit(request, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;

  const parsed = registerSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { name, email, password, role, consent, consentTimestamp } = parsed.data;
  const db = await getDb();

  const existing = (await db.prepare("SELECT id FROM users WHERE email = ?").get(email)) as
    { id: string } | undefined;
  if (existing) {
    return jsonError("An account with this email already exists", 409);
  }

  const user: UserRow = {
    id: randomUUID(),
    email,
    name,
    role,
    password: hashPassword(password),
    email_verified: 0,
    consent: consent ? 1 : 0,
    consent_timestamp: consentTimestamp ?? new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  await db
    .prepare(
      "INSERT INTO users (id, email, name, role, password, email_verified, consent, consent_timestamp, created_at) VALUES (@id, @email, @name, @role, @password, @email_verified, @consent, @consent_timestamp, @created_at)",
    )
    .run(bind(user));

  logger.info({ userId: user.id, consent }, "user registered");

  // Issue a verification token and queue the verification email.
  const verifyUrl = await createVerifyUrl(user.id);
  await sendEmail({
    to: email,
    subject: "Verify your Leish! account",
    text: `Hi ${name},\n\nWelcome to Leish! Please confirm your email address to activate your account:\n\n${verifyUrl}\n\nIf you didn't create an account, you can ignore this email.\n\n— The Leish! team`,
  });

  const jti = randomUUID();
  const sessionToken = await createSessionToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    jti,
  });

  const response = NextResponse.json(
    {
      user: toPublicUser(user),
      // Dev convenience: no email provider in the sandbox, so surface the
      // verification link directly (never included in production).
      devVerifyUrl: process.env.NODE_ENV !== "production" ? verifyUrl : undefined,
    },
    { status: 201 },
  );
  response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  return response;
}
