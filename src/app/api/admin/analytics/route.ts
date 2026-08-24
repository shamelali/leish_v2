import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { tryRoute } from "@/server/http";

/**
 * GET /api/admin/analytics
 * Aggregated platform metrics for the admin analytics page.
 *
 * All date bucketing uses substr(created_at, 1, 7) — created_at columns are
 * ISO-8601 TEXT on both backends, so this works identically on SQLite and
 * PostgreSQL without dialect-specific date functions.
 */

interface MonthRow {
  month: string;
  count: number;
}

interface ArtistRevenueRow {
  artist_id: string;
  artist_name: string;
  bookings: number;
  revenue_sen: number;
}

export const GET = tryRoute(async function GET(request: Request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const db = getDb();

  const [bookingsByMonth, signupsByMonth, revenueByMonth, bookingsByStatus, topArtists, totals] =
    await Promise.all([
      db
        .prepare(
          `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS count
           FROM bookings GROUP BY month ORDER BY month DESC LIMIT 12`,
        )
        .all<MonthRow>(),
      db
        .prepare(
          `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS count
           FROM users GROUP BY month ORDER BY month DESC LIMIT 12`,
        )
        .all<MonthRow>(),
      db
        .prepare(
          `SELECT substr(p.updated_at, 1, 7) AS month,
                  COALESCE(SUM(p.amount), 0) AS count
           FROM payments p
           WHERE p.status = 'paid'
           GROUP BY month ORDER BY month DESC LIMIT 12`,
        )
        .all<MonthRow>(),
      db
        .prepare(
          `SELECT status, COUNT(*) AS count FROM bookings GROUP BY status`,
        )
        .all<{ status: string; count: number }>(),
      db
        .prepare(
          `SELECT b.artist_id, b.artist_name,
                  COUNT(DISTINCT b.id) AS bookings,
                  COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) AS revenue_sen
           FROM bookings b
           LEFT JOIN payments p ON p.booking_id = b.id
           GROUP BY b.artist_id, b.artist_name
           ORDER BY revenue_sen DESC, bookings DESC
           LIMIT 8`,
        )
        .all<ArtistRevenueRow>(),
      Promise.all([
        db.prepare("SELECT COUNT(*) AS n FROM users").get<{ n: number }>(),
        db.prepare("SELECT COUNT(*) AS n FROM bookings").get<{ n: number }>(),
        db
          .prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE status = 'paid'")
          .get<{ n: number }>(),
        db
          .prepare("SELECT COALESCE(SUM(net_sen), 0) AS n FROM payouts WHERE status = 'pending'")
          .get<{ n: number }>(),
        db
          .prepare("SELECT COUNT(*) AS n FROM bookings WHERE status = 'completed'")
          .get<{ n: number }>(),
        db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'artist'").get<{ n: number }>(),
      ]),
    ]);

  const [
    usersTotal,
    bookingsTotal,
    revenueTotal,
    payoutsPending,
    completedTotal,
    artistsTotal,
  ] = totals;

  return NextResponse.json({
    totals: {
      users: usersTotal?.n ?? 0,
      bookings: bookingsTotal?.n ?? 0,
      revenueSen: revenueTotal?.n ?? 0,
      pendingPayoutsSen: payoutsPending?.n ?? 0,
      completedBookings: completedTotal?.n ?? 0,
      artists: artistsTotal?.n ?? 0,
    },
    bookingsByMonth: bookingsByMonth.reverse(),
    signupsByMonth: signupsByMonth.reverse(),
    revenueByMonth: revenueByMonth.map((r) => ({ month: r.month, sen: r.count })).reverse(),
    bookingsByStatus,
    topArtists,
  });
}, { route: "GET /api/admin/analytics" });
