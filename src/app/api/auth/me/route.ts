import { NextResponse } from "next/server";
import { getDb, toPublicUser, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { getSupabaseUser } from "@/lib/supabase/auth";

export async function GET(request: Request) {
  // 1. Check Supabase session first (OAuth users)
  try {
    const sbUser = await getSupabaseUser();
    if (sbUser) return NextResponse.json({ user: sbUser });
  } catch {
    // Supabase env vars may not be set — fall through to custom JWT.
  }

  // 2. Fall back to custom JWT session (email/password users)
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) {
    return NextResponse.json({ user: null });
  }

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    UserRow | undefined;
  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user: toPublicUser(user) });
}
