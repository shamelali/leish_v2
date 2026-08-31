import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { getClaimedArtistIds } from "@/server/artist-profiles";
import { getClaimedStudioIds } from "@/server/studio-profiles";
import { verifySessionToken } from "@/server/session";

interface MigrationResult {
  success: boolean;
  migrated: number;
  failed: number;
  errors: string[];
}

interface MigrationOptions {
  bookingIds?: string[];
  batchSize?: number;
  dryRun?: boolean;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 });
    }

    const payload = await verifySessionToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    // Verify admin
    const db = await getDb();
    const user = await db.prepare("SELECT role FROM users WHERE id = ?").get(payload.sub) as { role: string } | undefined;
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    let body: MigrationOptions;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { bookingIds, batchSize = 100, dryRun = false } = body;
    const result: MigrationResult = { success: true, migrated: 0, failed: 0, errors: [] };

    // Build query
    let query = "SELECT * FROM messages";
    const params: string[] = [];

    if (bookingIds && bookingIds.length > 0) {
      const placeholders = bookingIds.map(() => "?").join(",");
      query += ` WHERE booking_id IN (${placeholders})`;
      params.push(...bookingIds);
    }

    query += " ORDER BY booking_id, created_at ASC";

    try {
      const rows = await db.prepare(query).all<{
        id: string;
        booking_id: string;
        sender_id: string;
        body: string;
        created_at: string;
      }>(...params);

      // Group by booking
      const byBooking = new Map<string, typeof rows>();
      for (const row of rows) {
        const arr = byBooking.get(row.booking_id) ?? [];
        arr.push(row);
        byBooking.set(row.booking_id, arr);
      }

      // For each booking, call the worker to insert messages
      const workerUrl = process.env.NEXT_PUBLIC_CHAT_WS_URL?.replace("/ws/", "/api/") ?? "";
      
      for (const [bookingId, messages] of byBooking) {
        if (dryRun) {
          result.migrated += messages.length;
          continue;
        }

        try {
          // Insert messages into the DO via worker API
          const res = await fetch(`${workerUrl}chat/messages/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookingId, messages }),
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || `HTTP ${res.status}`);
          }

          result.migrated += messages.length;
        } catch (e) {
          result.failed += messages.length;
          result.errors.push(`Booking ${bookingId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (e) {
      result.success = false;
      result.errors.push(`Database error: ${e instanceof Error ? e.message : String(e)}`);
    }

    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}