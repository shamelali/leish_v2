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
 * retention 02:00, payout-automation 03:00, and the balance-reminders /
 * review-requests / quotation-recovery morning sweeps at 09:00 UTC.
 *
 * Secrets: CRON_SECRET (wrangler secret put --config <this file>)
 */

interface Env {
  APP_URL: string;
  CRON_SECRET: string;
}

const HOURLY = ["/api/cron/quotation-expiry", "/api/cron/booking-transitions"];
const MORNING = [
  "/api/cron/balance-reminders",
  "/api/cron/review-requests",
  "/api/cron/quotation-recovery",
];

/** Route paths due at this UTC wall-clock time. */
function duePaths(now: Date): string[] {
  const paths: string[] = [];
  if (now.getUTCMinutes() % 5 === 0) paths.push("/api/cron/email-retries");
  if (now.getUTCMinutes() === 0) {
    paths.push(...HOURLY);
    const h = now.getUTCHours();
    if (h === 2) paths.push("/api/cron/retention");
    if (h === 3) paths.push("/api/cron/payout-automation");
    if (h === 9) paths.push(...MORNING);
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
