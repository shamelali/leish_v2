import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing using Node's built-in scrypt — no native dependencies,
 * memory-hard by design, and per-password random salts.
 * Stored format: "<salt-hex>:<hash-hex>"
 */

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `${salt}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
