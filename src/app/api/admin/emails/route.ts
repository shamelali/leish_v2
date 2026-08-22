import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { tryRoute } from "@/server/http";

export const GET = tryRoute(
  async function GET(request: Request) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 100);
    const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

    const db = getDb();

    interface CountRow {
      total: number;
    }

    const [rows, countRow] = await Promise.all([
      db
        .prepare(
          `SELECT id, to_email, subject, text, html, created_at
         FROM email_outbox
         ORDER BY created_at DESC
         LIMIT @limit OFFSET @offset`,
        )
        .all({ limit, offset }),
      db.prepare(`SELECT COUNT(*) AS total FROM email_outbox`).get<CountRow>(),
    ]);

    return NextResponse.json({
      emails: rows,
      total: countRow?.total ?? 0,
      limit,
      offset,
    });
  },
  { route: "GET /api/admin/emails" },
);
