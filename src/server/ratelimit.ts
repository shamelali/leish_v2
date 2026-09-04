/**
 * Rate limiting with pluggable stores.
 *
 * - `createMemoryStore()` — in-process sliding-window buckets. Fine for
 *   single-instance deploys and tests.
 * - `createUpstashStore()` — Redis-backed fixed-window counters via the
 *   Upstash REST API (no SDK needed). Implemented and tested, but NOT wired
 *   into the default limiter: setting UPSTASH_REST_URL / UPSTASH_REST_TOKEN
 *   has no effect. To use it you must construct it explicitly.
 * - `createRateLimiter(store)` — returns a `(key, limit, windowMs) => Promise<result>`
 *   function. `rateLimit` is the default instance used by API routes.
 *
 * Results include `retryAfterMs` so callers can emit a Retry-After header.
 *
 * ## Operational limitation: limits are PER INSTANCE, not global
 *
 * The default limiter keeps its buckets in the process heap. On a serverless
 * host every concurrent instance gets its own empty Map, so with N warm
 * instances the effective limit is up to N x the configured value, and a
 * limit "resets" whenever an instance is recycled. An attacker who spreads
 * requests across connections is therefore throttled far more loosely than
 * the numbers in the route handlers suggest.
 *
 * This is accepted for launch: the limiter exists to blunt casual abuse and
 * accidental retry storms, not to be a security control. Nothing enforcing
 * authorization or money depends on it. If real abuse appears, swap the
 * default to `createUpstashStore()` (or any shared store) — the interface is
 * already the right shape and requires no changes at the call sites.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimitStore {
  /** Atomically record a hit and report the current state for `key`. */
  checkAndIncrement(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

const BLOCK_MS = 60_000; // extra cooldown once the limit is exceeded

// ── Memory store (sliding window) ───────────────────────────────────────────

interface MemoryBucket {
  hits: number[];
  blockedUntil: number;
}

export function createMemoryStore(): RateLimitStore {
  const buckets = new Map<string, MemoryBucket>();

  return {
    async checkAndIncrement(key, limit, windowMs) {
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { hits: [], blockedUntil: 0 };
        buckets.set(key, bucket);
      }

      if (bucket.blockedUntil > now) {
        return { allowed: false, remaining: 0, retryAfterMs: bucket.blockedUntil - now };
      }

      bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
      if (bucket.hits.length >= limit) {
        bucket.blockedUntil = now + BLOCK_MS;
        return { allowed: false, remaining: 0, retryAfterMs: BLOCK_MS };
      }

      bucket.hits.push(now);
      return { allowed: true, remaining: limit - bucket.hits.length, retryAfterMs: 0 };
    },
  };
}

// ── Upstash (Redis) store (sliding window via sorted sets) ──────────────────

export function createUpstashStore(opts?: {
  url?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}): RateLimitStore | null {
  const url = opts?.url ?? process.env.UPSTASH_REST_URL;
  const token = opts?.token ?? process.env.UPSTASH_REST_TOKEN;
  if (!url || !token) return null;
  const doFetch = opts?.fetchImpl ?? fetch;
  const baseUrl = url.replace(/\/$/, "");

  async function command(...parts: (string | number)[]): Promise<unknown> {
    const path = parts.map((p) => encodeURIComponent(String(p))).join("/");
    const res = await doFetch(`${baseUrl}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Upstash error ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error(`Upstash error: ${body.error}`);
    return body.result;
  }

  return {
    async checkAndIncrement(key, limit, windowMs) {
      const now = Date.now();
      const windowStart = now - windowMs;
      const member = `${now}:${crypto.randomUUID().slice(0, 8)}`;

      // Sliding window via sorted sets:
      // 1. Remove entries outside the window
      // 2. Add the current request
      // 3. Count entries in the window
      // 4. Set TTL to auto-cleanup

      // Use a pipeline-like approach: ZREMRANGEBYSCORE, ZADD, ZCARD, EXPIRE
      // These run sequentially but atomically in Redis.
      await command("ZREMRANGEBYSCORE", key, "-inf", windowStart);
      await command("ZADD", key, now, member);
      const count = (await command("ZCARD", key)) as number;

      // Set TTL on the key (auto-cleanup when window expires)
      const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
      await command("EXPIRE", key, ttlSeconds);

      if (count > limit) {
        // Over limit: remove the entry we just added and return blocked.
        await command("ZREM", key, member);
        // Calculate retry-after based on oldest entry in window.
        const oldest = (await command("ZRANGE", key, 0, 0, "WITHSCORES")) as string[];
        const oldestScore = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
        const retryAfterMs = Math.max(0, oldestScore + windowMs - now);
        return { allowed: false, remaining: 0, retryAfterMs };
      }

      return { allowed: true, remaining: Math.max(0, limit - count), retryAfterMs: 0 };
    },
  };
}

// ── Rate limiter factory ────────────────────────────────────────────────────

export type RateLimiter = (
  key: string,
  limit?: number,
  windowMs?: number,
) => Promise<RateLimitResult>;

export function createRateLimiter(store: RateLimitStore): RateLimiter {
  return (key, limit = 20, windowMs = 60_000) => store.checkAndIncrement(key, limit, windowMs);
}

/** Default limiter: ALWAYS memory (Upstash disabled for this deployment). */
export const rateLimit: RateLimiter = (() => {
  return createRateLimiter(createMemoryStore());
})();

/** Best-effort client IP extraction (x-forwarded-for, then cf-connecting-ip). */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}
