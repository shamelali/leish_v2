import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { tryRoute } from "@/server/http";

export const GET = tryRoute(
  async function GET(request: Request) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get("bookingId")?.trim() ?? "";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 200);
    const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

    const db = getDb();
    const conditions: string[] = [];
    const params: Record<string, string | number> = {};

    if (bookingId) {
      conditions.push("m.booking_id = @bookingId");
      params.bookingId = bookingId;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    interface CountRow {
      total: number;
    }

    const [rows, countRow] = await Promise.all([
      db
        .prepare(
          `SELECT m.id, m.booking_id, m.sender_id, m.body, m.created_at,
                b.artist_name, b.service, u.name AS sender_name, u.email AS sender_email
         FROM messages m
         LEFT JOIN bookings b ON b.id = m.booking_id
         LEFT JOIN users u ON u.id = m.sender_id
         ${where}
         ORDER BY m.created_at DESC
         LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit, offset }),
      db.prepare(`SELECT COUNT(*) AS total FROM messages m ${where}`).get<CountRow>(params),
    ]);

    return NextResponse.json({
      messages: rows,
      total: countRow?.total ?? 0,
      limit,
      offset,
    });
  },
  { route: "GET /api/admin/messages" },
);
