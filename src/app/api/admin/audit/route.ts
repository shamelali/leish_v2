import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { requireAdmin } from "@/server/admin-auth";
import { tryRoute } from "@/server/http";

export const GET = tryRoute(
  async function GET(request: Request) {
    const { error } = await requireAdmin(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action")?.trim() ?? "";
    const targetTable = searchParams.get("targetTable")?.trim() ?? "";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 200);
    const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);

    const db = getDb();
    const conditions: string[] = [];
    const params: Record<string, string | number> = {};

    if (action) {
      conditions.push("LOWER(a.action) LIKE LOWER(@action)");
      params.action = `%${action}%`;
    }
    if (targetTable) {
      conditions.push("a.target_table = @targetTable");
      params.targetTable = targetTable;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    interface CountRow {
      total: number;
    }

    const [rows, countRow] = await Promise.all([
      db
        .prepare(
          `SELECT a.id, a.admin_user_id, a.action, a.target_table, a.target_id,
                a.details, a.created_at,
                u.name AS admin_name, u.email AS admin_email
         FROM admin_audit_log a
         LEFT JOIN users u ON u.id = a.admin_user_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT @limit OFFSET @offset`,
        )
        .all({ ...params, limit, offset }),
      db
        .prepare(`SELECT COUNT(*) AS total FROM admin_audit_log a ${where}`)
        .get<CountRow>(...(conditions.length ? [params] : [])),
    ]);

    return NextResponse.json({
      entries: rows,
      total: countRow?.total ?? 0,
      limit,
      offset,
    });
  },
  { route: "GET /api/admin/audit" },
);
