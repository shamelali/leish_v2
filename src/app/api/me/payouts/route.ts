import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { jsonError, tryRoute } from "@/server/http";

interface PayoutJoinRow {
  id: string;
  booking_id: string;
  gross_sen: number;
  commission_sen: number;
  net_sen: number;
  status: "pending" | "settled" | "failed";
  settleable_at: string | null;
  settled_at: string | null;
  notes: string | null;
  created_at: string;
  artist_name: string | null;
  service: string;
  event_date: string;
}

/**
 * GET /api/me/payouts
 * Artist/studio-facing payout list — every payout linked to a catalog
 * profile this user has claimed. Customers get an empty list.
 */
export const GET = tryRoute(
  async function GET(request: Request) {
    const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
    const payload = token ? await verifySessionToken(token) : null;
    if (!payload) return jsonError("Not authenticated", 401);

    const db = await getDb();
    const user = (await db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
      | { id: string }
      | undefined;
    if (!user) return jsonError("Not authenticated", 401);

    const rows = (await db
      .prepare(
        `SELECT p.id, p.booking_id, p.gross_sen, p.commission_sen, p.net_sen, p.status,
                p.settleable_at, p.settled_at, p.notes, p.created_at,
                b.artist_name, b.service, b.date AS event_date
         FROM payouts p JOIN bookings b ON b.id = p.booking_id
         WHERE p.artist_user_id = ?
         ORDER BY p.created_at DESC`,
      )
      .all(user.id)) as unknown as PayoutJoinRow[];

    return NextResponse.json({
      payouts: rows.map((p) => ({
        id: p.id,
        bookingId: p.booking_id,
        artistName: p.artist_name,
        service: p.service,
        eventDate: p.event_date,
        grossSen: p.gross_sen,
        commissionSen: p.commission_sen,
        netSen: p.net_sen,
        status: p.status,
        settleableAt: p.settleable_at,
        settledAt: p.settled_at,
        notes: p.notes,
        createdAt: p.created_at,
      })),
    });
  },
  { route: "GET /api/me/payouts" },
);
