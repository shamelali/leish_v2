import { NextResponse } from "next/server";
import { getDb, type UserRow } from "@/server/db";
import { logger } from "@/server/logger";
import { sendEmail } from "@/server/email";
import { createVerifyUrl } from "@/server/verify-email";
import { verifyEmailHtml } from "@/server/email-templates";
import { verifySessionToken } from "@/server/session";
import { enforceRateLimit, enforceSameOrigin } from "@/server/http";

/**
 * POST /api/auth/resend-verification
 * Requires a session. Issues a fresh verification token and emails it.
 * Rate-limited to 3 per minute per IP.
 */
export async function POST(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;
  const limited = await enforceRateLimit(request, { limit: 3, windowMs: 60_000 });
  if (limited) return limited;

  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    UserRow | undefined;
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (user.email_verified) {
    return NextResponse.json({ error: "This email is already verified" }, { status: 400 });
  }

  const verifyUrl = await createVerifyUrl(user.id);
  await sendEmail({
    to: user.email,
    subject: "Verify your Leish! account",
    text: `Hi ${user.name},\n\nPlease confirm your email address to activate your account:\n\n${verifyUrl}\n\n— The Leish! team`,
    html: verifyEmailHtml({ name: user.name, verifyUrl }),
  });

  logger.info({ userId: user.id }, "verification email resent");
  return NextResponse.json({
    message: "Verification email sent.",
    devVerifyUrl: process.env.NODE_ENV !== "production" ? verifyUrl : undefined,
  });
}
