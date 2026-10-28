/**
 * Upstash Redis credential resolution — one spelling across the codebase.
 *
 * Two env-var pairs appear in deployments (and in this repo's history):
 *
 *   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
 *     — Upstash's native names, provisioned by the Vercel/Upstash integration.
 *   - `UPSTASH_REST_URL` / `UPSTASH_REST_TOKEN`
 *     — shorter names used by the rate limiter and chat bus.
 *
 * Accepting either pair everywhere means a deployment that only sets one of
 * them can never silently degrade to per-instance behaviour (in-memory rate
 * limits, single-instance chat pub/sub, no catalog cache). The native pair
 * wins when both are present.
 */

export interface UpstashCredentials {
  url: string;
  token: string;
}

type EnvLike = Record<string, string | undefined>;

/**
 * Resolve Upstash credentials from either accepted env-var pair.
 * Returns `null` when neither pair is fully configured.
 */
export function resolveUpstashCredentials(env: EnvLike = process.env): UpstashCredentials | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.UPSTASH_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.UPSTASH_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/** True when Upstash credentials are available under either name. */
export function isUpstashConfigured(env: EnvLike = process.env): boolean {
  return resolveUpstashCredentials(env) !== null;
}
