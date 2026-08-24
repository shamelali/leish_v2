import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { statefulRoute, tryRoute, readJson, jsonError } from "@/server/http";
import { listAllArtists, createArtist } from "@/server/catalog";

import { z } from "zod";
import { logAdminAction } from "@/server/admin-auth";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().max(80).optional(),
  tagline: z.string().trim().max(200).optional(),
  bio: z.string().trim().max(4000).optional(),
  state: z.string().trim().max(60).optional(),
  area: z.string().trim().max(80).optional(),
  priceFrom: z.coerce.number().int().min(0).max(10_000_000).optional(),
  specialties: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  services: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        price: z.coerce.number().int().min(0),
        duration: z.string().trim().max(40),
      }),
    )
    .max(20)
    .optional(),
});

export const POST = statefulRoute(
  async function POST(request: Request) {
    const { user, error } = await requireAdmin(request);
    if (error) return error;

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.error;
    const parsed = createSchema.safeParse(body.data);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid artist data", 400);
    }

    const created = await createArtist(parsed.data);
    if (!created) return jsonError("Failed to create artist", 500);

    await logAdminAction(user.id, "artist.create", "artists", created.id, {
      name: created.name,
      slug: created.id,
    });

    return NextResponse.json({ artist: created }, { status: 201 });
  },
  { route: "POST /api/admin/artists" },
);

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
