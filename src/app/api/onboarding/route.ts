import { NextResponse } from "next/server";
import { getDb, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { createArtist, createStudio } from "@/server/catalog";
import { claimArtistProfile } from "@/server/artist-profiles";
import { claimStudioProfile } from "@/server/studio-profiles";
import { jsonError, readJson } from "@/server/http";
import { z } from "zod";

const onboardSchema = z.object({
  type: z.enum(["artist", "studio"]),
  name: z.string().min(2).max(80),
  phone: z.string().max(30).optional(),
  state: z.string().min(1),
  area: z.string().min(1),
  specialties: z.array(z.string()).max(20).optional(),
  yearsExperience: z.number().int().min(0).max(60).optional(),
  portfolioUrl: z.string().url().optional().or(z.literal("")),
  about: z.string().max(4000).optional(),
  // studio-specific
  address: z.string().max(300).optional(),
  hours: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
});

export async function POST(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return jsonError("Not authenticated", 401);

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    UserRow | undefined;
  if (!user) return jsonError("Not authenticated", 401);

  if (user.role !== "artist" && user.role !== "studio") {
    return jsonError("Only artist and studio accounts can onboard", 403);
  }

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;
  const parsed = onboardSchema.safeParse(body.data);
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);

  const data = parsed.data;
  // Enforce role matches type
  if (data.type !== user.role) {
    return jsonError(`Your account role is ${user.role}, cannot onboard as ${data.type}`, 400);
  }

  try {
    if (data.type === "artist") {
      const artist = await createArtist({
        name: data.name,
        state: data.state,
        area: data.area,
        specialties: data.specialties,
        priceFrom: 0,
      });
      if (!artist) return jsonError("Failed to create artist profile", 500);

      // Auto-claim the newly created artist for this user.
      try {
        await claimArtistProfile(user.id, artist.id);
      } catch (e) {
        // If claim fails due to already claimed, still return the artist
        if (!(e instanceof Error && e.message === "ALREADY_CLAIMED")) throw e;
      }

      // Update the artist with additional fields that createArtist doesn't cover
      // (bio, portfolio, yearsExperience are via updateArtist whitelisted fields)
      const updates: Record<string, unknown> = {};
      if (data.about) updates.bio = data.about;
      if (data.portfolioUrl) updates.portfolio = [data.portfolioUrl];
      if (data.yearsExperience !== undefined) updates.yearsExperience = data.yearsExperience;
      if (Object.keys(updates).length > 0) {
        await (await import("@/server/catalog")).updateArtist(artist.id, updates);
      }

      return NextResponse.json({ ok: true, type: "artist", id: artist.id }, { status: 201 });
    } else {
      // studio
      const studio = await createStudio({
        name: data.name,
        state: data.state,
        area: data.area,
        address: data.address,
        hours: data.hours,
        phone: data.phone,
        priceFrom: 0,
      });
      if (!studio) return jsonError("Failed to create studio profile", 500);

      try {
        await claimStudioProfile(user.id, studio.id);
      } catch (e) {
        if (!(e instanceof Error && e.message === "ALREADY_CLAIMED")) throw e;
      }

      const updates: Record<string, unknown> = {};
      if (data.description) updates.description = data.description;
      if (data.about) updates.description = data.about;
      if (Object.keys(updates).length > 0) {
        await (await import("@/server/catalog")).updateStudio(studio.id, updates);
      }

      return NextResponse.json({ ok: true, type: "studio", id: studio.id }, { status: 201 });
    }
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_CLAIMED") {
      return jsonError("You have already claimed a profile", 409);
    }
    throw err;
  }
}
