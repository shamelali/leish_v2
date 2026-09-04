import { NextResponse } from "next/server";
import { getDb, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { claimArtistProfile, getClaimedProfile } from "@/server/artist-profiles";
import { getArtistById, updateArtist } from "@/server/catalog";
import { enforceSameOrigin, jsonError, readJson } from "@/server/http";
import { logger } from "@/server/logger";
import { z } from "zod";
import { isAgnostEnabled, agnost } from "@/server/agnost";

const claimSchema = z.object({
  artistId: z.string().min(1, "Select an artist profile"),
});

// Self-service editable fields (artists manage their own listing content).
const profileUpdateSchema = z
  .object({
    tagline: z.string().max(200).optional(),
    bio: z.string().max(4000).optional(),
    priceFrom: z.number().int().min(0).optional(),
    specialties: z.array(z.string().max(60)).max(20).optional(),
    availability: z.array(z.string().max(80)).max(50).optional(),
    portfolio: z.array(z.string().max(300)).max(50).optional(),
    services: z
      .array(
        z.object({
          name: z.string().min(1).max(120),
          price: z.number().int().min(0),
          duration: z.string().max(40),
        }),
      )
      .max(30)
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No updates provided" });

const ARTIST_ROLES = ["artist", "studio"] as const;

/** Require a valid session + user row; returns { user, payload } or error. */
async function requireUser(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return { error: jsonError("Not authenticated", 401) };

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    UserRow | undefined;
  if (!user) return { error: jsonError("Not authenticated", 401) };
  return { user, payload };
}

/**
 * GET /api/artist-profiles — the claiming user's profile (or null).
 * POST /api/artist-profiles — claim a catalog artist (artist/studio role).
 * PATCH /api/artist-profiles — self-service edit of the claimed profile.
 */
export async function GET(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return jsonError("Not authenticated", 401);

  const profile = await getClaimedProfile(payload.sub);
  if (!profile) return NextResponse.json({ profile: null });
  const artist = await getArtistById(profile.artist_id);
  return NextResponse.json({
    profile: artist ? { artistId: profile.artist_id, artistName: artist.name } : null,
  });
}

export async function POST(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;

  const { user, error } = await requireUser(request);
  if (error) return error;
  if (!ARTIST_ROLES.includes(user!.role as (typeof ARTIST_ROLES)[number])) {
    return jsonError("Only artist and studio accounts can claim a profile", 403);
  }
  // Claims are public-facing (an unverified account could impersonate a
  // catalog artist), so require a verified email — same gate as booking.
  if (!user!.email_verified) {
    return jsonError("Please verify your email before claiming a profile", 403);
  }

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;
  const parsed = claimSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  try {
    const profile = await claimArtistProfile(user!.id, parsed.data.artistId);
    const artist = await getArtistById(profile.artist_id);
    logger.info({ userId: user!.id, artistId: profile.artist_id }, "artist profile claimed");
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

export async function PATCH(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;

  const { user, error } = await requireUser(request);
  if (error) return error;

  const profile = await getClaimedProfile(user!.id);
  if (!profile) {
    return jsonError("Claim an artist profile before editing it", 409);
  }

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;
  const parsed = profileUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // Begin Agnost tracking.
  const interaction = isAgnostEnabled()
    ? agnost.begin({
        userId: user!.id,
        agentName: "artist-profile-update",
        input: JSON.stringify({ artistId: profile.artist_id, fields: Object.keys(parsed.data) }),
      })
    : null;

  try {
    const updated = await updateArtist(profile.artist_id, parsed.data);
    if (!updated) {
      interaction?.end("Artist not found", false);
      return jsonError("Artist not found", 404);
    }

    logger.info(
      { userId: user!.id, artistId: profile.artist_id, fields: Object.keys(parsed.data) },
      "artist self-update",
    );

    interaction?.end(
      JSON.stringify({ artistId: profile.artist_id, fields: Object.keys(parsed.data) }),
      true,
    );
    return NextResponse.json({ ok: true, artist: updated });
  } catch (err) {
    interaction?.end(err instanceof Error ? err.message : String(err), false);
    throw err;
  }
}
