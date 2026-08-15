import { createServerClient } from "@supabase/ssr";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";

/**
 * v1 postmortem: lib/supabase/server.ts used to return `null` silently when
 * env vars were missing, which turned into invisible 404s on artist profile
 * pages with no error anywhere. Fail loud instead — a misconfigured prod
 * deploy should break visibly at request time, not degrade silently.
 */
function assertEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "[supabase/server] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Check Vercel project env vars for this environment.",
    );
  }
  return { url, anonKey };
}

export async function createClient() {
  const { url, anonKey } = assertEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — middleware refreshes the
          // session instead. Safe to ignore.
        }
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS. Only use in trusted server contexts:
 * the Billplz webhook handler and admin server actions. Never import this
 * into anything that runs with user input in the same call path without
 * validating that input first.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("[supabase/server] Missing SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createRawClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
}
