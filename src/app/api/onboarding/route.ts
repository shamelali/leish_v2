import { NextResponse } from "next/server";
import { getDb, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { createArtist, createStudio, deleteArtist, deleteStudio } from "@/server/catalog";
import { claimArtistProfile, getClaimedProfile } from "@/server/artist-profiles";
import { claimStudioProfile, getClaimedStudioProfile } from "@/server/studio-profiles";
import { enforceRateLimit, jsonError, readJson, statefulRoute } from "@/server/http";
import { logger } from "@/server/logger";
import { reportError } from "@/server/errors";
import { z } from "zod";

/**
 * POST /api/onboarding — self-service "apply as an artist / studio".
 *
 * Creates a brand-new catalog profile and claims it for the signed-in
 * account in one step. The claim is the part that matters: a profile with no
 * claim is a public listing that nobody can manage, so every path below is
 * arranged so we never end a request with a created-but-unclaimed row.
 *
 *   1. Cheap pre-check: if the account already has a claim, reply 409 before
 *      touching the catalog. This is the normal "submitted twice" case.
 *   2. Create the profile, then claim it. If the claim still fails (a race
 *      between two concurrent submissions from the same account), delete the
 *      profile we just created and reply 409 — do not swallow the error and
 *      return 201 as the previous version did.
 *   3. If the rollback itself fails, alert via reportError so the orphan is
 *      cleaned up by hand rather than discovered by a customer.
 *
 * Profiles are created with `verified = 0` and are visible in the public
 * catalog immediately; the Verified badge is what admins grant after review.
 * There is no hidden "pending" state — the success page copy must say so.
 */

const onboardSchema = z.object({
  type: z.enum(["artist", "studio"]),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).optional(),
  state: z.string().trim().min(1),
  area: z.string().trim().min(1),
  // Starting price in RM. Optional at the API level for compatibility, but
  // the form requires it: a 0 here renders as "From RM0" on the card and
  // matches every budget filter in search.
  priceFrom: z.number().int().min(0).max(10_000_000).optional(),
  specialties: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  yearsExperience: z.number().int().min(0).max(60).optional(),
  portfolioUrl: z.string().trim().url().max(300).optional().or(z.literal("")),
  about: z.string().trim().max(4000).optional(),
  // studio-specific
  address: z.string().trim().max(300).optional(),
  hours: z.string().trim().max(200).optional(),
  description: z.string().trim().max(4000).optional(),
});

const ROUTE = "POST /api/onboarding";

/** Require a valid session + user row; returns { user } or { error }. */
async function requireUser(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return { error: jsonError("Not authenticated", 401) };

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    UserRow | undefined;
  if (!user) return { error: jsonError("Not authenticated", 401) };
  return { user };
}

function alreadyClaimed(err: unknown): boolean {
  return err instanceof Error && err.message === "ALREADY_CLAIMED";
}

export const POST = statefulRoute(
  async function POST(request: Request) {
    // Each successful call creates a public catalog row, so throttle harder
    // than the generic auth limiter — a legitimate applicant needs one.
    const limited = await enforceRateLimit(request, { limit: 5, windowMs: 60_000 });
    if (limited) return limited;

    const { user, error } = await requireUser(request);
    if (error) return error;

    if (user!.role !== "artist" && user!.role !== "studio") {
      return jsonError("Only artist and studio accounts can onboard", 403);
    }

    // Same trust gate as POST /api/artist-profiles and /api/studio-profiles:
    // the result is a public listing under the applicant's name, so we want a
    // verified mailbox behind it. The dashboard already surfaces the resend
    // flow for unverified accounts.
    if (!user!.email_verified) {
      return jsonError("Please verify your email before submitting your application", 403);
    }

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.error;
    const parsed = onboardSchema.safeParse(body.data);
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

    const data = parsed.data;
    if (data.type !== user!.role) {
      return jsonError(`Your account role is ${user!.role}, cannot onboard as ${data.type}`, 400);
    }

    if (data.type === "artist") {
      // Pre-check so the common double-submit never creates a second profile.
      const existing = await getClaimedProfile(user!.id);
      if (existing) {
        return NextResponse.json(
          { error: "You have already claimed an artist profile", id: existing.artist_id },
          { status: 409 },
        );
      }

      const artist = await createArtist({
        name: data.name,
        bio: data.about,
        state: data.state,
        area: data.area,
        specialties: data.specialties,
        yearsExperience: data.yearsExperience,
        portfolio: data.portfolioUrl ? [data.portfolioUrl] : undefined,
        priceFrom: data.priceFrom ?? 0,
      });
      if (!artist) return jsonError("Failed to create artist profile", 500);

      try {
        await claimArtistProfile(user!.id, artist.id);
      } catch (err) {
        if (!alreadyClaimed(err)) {
          await rollbackArtist(artist.id, user!.id, "claim threw");
          throw err;
        }
        // Lost a race with a concurrent submission from the same account.
        // The other request owns the claim; this profile must not survive.
        await rollbackArtist(artist.id, user!.id, "lost claim race");
        const winner = await getClaimedProfile(user!.id);
        return NextResponse.json(
          { error: "You have already claimed an artist profile", id: winner?.artist_id },
          { status: 409 },
        );
      }

      logger.info({ userId: user!.id, artistId: artist.id }, "artist onboarded and claimed");
      return NextResponse.json(
        { ok: true, type: "artist", id: artist.id, slug: artist.slug ?? artist.id },
        { status: 201 },
      );
    }

    // studio
    const existing = await getClaimedStudioProfile(user!.id);
    if (existing) {
      return NextResponse.json(
        { error: "You have already claimed a studio profile", id: existing.studio_id },
        { status: 409 },
      );
    }

    const studio = await createStudio({
      name: data.name,
      // The form posts the same text as both `about` and `description`;
      // prefer the studio-specific field when present.
      description: data.description || data.about,
      state: data.state,
      area: data.area,
      address: data.address,
      hours: data.hours,
      phone: data.phone,
      priceFrom: data.priceFrom ?? 0,
    });
    if (!studio) return jsonError("Failed to create studio profile", 500);

    try {
      await claimStudioProfile(user!.id, studio.id);
    } catch (err) {
      if (!alreadyClaimed(err)) {
        await rollbackStudio(studio.id, user!.id, "claim threw");
        throw err;
      }
      await rollbackStudio(studio.id, user!.id, "lost claim race");
      const winner = await getClaimedStudioProfile(user!.id);
      return NextResponse.json(
        { error: "You have already claimed a studio profile", id: winner?.studio_id },
        { status: 409 },
      );
    }

    logger.info({ userId: user!.id, studioId: studio.id }, "studio onboarded and claimed");
    return NextResponse.json(
      { ok: true, type: "studio", id: studio.id, slug: studio.slug ?? studio.id },
      { status: 201 },
    );
  },
  { route: ROUTE },
);

/**
 * Undo a profile insert whose claim did not land. A failed rollback is the
 * one outcome that leaves an orphaned public listing, so it is reported
 * loudly rather than logged and forgotten.
 */
async function rollbackArtist(artistId: string, userId: string, reason: string): Promise<void> {
  try {
    const removed = await deleteArtist(artistId);
    if (!removed) throw new Error("deleteArtist reported no rows removed");
    logger.warn({ userId, artistId, reason }, "onboarding: rolled back unclaimed artist");
  } catch (err) {
    await reportError(err, {
      route: ROUTE,
      userId,
      metadata: { reason: "orphaned_artist_profile", artistId, cause: reason },
    });
  }
}

async function rollbackStudio(studioId: string, userId: string, reason: string): Promise<void> {
  try {
    const removed = await deleteStudio(studioId);
    if (!removed) throw new Error("deleteStudio reported no rows removed");
    logger.warn({ userId, studioId, reason }, "onboarding: rolled back unclaimed studio");
  } catch (err) {
    await reportError(err, {
      route: ROUTE,
      userId,
      metadata: { reason: "orphaned_studio_profile", studioId, cause: reason },
    });
  }
}
