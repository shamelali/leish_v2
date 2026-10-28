import { NextResponse } from "next/server";
import { countArtists, listAllArtists } from "@/server/catalog";
import { paginationHeaders, paginationMeta, parsePagination } from "@/lib/pagination";

/**
 * Paginated public catalog for client-side consumers (dashboard booking form,
 * browse hydration). Cached at the edge; the catalog changes rarely.
 *
 * Query params: `?limit=50&offset=0` (limit clamped to 1..100, default 50).
 * Response: `{ count, total, artists, pagination }` plus `X-Total-Count`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const { limit, offset } = parsePagination(url.searchParams, {
    defaultLimit: 50,
    maxLimit: 100,
  });

  const [artists, total] = await Promise.all([listAllArtists({ limit, offset }), countArtists()]);

  return NextResponse.json(
    {
      count: artists.length,
      total,
      artists,
      pagination: paginationMeta(total, { limit, offset }, artists.length),
    },
    {
      headers: paginationHeaders(total, {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      }),
    },
  );
}
