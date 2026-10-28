/**
 * Request headers stamped by `src/proxy.ts`.
 *
 * Shared as constants instead of string literals so the proxy (edge-safe, no
 * server imports) and server components cannot drift apart.
 */

/** Current request pathname, forwarded so layouts can build an exact return URL. */
export const PATHNAME_HEADER = "x-leish-pathname";
