import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(_scrypt) as any;
const PARAMS = { N: 16384, r: 8, p: 1, dkLen: 64 };
const PEPPER = process.env.PASSWORD_PEPPER || "";
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const derived = (await scrypt(PEPPER + password, salt, PARAMS.dkLen, PARAMS)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(PEPPER + password, salt, PARAMS.dkLen, PARAMS)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
