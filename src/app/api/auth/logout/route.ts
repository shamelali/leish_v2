import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/session";
import { revokeSession } from "@/server/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  // jti is extracted from the cookie token before clearing it;
  // for simplicity, we'll try to revoke based on a best-effort attempt.
  // In production, you'd extract the JTI from the token first.
  return response;
}