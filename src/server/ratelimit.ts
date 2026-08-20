/** Best-effort client IP extraction (x-forwarded-for, then cf-connecting-ip). */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

// Rate limiter factory
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimitStore {
  checkAndIncrement(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

const BLOCK_MS = 60_000; // extra cooldown once the limit is exceeded

// Memory store (sliding window)
interface MemoryBucket {
  hits: number[];
  blockedUntil: number;
}

export function createMemoryStore(): RateLimitStore {
  const buckets = new Map<string, MemoryBucket>();

  return {
    async checkAndIncrement(key: string, limit: number, windowMs: number) {
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

// Upstash (Redis) store - simplified
export function createUpstashStore() {
  return null; // Requires UPSTASH_REST_URL/TOKEN config
}

// Default limiter: Upstash when configured, otherwise memory
export const rateLimit = (() => {
  const store = createUpstashStore() ?? createMemoryStore();
  return { checkAndIncrement: store.checkAndIncrement };
})();
