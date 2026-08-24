import { NextResponse } from "next/server";
import { getDb, type UserRow } from "@/server/db";
import { logger } from "@/server/logger";
import { storeResetToken } from "@/server/reset-token";
import { enforceRateLimit, enforceSameOrigin, jsonError, readJson } from "@/server/http";
import { z } from "zod";

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

/**
 * POST /api/auth/forgot-password
 * Creates a single-use, expiring reset token.
 * - Always returns the same message whether or not the email exists
 *   (no user enumeration).
 * - In development the reset link is included in the response + logged,
 *   since no email provider is configured. In production it would be
 *   emailed via an SMTP/API provider.
 */
export async function POST(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;
  const limited = await enforceRateLimit(request, { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;

  // Human verification (no-op until TURNSTILE_SECRET_KEY is configured).
  const { verifyTurnstileToken, clientIp } = await import("@/server/turnstile");
  if (
    !(await verifyTurnstileToken(
      (body.data as { turnstileToken?: unknown })?.turnstileToken,
      clientIp(request),
    ))
  ) {
    return jsonError("Human verification failed. Please try again.", 400);
  }

  const parsed = forgotSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { email } = parsed.data;
  const user = (await getDb().prepare("SELECT * FROM users WHERE email = ?").get(email)) as
    UserRow | undefined;

  // Generic response regardless of whether the account exists.
  const generic = NextResponse.json({
    message: "If an account exists for that email, a reset link is on its way.",
  });

  if (!user) {
    logger.info({ email }, "password reset requested for unknown email");
    return generic;
  }

  const token = await storeResetToken(user.id);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const resetUrl = `${base}/reset-password?token=${token}`;

  logger.info({ userId: user.id }, "password reset token issued");
  if (process.env.NODE_ENV !== "production") {
    // No email provider in the demo — surface the link for local testing.
    logger.info({ resetUrl }, "dev reset link");
    return NextResponse.json({
      message: "If an account exists for that email, a reset link is on its way.",
      devResetUrl: resetUrl,
    });
  }

  // Production: send resetUrl by email here (Resend/Postmark/SES).
  return generic;
}
