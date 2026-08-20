import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const CSRF_COOKIE = "leish_csrf";
const CSRF_HEADER = "x-csrf-token";

export async function generateCsrfToken(): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const c = await cookies();
  c.set(CSRF_COOKIE, token, { httpOnly: false, secure: true, sameSite: "strict", path: "/", maxAge: 60*60*24 });
  return token;
}

export async function validateCsrf(req: NextRequest): Promise<boolean> {
  if (["GET","HEAD","OPTIONS"].includes(req.method)) return true;
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) return false;
  try {
    return timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  } catch { return false; }
}
