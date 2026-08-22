import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { tryRoute } from "@/server/http";
import { listAllArtists } from "@/server/catalog";

interface ArtistProfileRow {
  user_id: string;
  artist_id: string;
  claimed_at: string;
  user_name: string;
  user_email: string;
}

export const GET = tryRoute(
  async function GET(request: Request) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const [artists, profiles] = await Promise.all([
      listAllArtists(),
      getDb()
        .prepare(
          `SELECT ap.user_id, ap.artist_id, ap.claimed_at, u.name AS user_name, u.email AS user_email
         FROM artist_profiles ap
         JOIN users u ON u.id = ap.user_id`,
        )
        .all<ArtistProfileRow>(),
    ]);

    const profilesByArtist = new Map<string, ArtistProfileRow[]>();
    for (const p of profiles) {
      const list = profilesByArtist.get(p.artist_id) ?? [];
      list.push(p);
      profilesByArtist.set(p.artist_id, list);
    }

    return NextResponse.json({
      artists: artists.map((a) => ({ ...a, claimedBy: profilesByArtist.get(a.id) ?? [] })),
    });
  },
  { route: "GET /api/admin/artists" },
);
