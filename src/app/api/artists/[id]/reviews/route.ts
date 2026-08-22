import { NextResponse } from "next/server";
import { getDb, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import {
  addEntityReview,
  findReviewableBooking,
  getArtistById,
  listEntityReviews,
} from "@/server/catalog";
import { enforceSameOrigin, jsonError, readJson, tryRoute } from "@/server/http";
import { z } from "zod";

const reviewSchema = z.object({
  rating: z.number().int().min(1, "Rating must be 1–5").max(5, "Rating must be 1–5"),
  text: z.string().min(4, "Tell us a little about your experience").max(2000),
  event: z.string().max(120).optional(),
});

/** Require a valid session; returns { user } or a JSON error response. */
async function requireUser(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return { error: jsonError("Not authenticated", 401) };

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    UserRow | undefined;
  if (!user) return { error: jsonError("Not authenticated", 401) };
  return { user };
}

/**
 * GET /api/artists/[id]/reviews — public review list for an artist.
 */
export const GET = tryRoute(
  async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const reviews = await listEntityReviews("artist", id);
    return NextResponse.json({ reviews });
  },
  { route: "GET /api/artists/[id]/reviews" },
);

/**
 * POST /api/artists/[id]/reviews — leave a review. Gated on a COMPLETED
 * booking with this artist that hasn't been reviewed yet (one review per
 * booking). The entity's aggregate rating is blended incrementally.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const originBlocked = enforceSameOrigin(request);
  if (originBlocked) return originBlocked;

  const { user, error } = await requireUser(request);
  if (error) return error;

  const { id } = await ctx.params;
  const artist = await getArtistById(id);
  if (!artist) return jsonError("Artist not found", 404);

  const body = await readJson<unknown>(request);
  if (!body.ok) return body.error;
  const parsed = reviewSchema.safeParse(body.data);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  // Trust gate: only clients with a completed, not-yet-reviewed booking.
  const booking = await findReviewableBooking(user!.id, "artist", id);
  if (!booking) {
    return jsonError("You can only review artists after a completed booking with them.", 403);
  }

  try {
    const review = await addEntityReview({
      entityType: "artist",
      entityId: id,
      bookingId: booking.id,
      userId: user!.id,
      authorName: user!.name,
      rating: parsed.data.rating,
      event: parsed.data.event ?? null,
      text: parsed.data.text,
    });
    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_REVIEWED") {
      return jsonError("You have already reviewed this booking", 409);
    }
    throw err;
  }
}
