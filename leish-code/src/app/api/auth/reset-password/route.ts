import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { hashPassword } from "@/server/password";
import { logger } from "@/server/logger";
import { invalidateResetTokens, validateResetToken } from "@/server/reset-token";
import { enforceRateLimit, enforceSameOrigin, jsonError, readJson } from "@/server/http";
import { z } from "zod";

const resetSchema = z.object({
  token: z.string().min(32, "Invalid reset link"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

/**
 * POST /api/auth/reset-password
 * Validates a single-use reset token and sets a new password.
 * Invalid/expired/used tokens all return the same 400 (no oracle).
 */
export async function POST(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;
  const limited = await enforceRateLimit(request, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;

  const parsed = resetSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { token, password } = parsed.data;
  const valid = await validateResetToken(token);
  if (!valid) {
    logger.warn("invalid or expired password reset token used");
    return jsonError("This reset link is invalid or has expired. Please request a new one.", 400);
  }

  await getDb()
    .prepare("UPDATE users SET password = ? WHERE id = ?")
    .run(hashPassword(password), valid.userId);
  await invalidateResetTokens(valid.userId);

  logger.info({ userId: valid.userId }, "password reset completed");
  return NextResponse.json({ message: "Password updated. You can now log in." });
}
