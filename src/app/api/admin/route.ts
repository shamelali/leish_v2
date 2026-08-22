import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { tryRoute } from "@/server/http";

export const GET = tryRoute(
  async function GET(request: Request) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const db = getDb();

    interface UserCountRow {
      total: number;
      customers: number;
      artists: number;
      studios: number;
      admins: number;
    }
    interface BookingCountRow {
      total: number;
      requested: number;
      accepted: number;
      confirmed: number;
      completed: number;
      cancelled: number;
    }
    interface PaymentStatRow {
      total: number;
      paid: number;
      required: number;
      totalRevenue: number;
    }
    interface CountRow {
      count: number;
    }
    interface RecentBookingRow {
      id: string;
      artist_name: string;
      service: string;
      date: string;
      time: string;
      status: string;
      created_at: string;
    }
    interface AuditRow {
      id: string;
      action: string;
      target_table: string;
      target_id: string | null;
      created_at: string;
    }

    const [userCount, bookingCount, paymentStats, artistProfileCount, recentBookings, recentAudit] =
      await Promise.all([
        db
          .prepare(
            `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END) AS customers,
            SUM(CASE WHEN role = 'artist' THEN 1 ELSE 0 END) AS artists,
            SUM(CASE WHEN role = 'studio' THEN 1 ELSE 0 END) AS studios,
            SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins
           FROM users`,
          )
          .get<UserCountRow>(),
        db
          .prepare(
            `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'requested' THEN 1 ELSE 0 END) AS requested,
            SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
           FROM bookings`,
          )
          .get<BookingCountRow>(),
        db
          .prepare(
            `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid,
            SUM(CASE WHEN status = 'required' THEN 1 ELSE 0 END) AS required,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS totalRevenue
           FROM payments`,
          )
          .get<PaymentStatRow>(),
        db.prepare("SELECT COUNT(*) AS count FROM artist_profiles").get<CountRow>(),
        db
          .prepare(
            `SELECT id, artist_name, service, date, time, status, created_at
           FROM bookings ORDER BY created_at DESC LIMIT 10`,
          )
          .all<RecentBookingRow>(),
        db
          .prepare(
            `SELECT id, action, target_table, target_id, created_at
           FROM admin_audit_log ORDER BY created_at DESC LIMIT 10`,
          )
          .all<AuditRow>(),
      ]);

    return NextResponse.json({
      stats: {
        users: {
          total: userCount?.total ?? 0,
          customers: userCount?.customers ?? 0,
          artists: userCount?.artists ?? 0,
          studios: userCount?.studios ?? 0,
          admins: userCount?.admins ?? 0,
        },
        bookings: {
          total: bookingCount?.total ?? 0,
          requested: bookingCount?.requested ?? 0,
          accepted: bookingCount?.accepted ?? 0,
          confirmed: bookingCount?.confirmed ?? 0,
          completed: bookingCount?.completed ?? 0,
          cancelled: bookingCount?.cancelled ?? 0,
        },
        payments: {
          total: paymentStats?.total ?? 0,
          paid: paymentStats?.paid ?? 0,
          required: paymentStats?.required ?? 0,
          totalRevenue: paymentStats?.totalRevenue ?? 0,
        },
        artistProfiles: artistProfileCount?.count ?? 0,
      },
      recentBookings,
      recentAudit,
    });
  },
  { route: "GET /api/admin" },
);
