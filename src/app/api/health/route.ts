import { NextResponse } from "next/server";

export async function GET() {
  let dbStatus = "unknown";
  let dbError = null;

  try {
    // Try DB check but don't crash if it fails
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      dbStatus = "ok";
    } catch (e: any) {
      dbStatus = "error";
      dbError = e.message?.slice(0,100);
    } finally {
      client.release();
      await pool.end();
    }
  } catch (e: any) {
    dbStatus = "error";
    dbError = e.message?.slice(0,100);
  }

  // Always return 200, even if DB is down - don't throw 500
  return NextResponse.json({
    status: dbStatus === "ok"? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7) || "77d0758",
    checks: {
      session_secret:!!process.env.SESSION_SECRET,
      database_url:!!process.env.DATABASE_URL,
      database: dbStatus,
      database_error: dbError,
      redis:!!process.env.REDIS_URL,
    }
  });
}
