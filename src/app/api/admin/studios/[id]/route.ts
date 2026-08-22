import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/server/admin-auth";
import { tryRoute, readJson, jsonError } from "@/server/http";
import { getStudioById, updateStudio, listEntityReviews } from "@/server/catalog";

export const GET = tryRoute(
  async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const { id } = await params;
    const studio = await getStudioById(id);
    if (!studio) return jsonError("Studio not found", 404);

    const reviews = await listEntityReviews("studio", id);
    return NextResponse.json({ studio: { ...studio, reviews } });
  },
  { route: "GET /api/admin/studios/[id]" },
);

export const PATCH = tryRoute(
  async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { user, error } = await requireAdmin(request);
    if (error) return error;

    const { id } = await params;
    const existing = await getStudioById(id);
    if (!existing) return jsonError("Studio not found", 404);

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
    const appliedFields = Object.keys(updates).filter((f) => allowedFields.has(f));
    if (appliedFields.length === 0) return jsonError("No valid fields to update", 400);

    const updated = await updateStudio(
      id,
      Object.fromEntries(appliedFields.map((f) => [f, updates[f]])),
    );
    if (!updated) return jsonError("No valid fields to update", 400);

    await logAdminAction(user.id, "catalog_update", "studios", id, { fields: appliedFields });

    return NextResponse.json({ ok: true, studio: updated });
  },
  { route: "PATCH /api/admin/studios/[id]" },
);
