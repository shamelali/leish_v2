import { NextResponse } from "next/server";
import { getDb, type BookingRow } from "@/server/db";
import { findExpiredQuotations, markQuotationExpired } from "@/server/quotations";
import { sendQuotationExpiredEmail } from "@/server/booking-emails";
import { tryRoute } from "@/server/http";
import { logger } from "@/server/logger";

/**
 * POST /api/cron/quotation-expiry
 * Marks pending quotations past their 24h window as expired and emails the
 * clients. Guarded by the CRON_SECRET header so only the scheduler can run it.
 *
 * Wire it in Vercel: Settings → Cron Jobs → POST /api/cron/quotation-expiry
 * (e.g. hourly) with header `x-cron-secret: <CRON_SECRET>`.
 */
export const POST = tryRoute(
  async function POST(request: Request) {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get("x-cron-secret") !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
  { route: "POST /api/cron/quotation-expiry" },
);
