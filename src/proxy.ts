import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { getArtist } from "@/lib/data";

/**
 * Catalog-driven 404 for artist slugs. The page itself can't guarantee the
 * HTTP status (the root layout streams the shell before notFound() runs,
 * which commits a 200), so unknown `/artists/<slug>` paths are short-
 * circuited here: a rewrite to a route that doesn't exist renders the
 * global not-found UI with a true 404.
 */
const ARTIST_SLUG = /^\/artists\/([^/]+)$/;

export async function proxy(request: NextRequest) {
  const match = request.nextUrl.pathname.match(ARTIST_SLUG);
  if (match && !getArtist(match[1])) {
    return NextResponse.rewrite(new URL("/_leish/artist-not-found", request.url));
  }
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
