import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export async function generateCsrfToken(): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const c = await cookies();
  c.set("leish_csrf", token, {
    httpOnly: false,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 86400,
  });
  return token;
}

export async function validateCsrf(req: NextRequest): Promise<boolean> {
  const header = req.headers.get("x-csrf-token");
  const cookie = req.cookies.get("leish_csrf")?.value;
  if (!header || !cookie) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(cookie));
  } catch {
    return false;
  }
}
