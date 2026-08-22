import { NextResponse } from "next/server";
import { listAllArtists } from "@/server/catalog";

/**
 * Full public catalog for client-side consumers (dashboard booking form,
 * browse hydration). Cached at the edge; the catalog changes rarely.
 */
export async function GET() {
  const artists = await listAllArtists();
  return NextResponse.json(
    { count: artists.length, artists },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } },
  );
}
