import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getDb, toPublicUser, type UserRow } from "@/server/db";
import type { User } from "@/lib/types";

/**
 * Check for a Supabase Auth session via cookies, then look up the
 * corresponding user in our `users` table (matched by `supabase_id`).
 *
 * Returns `null` if no Supabase session or no linked user.
 */
export async function getSupabaseUser(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user: sbUser },
  } = await supabase.auth.getUser();

  if (!sbUser) return null;

  const row = (await getDb()
    .prepare("SELECT * FROM users WHERE supabase_id = ?")
    .get(sbUser.id)) as UserRow | undefined;

  if (!row) return null;
  return toPublicUser(row);
}

/**
 * Link a Supabase auth user to an existing `users` row.
 * Sets the `supabase_id` column so future OAuth logins find the account.
 */
export async function linkSupabaseToUser(supabaseUserId: string, localUserId: string) {
  await getDb()
    .prepare("UPDATE users SET supabase_id = ? WHERE id = ?")
    .run(supabaseUserId, localUserId);
}

/**
 * Find a local user by their Supabase auth user id.
 */
export async function findUserBySupabaseId(supabaseUserId: string): Promise<UserRow | undefined> {
  return getDb()
    .prepare("SELECT * FROM users WHERE supabase_id = ?")
    .get(supabaseUserId) as Promise<UserRow | undefined>;
}

/**
 * Find a local user by email.
 */
export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email) as Promise<UserRow | undefined>;
}

/**
 * Create a new local user from an OAuth provider's user info.
 */
export async function createOAuthUser(
  supabaseUserId: string,
  email: string,
  name: string,
): Promise<UserRow> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDb()
    .prepare(
      `INSERT INTO users (id, email, name, role, password, supabase_id, email_verified, consent, created_at)
       VALUES (?, ?, ?, 'customer', '', ?, 1, 1, ?)`,
    )
    .run(id, email, name, supabaseUserId, now);

  return getDb()
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as Promise<UserRow>;
}

/**
 * Build a Supabase server client that can read/write cookies in a
 * Next.js App Router Route Handler or Server Component.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll from a Server Component — safe to ignore if middleware
            // refreshes sessions.
          }
        },
      },
    },
  );
}
