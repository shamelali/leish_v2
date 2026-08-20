import * as jose from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { getDb } from "@/server/db/client";
const secret = new TextEncoder().encode(env.SESSION_SECRET);
const alg = "HS256";
export async function createSession(user: { id: string; role: string; email: string; emailVerified: boolean }) {
  const jti = crypto.randomUUID();
  const access = await new jose.SignJWT({ ...user, jti, type: "access" }).setProtectedHeader({ alg }).setIssuedAt().setExpirationTime("15m").sign(secret);
  const refresh = await new jose.SignJWT({ sub: user.id, jti, type: "refresh" }).setProtectedHeader({ alg }).setIssuedAt().setExpirationTime("7d").sign(secret);
  const c = await cookies();
  c.set("leish_session", access, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 900 });
  c.set("leish_refresh", refresh, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 604800 });
  await getDb().prepare("INSERT INTO sessions(jti, user_id, expires_at) VALUES($1,$2,NOW()+$3::interval) ON CONFLICT DO NOTHING").run(jti, user.id, "7 days").catch(async () => {
    await getDb().prepare("INSERT INTO sessions(jti, user_id, expires_at) VALUES(?,?, datetime('now','+7 days'))").run(jti, user.id);
  });
  return { jti };
}
export async function getSession() {
  try {
    const c = await cookies();
    const token = c.get("leish_session")?.value;
    if (!token) return null;
    const { payload } = await jose.jwtVerify(token, secret);
    if (payload.type !== "access") return null;
    const row = await getDb().prepare("SELECT revoked FROM sessions WHERE jti=$1").get(payload.jti as string).catch(async () => {
      return await getDb().prepare("SELECT revoked FROM sessions WHERE jti=?").get(payload.jti as string);
    }) as any;
    if (row?.revoked) return null;
    return payload as any;
  } catch { return null; }
}
export async function destroySession() {
  const c = await cookies();
  const token = c.get("leish_refresh")?.value || c.get("leish_session")?.value;
  if (token) {
    try { const { payload } = await jose.jwtVerify(token, secret); await getDb().prepare("UPDATE sessions SET revoked=true WHERE jti=$1").run((payload as any).jti).catch(async () => {
      await getDb().prepare("UPDATE sessions SET revoked=1 WHERE jti=?").run((payload as any).jti);
    }); } catch {}
  }
  c.set("leish_session","",{ maxAge:0, path:"/" });
  c.set("leish_refresh","",{ maxAge:0, path:"/" });
}
