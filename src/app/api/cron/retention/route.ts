import { NextResponse } from "next/server";

export async function GET(req: Request) {
  // Vercel Cron auth
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow Vercel cron without auth in production (Vercel handles it)
    const isVercelCron = req.headers.get("x-vercel-cron") === "1";
    if (!isVercelCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  return NextResponse.json({
    status: "ok",
    message: "Retention cron would run here",
    next: "Archive >7y data",
    timestamp: new Date().toISOString()
  });
}
