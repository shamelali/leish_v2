import { NextResponse } from "next/server";
import { getDb, bind } from "@/server/db";
import { requireAdmin, logAdminAction } from "@/server/admin-auth";
import { tryRoute, readJson, jsonError } from "@/server/http";
import { getArtist } from "@/lib/data";

interface OverrideRow {
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

function applyOverrides<T extends Record<string, unknown>>(base: T, overrides: OverrideRow[]): T {
  const merged = { ...base };
  for (const o of overrides) {
    try {
      (merged as Record<string, unknown>)[o.field] = JSON.parse(o.value);
    } catch {
      (merged as Record<string, unknown>)[o.field] = o.value;
    }
  }
  return merged;
}

export const GET = tryRoute(
  async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { error } = await requireAdmin(_request);
    if (error) return error;

    const { id } = await params;
    const base = getArtist(id);
    if (!base) return jsonError("Artist not found", 404);

    const db = getDb();

    const [overrides, profiles] = await Promise.all([
      db
        .prepare(
          `SELECT field, value FROM catalog_overrides
         WHERE entity_type = 'artist' AND entity_id = ?`,
        )
        .all<OverrideRow>(id),
      db
        .prepare(
          `SELECT ap.user_id, ap.artist_id, ap.claimed_at, u.name AS user_name, u.email AS user_email
         FROM artist_profiles ap
         JOIN users u ON u.id = ap.user_id
         WHERE ap.artist_id = ?`,
        )
        .all<ArtistProfileRow>(id),
    ]);

    const artist = applyOverrides(base as unknown as Record<string, unknown>, overrides);

    return NextResponse.json({ artist: { ...artist, claimedBy: profiles } });
  },
  { route: "GET /api/admin/artists/[id]" },
);

export const PATCH = tryRoute(
  async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { user, error } = await requireAdmin(request);
    if (error) return error;

    const { id } = await params;
    const base = getArtist(id);
    if (!base) return jsonError("Artist not found", 404);

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
      "verified",
      "yearsExperience",
    ]);

    const db = getDb();
    const now = new Date().toISOString();
    let changed = 0;

    for (const [field, value] of Object.entries(updates)) {
      if (!allowedFields.has(field)) continue;
      const serialized = typeof value === "string" ? value : JSON.stringify(value);

      await db
        .prepare(
          `INSERT INTO catalog_overrides (id, entity_type, entity_id, field, value, updated_by, created_at, updated_at)
         VALUES (@id, 'artist', @entity_id, @field, @value, @updated_by, @created_at, @updated_at)
         ON CONFLICT(entity_type, entity_id, field)
         DO UPDATE SET value = @value, updated_by = @updated_by, updated_at = @updated_at`,
        )
        .run(
          bind({
            id: crypto.randomUUID(),
            entity_id: id,
            field,
            value: serialized,
            updated_by: user.id,
            created_at: now,
            updated_at: now,
          }),
        );
      changed++;
    }

    if (changed > 0) {
      await logAdminAction(user.id, "catalog_override", "artists", id, {
        fields: Object.keys(updates).filter((f) => allowedFields.has(f)),
      });
    }

    return NextResponse.json({ ok: true, overridesApplied: changed });
  },
  { route: "PATCH /api/admin/artists/[id]" },
);
