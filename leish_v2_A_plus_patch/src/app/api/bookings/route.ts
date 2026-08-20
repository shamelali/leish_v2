import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/app/api/_lib/handler";
import { getDb } from "@/server/db/client";
import { z } from "zod";
import { sanitizeText } from "@/server/sanitize";

const createSchema = z.object({
  artistId: z.string().min(1),
  date: z.string().min(1),
  eventType: z.string().min(1),
  message: z.string().max(1000).optional(),
});

// FIX: Pagination + JOIN to avoid N+1
export const GET = apiHandler(async (req, { user }) => {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(10, parseInt(searchParams.get("limit") || "20")));
  const offset = (page-1)*limit;
  
  // Single query with JOIN for quotations + payments
  const bookings = await getDb().prepare(`
    SELECT b.*, 
           q.total as quotation_total, q.expires_at as quotation_expires,
           p.status as payment_status
    FROM bookings b
    LEFT JOIN quotations q ON q.booking_id = b.id AND q.status='active'
    LEFT JOIN payments p ON p.booking_id = b.id
    WHERE b.user_id = $1 OR b.claimed_artist_id = $2
    ORDER BY b.created_at DESC
    LIMIT $3 OFFSET $4
  `).all(user.id, user.id, limit, offset).catch(() => 
    getDb().prepare(`
      SELECT b.*, q.total as quotation_total, q.expires_at as quotation_expires, p.status as payment_status
      FROM bookings b
      LEFT JOIN quotations q ON q.booking_id = b.id AND q.status='active'
      LEFT JOIN payments p ON p.booking_id = b.id
      WHERE b.user_id = ? OR b.claimed_artist_id = ?
      ORDER BY b.created_at DESC LIMIT ? OFFSET ?
    `).all(user.id, user.id, limit, offset)
  );

  const total = await getDb().prepare(`SELECT COUNT(*) as count FROM bookings WHERE user_id=$1 OR claimed_artist_id=$2`).get(user.id, user.id).catch(() =>
    getDb().prepare(`SELECT COUNT(*) as count FROM bookings WHERE user_id=? OR claimed_artist_id=?`).get(user.id, user.id)
  ) as any;

  return NextResponse.json({ bookings, pagination: { page, limit, total: total?.count || 0, pages: Math.ceil((total?.count||0)/limit) } });
}, { auth: true, rateLimit: { key: "bookings-list", limit: 60, window: 60 } });

export const POST = apiHandler(async (req, { body, user }) => {
  const safeMessage = body?.message ? sanitizeText(body.message) : undefined;
  // ... price resolved server-side logic remains
  const result = await getDb().prepare(`INSERT INTO bookings(user_id, artist_id, date, event_type, message, status) VALUES($1,$2,$3,$4,$5,'requested') RETURNING id`).run(user.id, body.artistId, body.date, body.eventType, safeMessage).catch(async () => {
    return await getDb().prepare(`INSERT INTO bookings(user_id, artist_id, date, event_type, message, status) VALUES(?,?,?,?,?,'requested')`).run(user.id, body.artistId, body.date, body.eventType, safeMessage);
  });
  return NextResponse.json({ id: (result as any).lastInsertRowid || (result as any).id }, { status: 201 });
}, { auth: true, schema: createSchema, rateLimit: { key: "booking-create", limit: 10, window: 60 } });
