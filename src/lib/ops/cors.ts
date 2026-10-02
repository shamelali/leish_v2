/**
 * CORS allowlist for /api/*.
 *
 * Static vercel.json headers can only carry one Access-Control-Allow-Origin
 * value, which blocked the apex domain (leish.my) and preview deployments.
 * Instead we echo the request Origin back when it is allowed.
 *
 * Extra origins can be added with CORS_ALLOWED_ORIGINS or ALLOWED_ORIGINS
 * (comma-separated).
 */

const DEFAULT_ORIGINS = ["https://leish.my", "https://www.leish.my"];

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const rawExtra = [env.CORS_ALLOWED_ORIGINS, env.ALLOWED_ORIGINS].filter(Boolean).join(",");
  const extra = rawExtra
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const list = [...DEFAULT_ORIGINS, ...extra];
  if (env.NODE_ENV === "development") list.push("http://localhost:3000");
  return Array.from(new Set(list));
}

export function isAllowedOrigin(
  origin: string | null,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!origin) return false;
  const normalized = origin.trim().replace(/\/$/, "");
  if (allowedOrigins(env).includes(normalized)) return true;
  // This project's own Vercel preview deployments, e.g.
  // https://leish-git-feature-x-team.vercel.app — only when explicitly enabled.
  const prefix = env.CORS_VERCEL_PREVIEW_PREFIX?.trim();
  if (prefix) {
    try {
      const { protocol, hostname } = new URL(normalized);
      return (
        protocol === "https:" &&
        hostname.startsWith(`${prefix}-`) &&
        hostname.endsWith(".vercel.app")
      );
    } catch {
      return false;
    }
  }
  return false;
}

export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
