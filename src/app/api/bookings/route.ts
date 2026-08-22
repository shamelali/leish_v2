import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDb, bind, toPublicUser, type BookingRow, type UserRow } from "@/server/db";
import { verifySessionToken } from "@/server/session";
import { bookingSchema } from "@/server/validation";
import { getArtistById } from "@/server/catalog";
import { createVerifyUrl } from "@/server/verify-email";
import { getClaimedArtistIds } from "@/server/artist-profiles";
import { getPaymentForBooking } from "@/server/payments";
import { getBookingFeeSen } from "@/server/settings";
import { getActiveQuotation, serializeQuotation } from "@/server/quotations";
import { notifyBookingCreated } from "@/server/booking-emails";
import { jsonError, readJson, statefulRoute, tryRoute } from "@/server/http";

/** Require a valid session; returns { user } or a JSON error response. */
async function requireUser(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)leish_session=([^;]+)/)?.[1];
  const payload = token ? await verifySessionToken(token) : null;
  if (!payload) return { error: jsonError("Not authenticated", 401) };

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    UserRow | undefined;
  if (!user) return { error: jsonError("Not authenticated", 401) };

  return { user };
}

const BALANCE_DUE_DAYS_BEFORE = 3; // business rule

async function serializeBooking(b: BookingRow) {
  const payment = await getPaymentForBooking(b.id, "deposit");
  const balancePayment = await getPaymentForBooking(b.id, "balance");
  const quotation = await getActiveQuotation(b.id);
  // Balance = quotation total − booking deposit, due 3 days before the event.
  const total = quotation?.status === "expired" ? null : (quotation?.total ?? null);
  const bookingFeeSen = await getBookingFeeSen();
  const balanceDueDate = b.date
    ? new Date(new Date(`${b.date}T00:00:00`).getTime() - BALANCE_DUE_DAYS_BEFORE * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null;

  return {
    id: b.id,
    artistId: b.artist_id,
    artistName: b.artist_name,
    service: b.service,
    price: b.price,
    date: b.date,
    time: b.time,
    notes: b.notes,
    status: b.status,
    eventType: b.event_type ?? null,
    venue: b.venue ?? null,
    guestCount: b.guest_count ?? 0,
    quotation: quotation ? serializeQuotation(quotation) : null,
    totalPrice: total,
    balanceDueDate,
    balanceAmount: total !== null ? Math.max(0, total - bookingFeeSen) : null,
    payment: payment
      ? {
          amount: payment.amount,
          type: payment.type,
          status: payment.status,
          provider: payment.provider,
          reference: payment.provider_ref,
          url: payment.provider_url,
        }
      : null,
    balancePayment: balancePayment
      ? {
          amount: balancePayment.amount,
          type: balancePayment.type,
          status: balancePayment.status,
          provider: balancePayment.provider,
          reference: balancePayment.provider_ref,
          url: balancePayment.provider_url,
        }
      : null,
  };
}

export const GET = tryRoute(
  async function GET(request: Request) {
    const { user, error } = await requireUser(request);
    if (error) return error;

    // Pagination: ?limit= (default 20, max 100) & ?offset= (default 0).
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 100);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

    const isArtistRole = user!.role === "artist" || user!.role === "studio";
    let rows: BookingRow[];
    let total: number;
    if (isArtistRole) {
      // Ownership: artists only see bookings for the catalog profiles they
      // have claimed (empty when none claimed).
      const claimed = await getClaimedArtistIds(user!.id);
      if (claimed.length === 0) {
        rows = [];
        total = 0;
      } else {
        const placeholders = claimed.map(() => "?").join(",");
        const baseSql = `FROM bookings WHERE artist_id IN (${placeholders})`;
        const [countRow, page] = await Promise.all([
          getDb()
            .prepare(`SELECT COUNT(*) AS c ${baseSql}`)
            .get(...claimed) as Promise<{ c: number } | undefined>,
          getDb()
            .prepare(`SELECT * ${baseSql} ORDER BY date DESC, time DESC LIMIT ? OFFSET ?`)
            .all(...claimed, limit, offset) as Promise<unknown[]>,
        ]);
        total = countRow?.c ?? 0;
        rows = page as unknown as BookingRow[];
      }
    } else {
      const baseSql = "FROM bookings WHERE user_id = ?";
      const [countRow, page] = await Promise.all([
        getDb().prepare(`SELECT COUNT(*) AS c ${baseSql}`).get(user!.id) as Promise<
          { c: number } | undefined
        >,
        getDb()
          .prepare(`SELECT * ${baseSql} ORDER BY date DESC, time DESC LIMIT ? OFFSET ?`)
          .all(user!.id, limit, offset) as Promise<unknown[]>,
      ]);
      total = countRow?.c ?? 0;
      rows = page as unknown as BookingRow[];
    }

    return NextResponse.json({
      bookings: await Promise.all(rows.map(serializeBooking)),
      pagination: { total, limit, offset, hasMore: offset + rows.length < total },
    });
  },
  { route: "GET /api/bookings" },
);

export const POST = statefulRoute(
  async function POST(request: Request) {
    const { user, error } = await requireUser(request);
    if (error) return error;

    // Trust gate: unverified accounts cannot create bookings.
    if (!user!.email_verified) {
      return NextResponse.json(
        {
          error: "Please verify your email before booking.",
          code: "EMAIL_NOT_VERIFIED",
          // Dev convenience: no email provider in the sandbox, so surface the
          // verification link directly (never included in production).
          devVerifyUrl:
            process.env.NODE_ENV !== "production" ? await createVerifyUrl(user!.id) : undefined,
        },
        { status: 403 },
      );
    }

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.error;

    const parsed = bookingSchema.safeParse(body.data);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
    }

    const { artistId, service, date, time, notes, eventType, venue, guestCount } = parsed.data;

    // Price/duration are resolved server-side from the catalog — never trust
    // the client for pricing.
    const artist = await getArtistById(artistId);
    if (!artist) return jsonError("Artist not found", 404);
    const serviceDef = artist.services.find((s) => s.name === service);
    if (!serviceDef) return jsonError("Service not available for this artist", 400);

    const db = await getDb();
    const booking: BookingRow = {
      id: randomUUID(),
      user_id: user!.id,
      artist_id: artist.id,
      artist_name: artist.name,
      service: serviceDef.name,
      price: serviceDef.price,
      date,
      time,
      notes: notes || null,
      event_type: eventType,
      venue: venue || null,
      guest_count: guestCount || 0,
      balance_reminder_at: null,
      status: "requested",
      created_at: new Date().toISOString(),
    };

    // Friendly pre-check (the unique partial index is the hard guarantee —
    // cancelled/completed bookings don't block the slot).
    const existing = (await db
      .prepare(
        "SELECT id FROM bookings WHERE artist_id = ? AND date = ? AND time = ? AND status IN ('requested','accepted','confirmed') LIMIT 1",
      )
      .get(artist.id, date, time)) as { id: string } | undefined;
    if (existing) {
      return jsonError(
        "Sorry, this time slot has just been taken. Pick another time or artist.",
        409,
      );
    }

    try {
      await db
        .prepare(
          `INSERT INTO bookings (id, user_id, artist_id, artist_name, service, price, date, time, notes, event_type, venue, guest_count, status, balance_reminder_at, created_at)
     VALUES (@id, @user_id, @artist_id, @artist_name, @service, @price, @date, @time, @notes, @event_type, @venue, @guest_count, @status, @balance_reminder_at, @created_at)`,
        )
        .run(bind(booking));
    } catch (err) {
      // Race-condition guard: the unique partial index rejected a second
      // active booking for the same slot.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE") || msg.includes("duplicate key")) {
        return jsonError(
          "Sorry, this time slot has just been taken. Pick another time or artist.",
          409,
        );
      }
      throw err;
    }

    await notifyBookingCreated({
      bookingId: booking.id,
      ownerUserId: user!.id,
      artistName: artist.name,
      service: serviceDef.name,
      date,
      time,
    });

    return NextResponse.json(
      {
        booking: await serializeBooking(booking),
        user: toPublicUser(user!),
      },
      { status: 201 },
    );
  },
  { route: "POST /api/bookings" },
);
