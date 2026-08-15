import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db";

/**
 * Password-reset tokens.
 * - A high-entropy raw token is shown to the user (in the reset link).
 * - Only a sha256 hash of the token is stored — the raw token is never
 *   persisted, so a DB leak can't be replayed.
 * - Tokens expire after RESET_TOKEN_TTL_MS (1 hour) and are single-use.
 */

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

export async function storeResetToken(userId: string): Promise<string> {
  const { token, tokenHash } = createResetToken();
  const db = await getDb();
  await db
    .prepare(
      "INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      randomBytes(16).toString("hex"),
      userId,
      tokenHash,
      new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
      new Date().toISOString(),
    );
  return token;
}

/** Invalidate any previously issued tokens for a user (e.g. after password change). */
export async function invalidateResetTokens(userId: string) {
  await getDb().prepare("DELETE FROM password_resets WHERE user_id = ?").run(userId);
}

export interface ValidatedReset {
  userId: string;
}

/** Validate a raw token; returns the user id when valid, null otherwise. */
export async function validateResetToken(token: string): Promise<ValidatedReset | null> {
  const tokenHash = hashToken(token);
  const db = await getDb();
  const row = (await db
    .prepare("SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL")
    .get(tokenHash)) as { user_id: string; expires_at: string } | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  // Single-use: mark consumed immediately (within the same transaction as the
  // password update would be ideal; acceptable for the demo).
  await db
    .prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?")
    .run(new Date().toISOString(), tokenHash);
  return { userId: row.user_id };
}

export { RESET_TOKEN_TTL_MS };
