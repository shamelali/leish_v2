import { NextResponse } from "next/server";
import { getDb, type BookingRow } from "@/server/db";
import { requireAdmin, logAdminAction } from "@/server/admin-auth";
import { tryRoute, readJson, jsonError } from "@/server/http";

interface PatchBody {
  status?: string;
  notes?: string;
}

export const GET = tryRoute(async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { id } = await params;
  const db = getDb();

  const booking = await db
    .prepare(
      `SELECT b.*, u.name AS customer_name, u.email AS customer_email
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.id = ?`,
    )
    .get<BookingRow & { customer_name: string; customer_email: string }>(id);

  if (!booking) {
    return jsonError("Booking not found", 404);
  }

  const [payment, quotation] = await Promise.all([
    db
      .prepare("SELECT * FROM payments WHERE booking_id = ?")
      .get(id),
    db
      .prepare("SELECT * FROM quotations WHERE booking_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(id),
  ]);

  return NextResponse.json({ booking, payment: payment ?? null, quotation: quotation ?? null });
}, { route: "GET /api/admin/bookings/[id]" });

export const PATCH = tryRoute(async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, error } = await requireAdmin(request);
  if (error) return error;

  const { id } = await params;
  const body = await readJson<PatchBody>(request);
  if (!body.ok) return body.error;

  const { status, notes } = body.data;

  const validStatuses = ["requested", "accepted", "confirmed", "cancelled", "completed"];
  if (status !== undefined && !validStatuses.includes(status)) {
    return jsonError(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400);
  }

  const db = getDb();

  const existing = await db.prepare("SELECT id, status, notes FROM bookings WHERE id = ?").get<{
    id: string;
    status: string;
    notes: string | null;
  }>(id);

  if (!existing) {
    return jsonError("Booking not found", 404);
  }

  const updates: string[] = [];
  const values: Record<string, string | number> = { id };

  if (status !== undefined) {
    updates.push("status = @status");
    values.status = status;
  }

  if (notes !== undefined) {
    updates.push("notes = @notes");
    values.notes = notes;
  }

  if (updates.length === 0) {
    return jsonError("No fields to update", 400);
  }

  await db.prepare(`UPDATE bookings SET ${updates.join(", ")} WHERE id = @id`).run(values);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (status !== undefined && status !== existing.status) {
    changes.status = { from: existing.status, to: status };
  }
  if (notes !== undefined && notes !== existing.notes) {
    changes.notes = { from: existing.notes, to: notes };
  }

  await logAdminAction(user.id, "booking.update", "bookings", id, changes);

  const updated = await db
    .prepare(
      `SELECT b.*, u.name AS customer_name, u.email AS customer_email
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       WHERE b.id = ?`,
    )
    .get<BookingRow & { customer_name: string; customer_email: string }>(id);

  return NextResponse.json({ booking: updated });
}, { route: "PATCH /api/admin/bookings/[id]" });
