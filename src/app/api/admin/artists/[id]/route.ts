import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin, logAdminAction } from "@/server/admin-auth";
import { jsonError, readJson, statefulRoute, tryRoute } from "@/server/http";
import { getArtistById, updateArtist, deleteArtist, listEntityReviews } from "@/server/catalog";

interface ArtistProfileRow {
  user_id: string;
  artist_id: string;
  claimed_at: string;
  user_name: string;
  user_email: string;
}

export const GET = tryRoute(
  async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const { id } = await params;
    const artist = await getArtistById(id);
    if (!artist) return jsonError("Artist not found", 404);

    const [reviews, profiles] = await Promise.all([
      listEntityReviews("artist", id),
      getDb()
        .prepare(
          `SELECT ap.user_id, ap.artist_id, ap.claimed_at, u.name AS user_name, u.email AS user_email
         FROM artist_profiles ap
         JOIN users u ON u.id = ap.user_id
         WHERE ap.artist_id = ?`,
        )
        .all<ArtistProfileRow>(id),
    ]);

    return NextResponse.json({ artist: { ...artist, reviews, claimedBy: profiles } });
  },
  { route: "GET /api/admin/artists/[id]" },
);

export const PATCH = statefulRoute(
  async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { user, error } = await requireAdmin(request);
    if (error) return error;

    const { id } = await params;
    const existing = await getArtistById(id);
    if (!existing) return jsonError("Artist not found", 404);

    const body = await readJson<Record<string, unknown>>(request);
    if (!body.ok) return body.error;
    const updates = body.data;

    const allowedFields = new Set([
      "name",
      "tagline",
      "bio",
      "image",
      "state",
      "area",
      "priceFrom",
      "specialties",
      "services",
      "bridal",
      "nonBridal",
      "availability",
      "verified",
      "yearsExperience",
    ]);
    const appliedFields = Object.keys(updates).filter((f) => allowedFields.has(f));
    if (appliedFields.length === 0) return jsonError("No valid fields to update", 400);

    const updated = await updateArtist(
      id,
      Object.fromEntries(appliedFields.map((f) => [f, updates[f]])),
    );
    if (!updated) return jsonError("No valid fields to update", 400);

    await logAdminAction(user.id, "catalog_update", "artists", id, { fields: appliedFields });

    return NextResponse.json({ ok: true, artist: updated });
  },
  { route: "PATCH /api/admin/artists/[id]" },
);

export const DELETE = statefulRoute(
  async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { user, error } = await requireAdmin(request);
    if (error) return error;

    const { id } = await params;
    const existing = await getArtistById(id);
    if (!existing) return jsonError("Artist not found", 404);

    // Hard deletes leave dangling bookings/reviews (no FK), so refuse when
    // the profile is referenced. Delete is for erroneous/duplicate listings.
    const db = getDb();
    const bookingCount = (await db
      .prepare("SELECT COUNT(*) AS n FROM bookings WHERE artist_id = ?")
      .get<{ n: number }>(id))?.n;
    if (bookingCount) {
      return jsonError(`Cannot delete: artist has ${bookingCount} booking(s)`, 409);
    }
    const claimCount = (await db
      .prepare("SELECT COUNT(*) AS n FROM artist_profiles WHERE artist_id = ?")
      .get<{ n: number }>(id))?.n;
    if (claimCount) {
      return jsonError("Cannot delete: artist profile is claimed by a user", 409);
    }
    const reviewCount = (await db
      .prepare("SELECT COUNT(*) AS n FROM reviews WHERE entity_type = 'artist' AND entity_id = ?")
      .get<{ n: number }>(id))?.n;
    if (reviewCount) {
      return jsonError(`Cannot delete: artist has ${reviewCount} review(s)`, 409);
    }

    const ok = await deleteArtist(id);
    if (!ok) return jsonError("Artist not found", 404);

    await logAdminAction(user.id, "catalog_delete", "artists", id, { name: existing.name }, { requireAudit: true });

    return NextResponse.json({ ok: true });
  },
  { route: "DELETE /api/admin/artists/[id]" },
);
