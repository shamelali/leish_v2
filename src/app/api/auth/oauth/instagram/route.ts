import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/auth";

/**
 * Instagram Login via Facebook (Meta) — Instagram Login is a Facebook product.
 * Supabase handles the provider scoping; we just request the instagram scopes.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabase();

  const { searchParams } = new URL(request.url);
  const next = searchParams.get("next") ?? "/dashboard";

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "facebook",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: "email,public_profile,instagram_basic,instagram_manage_insights",
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message ?? "OAuth failed")}`, request.url),
    );
  }

  return NextResponse.redirect(data.url);
}
