import { NextResponse } from "next/server";
import { getDb, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import {
  claimStudioProfile,
  getClaimedStudioProfile,
  unclaimStudioProfile,
} from "@/server/studio-profiles";
import { getStudioById, updateStudio } from "@/server/catalog";
import { enforceSameOrigin, jsonError, readJson } from "@/server/http";
import { logger } from "@/server/logger";
import { z } from "zod";
import { isAgnostEnabled, agnost } from "@/server/agnost";

const claimSchema = z.object({
  studioId: z.string().min(1, "Select a studio profile"),
});

// Self-service editable fields for studio owners (subset of STUDIO_UPDATE_FIELDS).
const profileUpdateSchema = z
  .object({
    tagline: z.string().max(200).optional(),
    description: z.string().max(4000).optional(),
    address: z.string().max(300).optional(),
    priceFrom: z.number().int().min(0).optional(),
    hours: z.string().max(200).optional(),
    phone: z.string().max(30).optional(),
    services: z
      .array(z.string().max(120))
      .max(30)
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No updates provided" });

const STUDIO_ROLES = ["studio"] as const;

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
 * GET /api/studio-profiles — the claiming user's studio profile (or null).
 * POST /api/studio-profiles — claim a catalog studio (studio role).
 * PATCH /api/studio-profiles — self-service edit of the claimed studio.
 * DELETE /api/studio-profiles — unclaim the studio profile.
 */
export async function GET(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return jsonError("Not authenticated", 401);

  const profile = await getClaimedStudioProfile(payload.sub);
  if (!profile) return NextResponse.json({ profile: null });
  const studio = await getStudioById(profile.studio_id);
  return NextResponse.json({
    profile: studio ? { studioId: profile.studio_id, studioName: studio.name } : null,
  });
}

export async function POST(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;

  const { user, error } = await requireUser(request);
  if (error) return error;
  if (!STUDIO_ROLES.includes(user!.role as (typeof STUDIO_ROLES)[number])) {
    return jsonError("Only studio accounts can claim a studio profile", 403);
  }
  if (!user!.email_verified) {
    return jsonError("Please verify your email before claiming a profile", 403);
  }

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;
  const parsed = claimSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  try {
    const profile = await claimStudioProfile(user!.id, parsed.data.studioId);
    const studio = await getStudioById(profile.studio_id);
    logger.info({ userId: user!.id, studioId: profile.studio_id }, "studio profile claimed");
    return NextResponse.json(
      { profile: { studioId: profile.studio_id, studioName: studio?.name ?? profile.studio_id } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "STUDIO_NOT_FOUND") {
      return jsonError("Studio not found", 404);
    }
    if (err instanceof Error && err.message === "ALREADY_CLAIMED") {
      return jsonError("You have already claimed a studio profile", 409);
    }
    throw err;
  }
}

export async function PATCH(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;

  const { user, error } = await requireUser(request);
  if (error) return error;

  const profile = await getClaimedStudioProfile(user!.id);
  if (!profile) {
    return jsonError("Claim a studio profile before editing it", 409);
  }

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;
  const parsed = profileUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const interaction = isAgnostEnabled()
    ? agnost.begin({
        userId: user!.id,
        agentName: "studio-profile-update",
        input: JSON.stringify({ studioId: profile.studio_id, fields: Object.keys(parsed.data) }),
      })
    : null;

  try {
    const updated = await updateStudio(profile.studio_id, parsed.data);
    if (!updated) {
      interaction?.end("Studio not found", false);
      return jsonError("Studio not found", 404);
    }

    logger.info(
      { userId: user!.id, studioId: profile.studio_id, fields: Object.keys(parsed.data) },
      "studio self-update",
    );

    interaction?.end(JSON.stringify({ studioId: profile.studio_id, fields: Object.keys(parsed.data) }), true);
    return NextResponse.json({ ok: true, studio: updated });
  } catch (err) {
    interaction?.end(err instanceof Error ? err.message : String(err), false);
    throw err;
  }
}

export async function DELETE(request: Request) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;

  const { user, error } = await requireUser(request);
  if (error) return error;

  const profile = await getClaimedStudioProfile(user!.id);
  if (!profile) {
    return jsonError("No studio profile claimed", 404);
  }

  const ok = await unclaimStudioProfile(user!.id);
  if (!ok) return jsonError("No studio profile claimed", 404);

  logger.info({ userId: user!.id, studioId: profile.studio_id }, "studio profile unclaimed");
  return NextResponse.json({ ok: true });
}
