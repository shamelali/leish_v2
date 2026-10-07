import { after } from "next/server";
import { getDb } from "./db";
import { logger } from "./logger";

/**
 * Traffic-driven cron scheduler (Cloudflare deployment).
 *
 * Vercel Cron doesn't exist on Workers and the account's free cron-trigger
 * quota is exhausted, so due jobs run opportunistically on regular traffic:
 * `kickCronScheduler()` is called from the request proxy; at most once a
 * minute it loads last-run timestamps and fires whatever is due via `after()`
 * (response is never delayed).
 *
 * Safety properties:
 * - OFF unless `CRON_TRAFFIC_SCHEDULER=1` (set on the Cloudflare Worker only —
 *   Vercel keeps its real cron schedules, so jobs never double-run there).
 * - Slot claiming: a job runs only if this isolate wins an atomic
 *   UPDATE-first claim on its `platform_settings` timestamp. Two isolates
 *   racing the same tick can't both send the same reminder email.
 * - Every job is an idempotent timestamp-gated sweep, so a duplicate run in
 *   a race window is a no-op — never a double charge or double booking change.
 */

export interface CronJob {
  /** platform_settings key suffix, e.g. "email-retries" → cron_last_email-retries */
  name: string;
  /** Minimum gap between runs. */
  intervalMs: number;
  /** Optional UTC hour the job may run at (daily jobs). */
  hourUTC?: number;
  /** App route path fired with CRON_SECRET. */
  path: string;
}

export const CRON_JOBS: CronJob[] = [
  { name: "email-retries", intervalMs: 15 * 60_000, path: "/api/cron/email-retries" },
  { name: "quotation-expiry", intervalMs: 60 * 60_000, path: "/api/cron/quotation-expiry" },
  { name: "booking-transitions", intervalMs: 60 * 60_000, path: "/api/cron/booking-transitions" },
  { name: "retention", intervalMs: 22 * 60 * 60_000, hourUTC: 2, path: "/api/cron/retention" },
  {
    name: "payout-automation",
    intervalMs: 22 * 60 * 60_000,
    hourUTC: 3,
    path: "/api/cron/payout-automation",
  },
  {
    name: "balance-reminders",
    intervalMs: 22 * 60 * 60_000,
    hourUTC: 9,
    path: "/api/cron/balance-reminders",
  },
  {
    name: "review-requests",
    intervalMs: 22 * 60 * 60_000,
    hourUTC: 9,
    path: "/api/cron/review-requests",
  },
  {
    name: "quotation-recovery",
    intervalMs: 22 * 60 * 60_000,
    hourUTC: 9,
    path: "/api/cron/quotation-recovery",
  },
];

const SETTING_PREFIX = "cron_last_";
const CHECK_THROTTLE_MS = 60_000;

let lastCheckMs = 0;

/** Test hook: reset the in-memory check throttle. */
export function __resetCronSchedulerThrottle(): void {
  lastCheckMs = 0;
}

export function isTrafficSchedulerEnabled(): boolean {
  return process.env.CRON_TRAFFIC_SCHEDULER === "1";
}

/** Pure: which jobs are due given last-run timestamps and now. */
export function dueJobs(lastRuns: Map<string, number>, nowMs: number = Date.now()): CronJob[] {
  const now = new Date(nowMs);
  return CRON_JOBS.filter((job) => {
    const last = lastRuns.get(SETTING_PREFIX + job.name) ?? 0;
    if (nowMs - last < job.intervalMs) return false;
    if (job.hourUTC !== undefined && now.getUTCHours() < job.hourUTC) return false;
    return true;
  });
}

async function readLastRuns(): Promise<Map<string, number>> {
  const runs = new Map<string, number>();
  try {
    const rows = (await getDb()
      .prepare("SELECT key, value FROM platform_settings WHERE key LIKE 'cron_last_%'")
      .all()) as { key: string; value: string }[];
    for (const row of rows) {
      const t = Date.parse(row.value);
      if (Number.isFinite(t)) runs.set(row.key, t);
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "cron scheduler: timestamp read failed; skipping tick",
    );
  }
  return runs;
}

/**
 * Atomically claim a job slot: UPDATE the timestamp only if it is older than
 * the cutoff, and report whether this isolate won. A missing row is inserted
 * (a concurrent insert loses via the primary key and reports false).
 */
export async function claimCronSlot(
  key: string,
  nowMs: number,
  intervalMs: number,
): Promise<boolean> {
  const nowIso = new Date(nowMs).toISOString();
  const cutoffIso = new Date(nowMs - intervalMs).toISOString();
  try {
    const db = getDb();
    const updated = await db
      .prepare(
        "UPDATE platform_settings SET value = @now, updated_at = @now WHERE key = @key AND value < @cutoff",
      )
      .run({ now: nowIso, key, cutoff: cutoffIso });
    if (updated.changes === 1) return true;
    const existing = (await db
      .prepare("SELECT key FROM platform_settings WHERE key = @key")
      .get({ key })) as { key: string } | undefined;
    if (existing) return false;
    try {
      await db
        .prepare("INSERT INTO platform_settings (key, value, updated_at) VALUES (@key, @now, @now)")
        .run({ key, now: nowIso });
      return true;
    } catch {
      return false; // Lost the insert race — the other isolate runs it.
    }
  } catch (err) {
    logger.warn(
      { key, err: err instanceof Error ? err.message : String(err) },
      "cron scheduler: slot claim failed",
    );
    return false;
  }
}

async function fireJob(origin: string, job: CronJob): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.warn({ job: job.name }, "cron scheduler: CRON_SECRET unset, skipping job");
    return;
  }
  try {
    const res = await fetch(`${origin}${job.path}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    logger.info(
      { job: job.name, status: res.status },
      "cron scheduler: traffic-triggered job finished",
    );
  } catch (err) {
    logger.error(
      { job: job.name, err: err instanceof Error ? err.message : String(err) },
      "cron scheduler: job fetch failed",
    );
  }
}

async function runDueCrons(origin: string): Promise<void> {
  const nowMs = Date.now();
  const due = dueJobs(await readLastRuns(), nowMs);
  for (const job of due) {
    if (await claimCronSlot(SETTING_PREFIX + job.name, nowMs, job.intervalMs)) {
      await fireJob(origin, job);
    }
  }
}

/**
 * Called from the request proxy on every request. Cheap: a single timestamp
 * comparison when disabled or throttled; at most one timestamp query per
 * minute per isolate when enabled. Never awaits — scheduled via `after()`.
 */
export function kickCronScheduler(origin: string): void {
  if (!isTrafficSchedulerEnabled()) return;
  const nowMs = Date.now();
  if (nowMs - lastCheckMs < CHECK_THROTTLE_MS) return;
  lastCheckMs = nowMs;
  try {
    // `after()` defers work until after the response is sent, so cron checks
    // never add latency. If the runtime lacks it, the tick is skipped.
    after(() => {
      runDueCrons(origin).catch((err) =>
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          "cron scheduler: tick failed",
        ),
      );
    });
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      "cron scheduler: after() unavailable, skipping tick",
    );
  }
}
