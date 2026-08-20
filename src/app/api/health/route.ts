import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Don't validate env here - just check connectivity
    return NextResponse.json({
      status: "ok",
      env: process.env.NODE_ENV,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7) || "77d0758",
      timestamp: new Date().toISOString(),
      checks: {
        session_secret: !!process.env.SESSION_SECRET,
        database: !!process.env.DATABASE_URL,
        redis: !!process.env.REDIS_URL,
      }
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message, stack: process.env.NODE_ENV !== "production" ? e.stack : undefined },
      { status: 500 }
    );
  }
}
