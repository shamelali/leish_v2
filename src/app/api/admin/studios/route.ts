import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { tryRoute } from "@/server/http";
import { STUDIOS } from "@/lib/data";

interface OverrideRow {
  entity_id: string;
  field: string;
  value: string;
}

function applyOverrides<T extends Record<string, unknown>>(base: T, overrides: OverrideRow[]): T {
  const merged = { ...base };
  for (const o of overrides) {
    if (o.entity_id !== base.id) continue;
    try {
      (merged as Record<string, unknown>)[o.field] = JSON.parse(o.value);
    } catch {
      (merged as Record<string, unknown>)[o.field] = o.value;
    }
  }
  return merged;
}

export const GET = tryRoute(
  async function GET(request: Request) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const db = getDb();

    const overrides = await db
      .prepare(`SELECT entity_id, field, value FROM catalog_overrides WHERE entity_type = 'studio'`)
      .all<OverrideRow>();

    const studios = STUDIOS.map((s) =>
      applyOverrides(s as unknown as Record<string, unknown>, overrides),
    );

    return NextResponse.json({ studios });
  },
  { route: "GET /api/admin/studios" },
);
