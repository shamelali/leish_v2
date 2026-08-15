import { NextResponse } from "next/server";
import { getDb, toPublicUser, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";

export async function GET(request: Request) {
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
