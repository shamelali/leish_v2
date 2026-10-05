import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/auth";

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();

    const { searchParams, origin } = new URL(request.url);
    const next = searchParams.get("next") ?? "/dashboard";

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? origin;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error || !data.url) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error?.message ?? "OAuth failed")}`,
      );
    }

    return NextResponse.redirect(data.url);
  } catch (err) {
    // TEMPORARY prod debug — remove once root-caused
    return NextResponse.json(
      { debug: err instanceof Error ? `${err.name}: ${err.message}` : String(err) },
      { status: 500 },
    );
  }
}
