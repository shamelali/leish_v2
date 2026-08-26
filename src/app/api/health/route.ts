import { NextResponse } from "next/server";
import { getDb, isPostgres } from "@/server/db";
import {
  getActiveEmailProvider,
  isBillplzConfigured,
  isTurnstileConfigured,
  isSentryConfigured,
  areWebhooksConfigured,
} from "@/server/integrations";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe (used by the Docker HEALTHCHECK).
 * Always returns 200 with a status of "ok" | "degraded" so orchestrators can
 * distinguish "process up" from "dependency down" without a hard failure.
 */
export async function GET() {
  let dbStatus = "unknown";
  let dbError: string | null = null;

  try {
    const db = getDb();
    await db.prepare("SELECT 1 AS ok").get();
    dbStatus = "ok";
  } catch (err) {
    dbStatus = "error";
    dbError = (err instanceof Error ? err.message : String(err)).slice(0, 100);
  }

  return NextResponse.json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    checks: {
      session_secret: Boolean(process.env.SESSION_SECRET),
      database_url: Boolean(process.env.DATABASE_URL),
      database_backend: isPostgres() ? "postgres" : "sqlite",
      database: dbStatus,
      database_error: dbError,
      email: getActiveEmailProvider() !== "dev",
      billplz: isBillplzConfigured(),
      turnstile: isTurnstileConfigured(),
      sentry: isSentryConfigured(),
      webhooks: areWebhooksConfigured(),
      rate_limit: "memory",
      chat: "memory",
    },
  });
}
