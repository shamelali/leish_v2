import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionToken,
  revokeSession,
} from "@/server/session";

export async function POST() {
  // Best-effort: revoke the current session's JTI before clearing the cookie
  // so the token can't be replayed until its natural expiry.
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload?.jti) await revokeSession(payload.jti);
    }
  } catch {
    // Ignore — clearing the cookie below is the important part.
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
