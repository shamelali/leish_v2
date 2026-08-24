/**
 * Rate limiting with pluggable stores.
 *
 * - `createMemoryStore()` — in-process sliding-window buckets. Fine for
 *   single-instance deploys and tests.
 * - `createUpstashStore()` — Redis-backed fixed-window counters via the
 *   Upstash REST API (no SDK needed). Used when UPSTASH_REST_URL and
 *   UPSTASH_REST_TOKEN are set; otherwise the default limiter falls back
 *   to memory so local runs never break.
 * - `createRateLimiter(store)` — returns a `(key, limit, windowMs) => Promise<result>`
 *   function. `rateLimit` is the default instance used by API routes.
 *
 * Results include `retryAfterMs` so callers can emit a Retry-After header.
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

// ── Upstash (Redis) store (fixed window) ────────────────────────────────────

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
      const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));

      // Blocked keys carry a :block marker with a TTL.
      const blockTtl = (await command("TTL", `${key}:block`)) as number;
      if (blockTtl > 0) {
        return { allowed: false, remaining: 0, retryAfterMs: blockTtl * 1000 };
      }

      const count = (await command("INCR", key)) as number;
      if (count === 1) {
        await command("EXPIRE", key, ttlSeconds);
      }

      if (count > limit) {
        await command("EXPIRE", `${key}:block`, Math.ceil(BLOCK_MS / 1000));
        return { allowed: false, remaining: 0, retryAfterMs: BLOCK_MS };
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
