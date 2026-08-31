import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/auth";

/**
 * Instagram Login via Facebook (Meta) — Instagram Login is a Facebook product.
 * Supabase handles the provider scoping; we request standard Facebook Login scopes.
 *
 * Note: Instagram Graph API permissions (instagram_basic, instagram_manage_insights)
 * must be configured in the Facebook App Dashboard under Instagram Graph API product,
 * not in the OAuth scopes parameter.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabase();

  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/dashboard";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? origin;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "facebook",
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: "email,public_profile",
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message ?? "OAuth failed")}`,
    );
  }

  return NextResponse.redirect(data.url);
}
