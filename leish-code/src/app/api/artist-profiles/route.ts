import { NextResponse } from "next/server";
import { getDb, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { claimArtistProfile, getClaimedProfile } from "@/server/artist-profiles";
import { getArtist } from "@/lib/data";
import { enforceSameOrigin, jsonError, readJson } from "@/server/http";
import { logger } from "@/server/logger";
import { z } from "zod";

const claimSchema = z.object({
  artistId: z.string().min(1, "Select an artist profile"),
});

const ARTIST_ROLES = ["artist", "studio"] as const;

/**
 * GET /api/artist-profiles — the claiming user's profile (or null).
 * POST /api/artist-profiles — claim a catalog artist (artist/studio role).
 */
export async function GET(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return jsonError("Not authenticated", 401);

  const profile = await getClaimedProfile(payload.sub);
  if (!profile) return NextResponse.json({ profile: null });
  const artist = getArtist(profile.artist_id);
  return NextResponse.json({
    profile: artist ? { artistId: profile.artist_id, artistName: artist.name } : null,
  });
}

export async function POST(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return jsonError("Not authenticated", 401);

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    UserRow | undefined;
  if (!user) return jsonError("Not authenticated", 401);
  if (!ARTIST_ROLES.includes(user.role as (typeof ARTIST_ROLES)[number])) {
    return jsonError("Only artist and studio accounts can claim a profile", 403);
  }

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;
  const parsed = claimSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  try {
    const profile = await claimArtistProfile(user.id, parsed.data.artistId);
    const artist = getArtist(profile.artist_id);
    logger.info({ userId: user.id, artistId: profile.artist_id }, "artist profile claimed");
    return NextResponse.json(
      { profile: { artistId: profile.artist_id, artistName: artist?.name ?? profile.artist_id } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "ARTIST_NOT_FOUND") {
      return jsonError("Artist not found", 404);
    }
    if (err instanceof Error && err.message === "ALREADY_CLAIMED") {
      return jsonError("You have already claimed an artist profile", 409);
    }
    throw err;
  }
}
