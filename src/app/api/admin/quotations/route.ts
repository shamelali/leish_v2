import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { tryRoute } from "@/server/http";

export const GET = tryRoute(async function GET(request: Request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (status && ["pending", "paid", "expired", "superseded"].includes(status)) {
    conditions.push("q.status = @status");
    params.status = status;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  interface CountRow {
    total: number;
  }

  const [rows, countRow] = await Promise.all([
    db
      .prepare(
        `SELECT q.id, q.booking_id, q.base_fee, q.travel_fee, q.early_call_fee,
                q.accommodation_fee, q.extras, q.artist_note, q.total, q.status,
                q.created_at, q.expires_at,
                b.artist_name, b.service, u.name AS customer_name
         FROM quotations q
         LEFT JOIN bookings b ON b.id = q.booking_id
         LEFT JOIN users u ON u.id = b.user_id
         ${where}
         ORDER BY q.created_at DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all({ ...params, limit, offset }),
    db
      .prepare(`SELECT COUNT(*) AS total FROM quotations q ${where}`)
      .get<CountRow>(params),
  ]);

  return NextResponse.json({
    quotations: rows,
    total: countRow?.total ?? 0,
    limit,
    offset,
  });
}, { route: "GET /api/admin/quotations" });
