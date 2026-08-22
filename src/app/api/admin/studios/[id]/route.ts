import { NextResponse } from "next/server";
import { getDb, bind } from "@/server/db";
import { requireAdmin, logAdminAction } from "@/server/admin-auth";
import { tryRoute, readJson, jsonError } from "@/server/http";
import { getStudio } from "@/lib/data";

interface OverrideRow {
  field: string;
  value: string;
}

function applyOverrides<T extends Record<string, unknown>>(
  base: T,
  overrides: OverrideRow[],
): T {
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

export const GET = tryRoute(async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(_request);
  if (error) return error;

  const { id } = await params;
  const base = getStudio(id);
  if (!base) return jsonError("Studio not found", 404);

  const db = getDb();

  const overrides = await db
    .prepare(
      `SELECT field, value FROM catalog_overrides
       WHERE entity_type = 'studio' AND entity_id = ?`,
    )
    .all<OverrideRow>(id);

  const studio = applyOverrides(base as unknown as Record<string, unknown>, overrides);

  return NextResponse.json({ studio });
}, { route: "GET /api/admin/studios/[id]" });

export const PATCH = tryRoute(async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const { id } = await params;
  const base = getStudio(id);
  if (!base) return jsonError("Studio not found", 404);

  const body = await readJson<Record<string, unknown>>(request);
  if (!body.ok) return body.error;
  const updates = body.data;

  const allowedFields = new Set([
    "name",
    "tagline",
    "description",
    "image",
    "state",
    "area",
    "address",
    "services",
    "priceFrom",
    "hours",
    "phone",
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
         VALUES (@id, 'studio', @entity_id, @field, @value, @updated_by, @created_at, @updated_at)
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
    await logAdminAction(user.id, "catalog_override", "studios", id, {
      fields: Object.keys(updates).filter((f) => allowedFields.has(f)),
    });
  }

  return NextResponse.json({ ok: true, overridesApplied: changed });
}, { route: "PATCH /api/admin/studios/[id]" });
