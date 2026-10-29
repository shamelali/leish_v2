/**
 * leish-cron — scheduled trigger worker.
 *
 * Cloudflare scheduled worker for the production deployment. Cloudflare Free
 * allows few cron triggers per account and this account already uses most of
 * them, so this worker has ONE per-minute trigger and dispatches the original
 * schedules by wall-clock time.
 *
 * All jobs are idempotent timestamp-gated sweeps (safe if a tick fires twice):
 * email-retries every 5 min, quotation-expiry + booking-transitions hourly,
 * retention 02:00, payout-automation 03:00, and the three morning sweeps at
 * 09:00, 10:00 and 11:00 UTC. This is the platform's only scheduler — the app
 * runs on Vercel Hobby, which rejects any cron more frequent than daily, so no
 * schedules live there. schedule.test.ts pins this table.
 *
 * Secrets: CRON_SECRET (wrangler secret put --config <this file>)
 */

interface Env {
  APP_URL: string;
  CRON_SECRET: string;
}

const HOURLY = ["/api/cron/quotation-expiry", "/api/cron/booking-transitions"];
const DAILY: Record<number, string[]> = {
  2: ["/api/cron/retention"],
  3: ["/api/cron/payout-automation"],
  9: ["/api/cron/balance-reminders"],
  10: ["/api/cron/review-requests"],
  11: ["/api/cron/quotation-recovery"],
};

/** Route paths due at this UTC wall-clock time. */
export function duePaths(now: Date): string[] {
  const paths: string[] = [];
  if (now.getUTCMinutes() % 5 === 0) paths.push("/api/cron/email-retries");
  if (now.getUTCMinutes() === 0) {
    paths.push(...HOURLY);
    paths.push(...(DAILY[now.getUTCHours()] ?? []));
  }
  return paths;
}

async function fire(path: string, env: Env): Promise<string> {
  const url = `${env.APP_URL}${path}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
    const body = (await res.text()).slice(0, 200);
    return `${path} → HTTP ${res.status} ${body}`;
  } catch (err) {
    return `${path} → FAILED ${err instanceof Error ? err.message : String(err)}`;
  }
}

export default {
  async scheduled(
    event: { cron: string },
    env: Env,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
  ): Promise<void> {
    const paths = duePaths(new Date());
    if (paths.length === 0) return;
    const results = await Promise.all(paths.map((p) => fire(p, env)));
    for (const r of results) console.log(`[cron] ${r}`);
    ctx.waitUntil(Promise.resolve());
  },
};
