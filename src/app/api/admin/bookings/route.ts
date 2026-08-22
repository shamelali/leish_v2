import { NextResponse } from "next/server";
import { getDb, type BookingRow } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { tryRoute } from "@/server/http";

export const GET = tryRoute(async function GET(request: Request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const db = getDb();
  const { searchParams } = new URL(request.url);

  const search = searchParams.get("search")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (search) {
    conditions.push("(b.artist_name ILIKE @search OR b.id LIKE @searchId)");
    params.search = `%${search}%`;
    params.searchId = `%${search}%`;
  }

  if (status && ["requested", "accepted", "confirmed", "cancelled", "completed"].includes(status)) {
    conditions.push("b.status = @status");
    params.status = status;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS total FROM bookings b ${where}`)
    .get<{ total: number }>(params);

  const bookings = await db
    .prepare(
      `SELECT b.id, b.user_id, b.artist_id, b.artist_name, b.service, b.price,
              b.date, b.time, b.status, b.event_type, b.venue, b.guest_count,
              b.created_at, u.name AS customer_name, u.email AS customer_email
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all<BookingRow & { customer_name: string; customer_email: string }>({
      ...params,
      limit,
      offset,
    });

  return NextResponse.json({
    bookings,
    total: countRow?.total ?? 0,
    limit,
    offset,
  });
}, { route: "GET /api/admin/bookings" });
