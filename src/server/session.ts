import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/lib/types";
import { createServiceRoleClient } from "@/lib/supabase/server";

const COOKIE_NAME = "leish_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is required in production");
    }
    return new TextEncoder().encode("dev-only-insecure-secret-change-me");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  jti: string;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const jti = payload.jti;
  const { sub, email, name, role } = payload;

  const jwt = new SignJWT({ sub, email, name, role, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`);

  // Store JTI in sessions table for revocation tracking
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("sessions").insert({
    jti,
    user_id: payload.sub,
    expires_at: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
  });

  if (error) {
    console.error("[session] failed to insert jti into sessions table", error);
  }

  return jwt.sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });

    if (!payload.sub || !payload.email || !payload.name || !payload.role || !payload.jti) return null;

    // Check if JTI is revoked in sessions table
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("revoked")
      .eq("jti", payload.jti)
      .single();

    if (error || data?.revoked) {
      // Token is revoked or not found in blacklist — invalidate it
      return null;
    }

    return {
      sub: payload.sub,
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
      jti: payload.jti,
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
export { SESSION_TTL_SECONDS };

/** Cookie options shared by login/register (set) and logout (clear). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Revoke a JTI (call on logout). */
export async function revokeSession(jti: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("sessions")
    .update({ revoked: true })
    .eq("jti", jti);

  if (error) {
    console.error("[session] failed to revoke JTI", error);
  }
}