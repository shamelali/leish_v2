import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin, logAdminAction } from "@/server/admin-auth";
import { listPayouts, updatePayoutStatus } from "@/server/payouts";
import { notifyPayoutSettled } from "@/server/booking-emails";
import { tryRoute, statefulRoute, readJson, jsonError } from "@/server/http";

const VALID_STATUSES = ["pending", "settled", "failed"] as const;

/**
 * GET /api/admin/payouts?status=pending
 * List artist payouts (optionally filtered by status), newest first.
 */
export const GET = tryRoute(
  async function GET(request: Request) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const status = new URL(request.url).searchParams.get("status");
    if (status && !(VALID_STATUSES as readonly string[]).includes(status)) {
      return jsonError("Invalid status filter", 400);
    }

    const payouts = await listPayouts(status ?? undefined);
    return NextResponse.json({
      payouts: payouts.map((p) => ({
        id: p.id,
        bookingId: p.booking_id,
        artistUserId: p.artist_user_id,
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
  { route: "GET /api/admin/payouts" },
);

/**
 * POST /api/admin/payouts
 * Settle or fail a payout. Body: { id, action: "settle" | "fail", notes? }
 * Every mutation is audit-logged.
 */
export const POST = statefulRoute(
  async function POST(request: Request) {
    const { user, error } = await requireAdmin(request);
    if (error) return error;

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.error;
    const data = body.data as { id?: string; action?: string; notes?: string };
    if (!data?.id || typeof data.id !== "string") return jsonError("Missing payout id", 400);
    if (data.action !== "settle" && data.action !== "fail") {
      return jsonError('Invalid action — expected "settle" or "fail"', 400);
    }

    const payout = await updatePayoutStatus(data.id!, data.action === "settle" ? "settled" : "failed", data.notes);
    if (!payout) return jsonError("Payout not found", 404);

    // Notify the artist when a payout settles (best-effort).
    if (payout.status === "settled" && payout.artist_user_id) {
      try {
        const booking = (await getDb()
          .prepare("SELECT service, date FROM bookings WHERE id = ?")
          .get(payout.booking_id)) as { service: string; date: string } | undefined;
        if (booking) {
          await notifyPayoutSettled({
            artistUserId: payout.artist_user_id,
            service: booking.service,
            eventDate: booking.date,
            netSen: payout.net_sen,
          });
        }
      } catch (err) {
        console.error("[payouts] settle notification failed:", err);
      }
    }

    await logAdminAction(user!.id, `payout_${data.action}`, "payouts", payout.id, {
      netSen: payout.net_sen,
      notes: data.notes ?? null,
    });

    return NextResponse.json({
      payout: {
        id: payout.id,
        status: payout.status,
        settledAt: payout.settled_at,
        notes: payout.notes,
      },
    });
  },
  { route: "POST /api/admin/payouts" },
);
