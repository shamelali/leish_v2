import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionToken,
  revokeSession,
} from "@/server/session";
import { createServerSupabase } from "@/lib/supabase/auth";

export async function POST() {
  // 1. Revoke custom JWT session if present
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

  // 2. Sign out from Supabase Auth (clears sb session cookies)
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  } catch {
    // Supabase env vars may not be set — safe to ignore.
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
