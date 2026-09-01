/**
 * Upstash Redis client — singleton, lazy-initialized.
 *
 * Returns null when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are
 * not set, so callers can fall back to direct DB reads without any special
 * checks.  All helpers below short-circuit to `undefined` / no-ops when the
 * client is unavailable.
 */

import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;
let _tried = false;

function getClient(): Redis | null {
  if (_tried) return _redis;
  _tried = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    _redis = new Redis({ url, token });
  } catch {
    _redis = null;
  }
  return _redis;
}

// ── Typed helpers ─────────────────────────────────────────────────────────────

/**
 * Get a cached JSON value. Returns `undefined` on miss or when Redis is
 * unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const r = getClient();
  if (!r) return undefined;
  try {
    const raw = await r.get<string>(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * Store a JSON-serialisable value with a TTL in seconds.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const r = getClient();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), { ex: ttlSeconds });
  } catch {
    // Swallow — cache failures must never break the app.
  }
}

/**
 * Delete one or more keys.
 */
export async function cacheDel(...keys: string[]): Promise<void> {
  const r = getClient();
  if (!r || keys.length === 0) return;
  try {
    await r.del(...keys);
  } catch {
    // Swallow.
  }
}

/**
 * Delete all keys matching a prefix using KEYS.
 * Fine for small keyspaces (catalog cache has <100 keys).
 */
export async function cacheDelPrefix(prefix: string): Promise<void> {
  const r = getClient();
  if (!r) return;
  try {
    const keys = (await r.keys(`${prefix}*`)) as string[];
    if (keys.length > 0) await r.del(...keys);
  } catch {
    // Swallow.
  }
}

/**
 * Return `true` when the Upstash env vars are configured (for diagnostics).
 */
export function isRedisConfigured(): boolean {
  return getClient() !== null;
}
