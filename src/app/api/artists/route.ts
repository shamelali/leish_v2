import { NextResponse } from "next/server";
import { ARTISTS } from "@/lib/data";
import { filterArtists, type ArtistFilters } from "@/lib/artists";
import { artistsQuerySchema } from "@/server/validation";

/**
 * Public catalog API with the same filtering used by the browse page.
 * Query params mirror the client filter state, validated with zod.
 * Pages still import the catalog directly for speed; this endpoint is the
 * contract for future consumers (mobile app, partner integrations).
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = artistsQuerySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const { query, state, area, bridal, nonBridal, budget } = parsed.data;
  const filters: ArtistFilters = {
    query,
    state: state ?? "",
    area: area ?? "",
    date: "",
    customDate: "",
    bridal: bridal ?? "any",
    nonBridal: nonBridal ?? "any",
    budget: budget ?? 0,
  };

  const artists = filterArtists(ARTISTS, filters).map((a) => ({
    id: a.id,
    name: a.name,
    tagline: a.tagline,
    rating: a.rating,
    reviewCount: a.reviewCount,
    state: a.state,
    area: a.area,
    priceFrom: a.priceFrom,
    specialties: a.specialties,
    verified: a.verified,
  }));

  // Public catalog: cache at the CDN/edge for 5 minutes, revalidate in
  // background — the data changes rarely (onboarding only).
  return NextResponse.json(
    { count: artists.length, artists },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" } },
  );
}
