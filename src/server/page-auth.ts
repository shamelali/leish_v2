import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseUser } from "@/lib/supabase/auth";
import { PATHNAME_HEADER } from "@/lib/request-headers";
import { getDb, type UserRow } from "./db";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/**
 * Resolve the signed-in user inside a server component.
 *
 * Same resolution order as `requireAdmin()`: Supabase (OAuth) first, then the
 * custom JWT cookie. Extracted so every guarded layout agrees on the order —
 * a page that only checked one of the two would lock out exactly the users who
 * signed in through the other.
 */
export async function getSessionUser(): Promise<UserRow | null> {
  try {
    const sbUser = await getSupabaseUser();
    if (sbUser) {
      const row = await getDb().prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(sbUser.id);
      if (row) return row;
    }
  } catch {
    // Supabase env vars may not be set — fall through to the JWT cookie.
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return null;

  const row = await getDb().prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(payload.sub);
  return row ?? null;
}

/**
 * Guard a server-rendered page or layout: anonymous visitors are redirected to
 * /login with an exact return path.
 *
 * Authenticated pages here are client components that only learn about the
 * session after hydration. Without a server check they render the
 * authenticated shell (and kick off their own data fetches) first, so the
 * redirect happens too late to be a real access control boundary.
 *
 * The return path comes from the header stamped by `src/proxy.ts`. The proxy
 * always overwrites it, so a caller cannot smuggle in a target — and the login
 * page runs the value through `safeRedirectPath()` before navigating.
 */
export async function requirePageUser(fallbackPath = "/dashboard"): Promise<UserRow> {
  const user = await getSessionUser();
  if (user) return user;

  const pathname = (await headers()).get(PATHNAME_HEADER) ?? fallbackPath;
  redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
}
