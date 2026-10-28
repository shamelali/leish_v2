/**
 * Shared pagination helpers for list endpoints.
 *
 * `parsePagination` is the single source of truth for `?limit&offset` parsing
 * across API routes (catalog, admin, bookings). It clamps to sane bounds so a
 * malicious `?limit=1000000` can never turn into an unbounded scan:
 *
 *   - absent / empty / non-numeric / 0 limit → `defaultLimit`
 *   - negative limit                        → 1
 *   - limit above `maxLimit`                → `maxLimit`
 *   - negative / non-numeric offset         → 0
 *
 * `fetchAllPages` is the browser-side counterpart: it walks a paginated list
 * endpoint (following `pagination.hasMore`) so client components that need the
 * complete catalog keep working after the API stops returning every row at
 * once.
 */

/** Default page size when `?limit` is omitted. */
export const DEFAULT_PAGE_SIZE = 20;
/** Default maximum page size. */
export const MAX_PAGE_SIZE = 100;
/** Response header carrying the unpaginated row count. */
export const TOTAL_COUNT_HEADER = "X-Total-Count";

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginationOptions {
  /** Page size used when `?limit` is missing or invalid. Defaults to 20. */
  defaultLimit?: number;
  /** Hard cap for `?limit`. Defaults to 100. */
  maxLimit?: number;
}

/** Minimal shape shared by `URLSearchParams` and `Request`-like objects. */
export interface QueryParams {
  get(name: string): string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toInt(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

/**
 * Parse `?limit` / `?offset` from a query string with clamping. Never throws and
 * always returns positive, bounded values.
 */
export function parsePagination(
  params: QueryParams,
  opts: PaginationOptions = {},
): PaginationParams {
  const maxLimit = Math.max(1, Math.trunc(opts.maxLimit ?? MAX_PAGE_SIZE));
  const defaultLimit = clamp(Math.trunc(opts.defaultLimit ?? DEFAULT_PAGE_SIZE), 1, maxLimit);

  const rawLimit = toInt(params.get("limit"));
  const rawOffset = toInt(params.get("offset"));

  // `limit=0` is treated as "not supplied" (legacy booking-route behaviour).
  const limit = rawLimit === null || rawLimit === 0 ? defaultLimit : clamp(rawLimit, 1, maxLimit);
  const offset = rawOffset === null || rawOffset < 0 ? 0 : rawOffset;

  return { limit, offset };
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** Build the `pagination` object embedded in list responses. */
export function paginationMeta(
  total: number,
  { limit, offset }: PaginationParams,
  returnedCount: number,
): PaginationMeta {
  return { total, limit, offset, hasMore: offset + returnedCount < total };
}

/**
 * Headers for paginated list responses. `X-Total-Count` is exposed to browser
 * callers so client code can render "showing X of Y" without an extra request.
 */
export function paginationHeaders(
  total: number,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    [TOTAL_COUNT_HEADER]: String(total),
    "Access-Control-Expose-Headers": TOTAL_COUNT_HEADER,
    ...extra,
  };
}

// ── Client-side paging ──────────────────────────────────────────────────────

export interface PageSlice<T> {
  items: T[];
  hasMore: boolean;
}

export interface FetchAllPagesOptions {
  /** Rows requested per page. Defaults to 100 (the server-side cap). */
  pageSize?: number;
  /** Safety stop; defaults to 10 pages. */
  maxPages?: number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Walk a paginated list endpoint until the server reports `hasMore: false`.
 *
 * `select` maps the endpoint's JSON body to `{ items, hasMore }` so the helper
 * stays agnostic of the response envelope (e.g. `{ artists, pagination }`).
 * Failures stop the walk and return what was collected — callers should treat
 * the result as best-effort, never as "the catalog is empty".
 */
export async function fetchAllPages<T>(
  baseUrl: string,
  select: (body: unknown) => PageSlice<T>,
  opts: FetchAllPagesOptions = {},
): Promise<T[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const pageSize = Math.max(1, Math.trunc(opts.pageSize ?? MAX_PAGE_SIZE));
  const maxPages = Math.max(1, Math.trunc(opts.maxPages ?? 10));
  const separator = baseUrl.includes("?") ? "&" : "?";
  const all: T[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${separator}limit=${pageSize}&offset=${all.length}`);
    } catch {
      break;
    }
    if (!res.ok) break;

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      break;
    }

    const { items, hasMore } = select(body);
    all.push(...items);
    if (!hasMore || items.length === 0) break;
  }

  return all;
}
