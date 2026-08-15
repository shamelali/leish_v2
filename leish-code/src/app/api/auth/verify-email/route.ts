import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { logger } from "@/server/logger";
import { invalidateVerificationTokens, validateVerificationToken } from "@/server/verify-email";

/**
 * GET /api/auth/verify-email?token=...
 * Validates the emailed token, marks the account verified, then redirects
 * to the /verify-email page with an outcome flag (no JSON needed — this is
 * the link clicked inside an email).
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";

  const userId = await validateVerificationToken(token);
  if (!userId) {
    logger.warn("invalid or expired email-verification token used");
    return NextResponse.redirect(new URL("/verify-email?error=1", request.url));
  }

  await getDb().prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(userId);
  await invalidateVerificationTokens(userId);
  logger.info({ userId }, "email verified");

  return NextResponse.redirect(new URL("/verify-email?verified=1", request.url));
}
