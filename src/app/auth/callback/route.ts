import { NextResponse } from "next/server";
import {
  createServerSupabase,
  findUserBySupabaseId,
  findUserByEmail,
  createOAuthUser,
} from "@/lib/supabase/auth";
import { logger } from "@/server/logger";

/**
 * Supabase Auth OAuth callback route.
 *
 * Flow:
 * 1. Supabase redirects here with `code` + `next` query params
 * 2. We exchange the code for a Supabase session (sets sb cookies)
 * 3. We find or create the local user linked to this Supabase auth user
 * 4. Redirect to the `next` destination (default: /dashboard)
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Validate next param to prevent open redirects
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (code) {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logger.error(
        { error: error.message },
        "[auth/callback] code exchange failed",
      );
      return NextResponse.redirect(
        `${origin}/login?error=oauth_exchange_failed`,
      );
    }

    if (data.user) {
      try {
        // Check if a local user already exists with this supabase_id
        let localUser = await findUserBySupabaseId(data.user.id);

        if (!localUser) {
          // Try matching by email (user may have registered via email/password)
          const email = data.user.email ?? "";
          localUser = await findUserByEmail(email);

          if (localUser) {
            // Link existing account to Supabase
            const { linkSupabaseToUser } = await import("@/lib/supabase/auth");
            await linkSupabaseToUser(data.user.id, localUser.id);
          } else {
            // Create a new local user
            const name =
              data.user.user_metadata?.full_name ??
              data.user.user_metadata?.name ??
              email.split("@")[0] ??
              "User";
            localUser = await createOAuthUser(data.user.id, email, name);
          }
        }
      } catch (err) {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          "[auth/callback] failed to link/create OAuth user",
        );
        // Still redirect — Supabase session is set, user can try again
      }
    }
  } else {
    // No code provided — redirect to login with error
    return NextResponse.redirect(`${origin}/login?error=oauth_no_code`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
