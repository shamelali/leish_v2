import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { tryRoute } from "@/server/http";
import { ARTISTS } from "@/lib/data";

interface OverrideRow {
  entity_id: string;
  field: string;
  value: string;
}

interface ArtistProfileRow {
  user_id: string;
  artist_id: string;
  claimed_at: string;
  user_name: string;
  user_email: string;
}

function applyOverrides<T extends Record<string, unknown>>(
  base: T,
  overrides: OverrideRow[],
): T {
  const merged = { ...base };
  for (const o of overrides) {
    if (o.entity_id !== base.id) continue;
    try {
      (merged as Record<string, unknown>)[o.field] = JSON.parse(o.value);
    } catch {
      (merged as Record<string, unknown>)[o.field] = o.value;
    }
  }
  return merged;
}

export const GET = tryRoute(async function GET(request: Request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const db = getDb();

  const [overrides, profiles] = await Promise.all([
    db
      .prepare(
        `SELECT entity_id, field, value FROM catalog_overrides WHERE entity_type = 'artist'`,
      )
      .all<OverrideRow>(),
    db
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

  const artists = ARTISTS.map((a) => {
    const merged = applyOverrides(a as unknown as Record<string, unknown>, overrides);
    return {
      ...merged,
      claimedBy: profilesByArtist.get(a.id) ?? [],
    };
  });

  return NextResponse.json({ artists });
}, { route: "GET /api/admin/artists" });
