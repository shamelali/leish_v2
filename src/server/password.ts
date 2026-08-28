import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing using Node's built-in scrypt — no native dependencies,
 * memory-hard by design, and per-password random salts.
 * Stored format: "<salt-hex>:<hash-hex>"
 *
 * Pepper: When PEPPER_SECRET is set, passwords are HMAC'd with it before
 * scrypt, adding a server-side secret layer.
 */

const KEY_LENGTH = 64;

function getPepper(): string | null {
  return process.env.PEPPER_SECRET || null;
}

function applyPepper(password: string): string {
  const pepper = getPepper();
  if (!pepper) return password;
  return createHmac("sha256", pepper).update(password).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const peppered = applyPepper(password);
  const hash = scryptSync(peppered, salt, KEY_LENGTH);
  return `${salt}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const peppered = applyPepper(password);
  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(peppered, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
