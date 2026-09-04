import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db";

/**
 * Email-verification tokens.
 * Same hardening as password-reset tokens: high-entropy raw token shown to
 * the user, only a sha256 hash stored, 24h expiry, single-use semantics
 * (consumed when the account is verified).
 */

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function storeVerificationToken(userId: string): Promise<string> {
  await getDb().prepare("DELETE FROM email_verifications WHERE user_id = ?").run(userId);
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  await getDb()
    .prepare(
      "INSERT INTO email_verifications (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      randomBytes(16).toString("hex"),
      userId,
      tokenHash,
      new Date(Date.now() + VERIFY_TOKEN_TTL_MS).toISOString(),
      new Date().toISOString(),
    );
  return token;
}

/** Build a full verification URL (issues a fresh token). Shared by auth routes. */
export async function createVerifyUrl(userId: string): Promise<string> {
  const token = await storeVerificationToken(userId);
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/api/auth/verify-email?token=${token}`;
}

export async function invalidateVerificationTokens(userId: string) {
  await getDb().prepare("DELETE FROM email_verifications WHERE user_id = ?").run(userId);
}

/** Returns the user id when the token is valid and unexpired, else null. */
export async function validateVerificationToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);
  const db = await getDb();
  const row = (await db
    .prepare("SELECT * FROM email_verifications WHERE token_hash = ? AND used_at IS NULL")
    .get(tokenHash)) as { user_id: string; expires_at: string } | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  // Single-use: mark consumed immediately.
  await db
    .prepare("UPDATE email_verifications SET used_at = ? WHERE token_hash = ?")
    .run(new Date().toISOString(), tokenHash);

  return row.user_id;
}

export { VERIFY_TOKEN_TTL_MS };
