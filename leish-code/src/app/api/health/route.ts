import { NextResponse } from "next/server";
import { getDb, isPostgres } from "@/server/db";
import { tryRoute } from "@/server/http";

/**
 * GET /api/health
 * Liveness + readiness probe for uptime monitors / Vercel Cron.
 * Pings the active database backend and reports which one is in use.
 */
export const GET = tryRoute(
  async function GET() {
    const db = getDb();
    const row = await db.prepare("SELECT 1 AS ok").get<{ ok: number }>();

    return NextResponse.json(
      {
        status: row?.ok === 1 ? "ok" : "degraded",
        database: isPostgres() ? "postgres" : "sqlite",
        time: new Date().toISOString(),
      },
      { status: row?.ok === 1 ? 200 : 503 },
    );
  },
  { route: "GET /api/health" },
);
