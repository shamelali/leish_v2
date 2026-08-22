import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin, logAdminAction } from "@/server/admin-auth";
import { tryRoute, readJson, jsonError, statefulRoute } from "@/server/http";

interface SettingRow {
  key: string;
  value: string;
  updated_by: string | null;
  updated_at: string;
}

const DEFAULT_SETTINGS: Record<string, string> = {
  site_name: "Leish!",
  contact_email: "hello@leish.my",
  booking_fee_sen: "5000",
  commission_rate_bps: "1000",
  commission_waiver_sen: "10000",
  session_ttl_days: "7",
};

export const GET = tryRoute(
  async function GET(request: Request) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const db = getDb();
    const rows = (await db.prepare("SELECT * FROM platform_settings").all()) as SettingRow[];

    const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({ settings });
  },
  { route: "GET /api/admin/settings" },
);

export const PATCH = statefulRoute(
  async function PATCH(request: Request) {
    const { user, error } = await requireAdmin(request);
    if (error) return error;

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.error;

    const data = body.data as Record<string, string>;
    if (!data || typeof data !== "object") {
      return jsonError("Invalid settings data", 400);
    }

    const db = getDb();
    const now = new Date().toISOString();

    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== "string") continue;
      await db
        .prepare(
          `INSERT INTO platform_settings (key, value, updated_by, updated_at)
         VALUES (@key, @value, @updated_by, @updated_at)
         ON CONFLICT(key) DO UPDATE SET value = @value, updated_by = @updated_by, updated_at = @updated_at`,
        )
        .run({ key, value, updated_by: user!.id, updated_at: now });
    }

    await logAdminAction(user!.id, "update_settings", "platform_settings", null, {
      keys: Object.keys(data),
    });

    return NextResponse.json({ ok: true });
  },
  { route: "PATCH /api/admin/settings" },
);
