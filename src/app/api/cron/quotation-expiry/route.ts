import { NextResponse } from "next/server";
import { getDb, type BookingRow } from "@/server/db";
import { findExpiredQuotations, markQuotationExpired } from "@/server/quotations";
import { sendQuotationExpiredEmail } from "@/server/booking-emails";
import { tryRoute } from "@/server/http";
import { authorizeCron } from "@/server/cron-auth";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/cron/quotation-expiry
 * Marks pending quotations past their 24h window as expired and emails the
 * clients. Guarded by CRON_SECRET so only the scheduler can run it.
 *
 * Vercel Cron (configured in vercel.json) issues a GET with
 * `Authorization: Bearer <CRON_SECRET>`; manual callers may use the
 * `x-cron-secret` header instead.
 */
const handler = tryRoute(
  async function run(request: Request) {
    const unauthorized = authorizeCron(request);
    if (unauthorized) return unauthorized;

    const expired = await findExpiredQuotations();
    let marked = 0;

    for (const quotation of expired) {
      const booking = (await getDb()
        .prepare("SELECT * FROM bookings WHERE id = ?")
        .get(quotation.booking_id)) as BookingRow | undefined;
      if (!booking) continue;

      if (await markQuotationExpired(quotation.id)) {
        marked += 1;
        await sendQuotationExpiredEmail({
          bookingId: booking.id,
          ownerUserId: booking.user_id,
          artistName: booking.artist_name,
          service: booking.service,
        });
      }
    }

    logger.info({ found: expired.length, marked }, "quotation expiry sweep complete");
    return NextResponse.json({ found: expired.length, expired: marked });
  },
  { route: "/api/cron/quotation-expiry" },
);

export const GET = handler;
export const POST = handler;
