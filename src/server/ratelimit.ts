/**
 * Rate limiting with pluggable stores.
 *
 * - `createMemoryStore()` — in-process sliding-window buckets. Used when
 *   Upstash is not configured, and as the outage fallback.
 * - `createUpstashStore()` — Redis-backed sliding-window counters via the
 *   Upstash REST API (no SDK needed). Commands are sent as a single
 *   `/pipeline` request so the limiter adds one network round trip, not four.
 * - `createRateLimiter(store)` — returns a `(key, limit, windowMs) => Promise<result>`
 *   function.
 *
 * ## Default limiter
 *
 * `rateLimit` is the instance every API route uses. It selects the Upstash
 * store when `UPSTASH_REDIS_REST_URL`/`_TOKEN` (or the short
 * `UPSTASH_REST_URL`/`_TOKEN`) are set, so limits are shared across all
 * serverless instances; otherwise it keeps buckets in the process heap.
 *
 * If Upstash errors (network, quota, bad credentials), the limiter logs once
 * and falls back to the in-memory store for `UPSTASH_OUTAGE_RETRY_MS` before
 * probing Upstash again — a rate limiter must never turn an outage into 500s.
 *
 * ## Operational note
 *
 * The in-memory fallback keeps its buckets in the process heap. On a
 * serverless host every concurrent instance gets its own Map, so with N warm
 * instances the effective limit is up to N x the configured value. Configure
 * Upstash in production to get a single global window.
 */

import { logger } from "./logger";
import { resolveUpstashCredentials } from "./upstash";

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

/** How long the default limiter stays on the memory fallback after an Upstash error. */
const UPSTASH_OUTAGE_RETRY_MS = 30_000;

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

type RedisCommand = (string | number)[];

export function createUpstashStore(opts?: {
  url?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}): RateLimitStore | null {
  const credentials = resolveUpstashCredentials();
  const url = opts?.url ?? credentials?.url;
  const token = opts?.token ?? credentials?.token;
  if (!url || !token) return null;
  const doFetch = opts?.fetchImpl ?? fetch;
  const baseUrl = url.replace(/\/$/, "");

  /**
   * Run commands in a single Upstash `/pipeline` round trip.
   * https://upstash.com/docs/redis/features/restapi#pipeline
   */
  async function pipeline(commands: RedisCommand[]): Promise<unknown[]> {
    const res = await doFetch(`${baseUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error(`Upstash error ${res.status}`);
    const body = (await res.json()) as Array<{ result?: unknown; error?: string }>;
    if (!Array.isArray(body)) throw new Error("Upstash error: malformed pipeline response");
    for (const entry of body) {
      if (entry?.error) throw new Error(`Upstash error: ${entry.error}`);
    }
    return body.map((entry) => entry?.result);
  }

  return {
    async checkAndIncrement(key, limit, windowMs) {
      const now = Date.now();
      const windowStart = now - windowMs;
      const member = `${now}:${crypto.randomUUID().slice(0, 8)}`;
      const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));

      // Sliding window via sorted sets, one round trip:
      // 1. drop entries outside the window
      // 2. add the current request
      // 3. count entries in the window
      // 4. refresh the key TTL
      const [, , counted] = await pipeline([
        ["ZREMRANGEBYSCORE", key, "-inf", windowStart],
        ["ZADD", key, now, member],
        ["ZCARD", key],
        ["EXPIRE", key, ttlSeconds],
      ]);
      const count = Number(counted ?? 0);

      if (count > limit) {
        // Over limit: undo this request's entry and report when the oldest
        // entry in the window expires.
        const [, oldest] = await pipeline([
          ["ZREM", key, member],
          ["ZRANGE", key, 0, 0, "WITHSCORES"],
        ]);
        const entries = Array.isArray(oldest) ? (oldest as string[]) : [];
        const oldestScore = entries.length >= 2 ? parseInt(entries[1]!, 10) : now;
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

/**
 * Default limiter: Upstash when configured (shared across instances), memory
 * otherwise. Upstash failures degrade to memory for a short cooldown instead of
 * propagating to callers.
 */
function createDefaultLimiter(): RateLimiter {
  const memory = createRateLimiter(createMemoryStore());
  const upstash = createUpstashStore();
  if (!upstash) return memory;

  let disabledUntil = 0;

  return async (key, limit = 20, windowMs = 60_000) => {
    if (Date.now() >= disabledUntil) {
      try {
        return await upstash.checkAndIncrement(key, limit, windowMs);
      } catch (err) {
        disabledUntil = Date.now() + UPSTASH_OUTAGE_RETRY_MS;
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "upstash rate limit store unavailable — using in-memory fallback",
        );
      }
    }
    return memory(key, limit, windowMs);
  };
}

/** Default limiter used by API routes and `statefulRoute`. */
export const rateLimit: RateLimiter = createDefaultLimiter();

/** Best-effort client IP extraction (x-forwarded-for, then cf-connecting-ip). */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}
