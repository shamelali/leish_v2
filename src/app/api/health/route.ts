import { NextResponse } from "next/server";
import { getDb } from "@/server/db";

export async function GET() {
  try {
    const db = await getDb();

    // Check database connectivity
    const sqlite = isSqlite();
    if (sqlite) {
      await getDb().prepare("SELECT 1").run();
    } else {
      (await getDb()).query("SELECT 1");
    }

    // Check payments table exists
    const payment = (await getDb()
      .prepare("SELECT COUNT(*) as count FROM payments")
      .get()) as { count: number };

    return NextResponse.json({
      status: "ok",
      database: "connected",
      paymentsTable: payment.count,
    });
  } catch (err) {
    logger.error({ err }, "health check failed");
    return NextResponse.json(
      { status: "error", message: (err as Error).message },
      { status: 503 }
    );
  }
}

function isSqlite(): boolean {
  return !process.env.DATABASE_URL;
}