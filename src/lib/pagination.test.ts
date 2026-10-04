// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  fetchAllPages,
  paginationHeaders,
  paginationMeta,
  parsePagination,
} from "./pagination";

describe("parsePagination", () => {
  it("defaults to limit 20 / offset 0", () => {
    expect(parsePagination(new URLSearchParams(""))).toEqual({
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });

  it("honours explicit limit and offset", () => {
    expect(parsePagination(new URLSearchParams("limit=5&offset=10"))).toEqual({
      limit: 5,
      offset: 10,
    });
  });

  it("clamps limit to 1..100 by default", () => {
    expect(parsePagination(new URLSearchParams("limit=0"))).toEqual({
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
    expect(parsePagination(new URLSearchParams("limit=999"))).toEqual({
      limit: MAX_PAGE_SIZE,
      offset: 0,
    });
    // Negative limits clamp to the minimum page size.
    expect(parsePagination(new URLSearchParams("limit=-5"))).toEqual({ limit: 1, offset: 0 });
  });

  it("never returns a negative offset", () => {
    expect(parsePagination(new URLSearchParams("offset=-3"))).toEqual({
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });

  it("falls back to the default for non-numeric or blank values", () => {
    expect(parsePagination(new URLSearchParams("limit=abc&offset=xyz"))).toEqual({
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
    expect(parsePagination(new URLSearchParams("limit=&offset="))).toEqual({
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });

  it("supports per-route defaults and caps (admin uses 50/200)", () => {
    const opts = { defaultLimit: 50, maxLimit: 200 };
    expect(parsePagination(new URLSearchParams(""), opts)).toEqual({ limit: 50, offset: 0 });
    expect(parsePagination(new URLSearchParams("limit=1000"), opts)).toEqual({
      limit: 200,
      offset: 0,
    });
    // A default above the cap is itself clamped.
    expect(parsePagination(new URLSearchParams(""), { defaultLimit: 500, maxLimit: 200 })).toEqual({
      limit: 200,
      offset: 0,
    });
  });

  it("truncates fractional values", () => {
    expect(parsePagination(new URLSearchParams("limit=12.9&offset=3.7"))).toEqual({
      limit: 12,
      offset: 3,
    });
  });
});

describe("paginationMeta", () => {
  it("computes hasMore from the returned row count", () => {
    expect(paginationMeta(120, { limit: 50, offset: 0 }, 50)).toEqual({
      total: 120,
      limit: 50,
      offset: 0,
      hasMore: true,
    });
    expect(paginationMeta(120, { limit: 50, offset: 100 }, 20)).toEqual({
      total: 120,
      limit: 50,
      offset: 100,
      hasMore: false,
    });
  });

  it("reports no more pages for an empty result set", () => {
    expect(paginationMeta(0, { limit: 50, offset: 0 }, 0).hasMore).toBe(false);
  });
});

describe("paginationHeaders", () => {
  it("sets X-Total-Count and exposes it to browser callers", () => {
    expect(paginationHeaders(42, { "Cache-Control": "public" })).toEqual({
      "X-Total-Count": "42",
      "Access-Control-Expose-Headers": "X-Total-Count",
      "Cache-Control": "public",
    });
  });
});

describe("fetchAllPages", () => {
  function jsonResponse(body: unknown, ok = true): Response {
    return { ok, json: async () => body } as unknown as Response;
  }

  it("walks pages until hasMore is false", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [1, 2], pagination: { hasMore: true } }))
      .mockResolvedValueOnce(jsonResponse({ items: [3], pagination: { hasMore: false } }));

    const items = await fetchAllPages(
      "/api/catalog/artists",
      (body) => {
        const b = body as { items: number[]; pagination: { hasMore: boolean } };
        return { items: b.items, hasMore: b.pagination.hasMore };
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch, pageSize: 2 },
    );

    expect(items).toEqual([1, 2, 3]);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, "/api/catalog/artists?limit=2&offset=0");
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "/api/catalog/artists?limit=2&offset=2");
  });

  it("appends pagination params with & when the URL already has a query string", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ items: [], pagination: { hasMore: false } }));

    await fetchAllPages("/api/admin/artists?role=artist", () => ({ items: [], hasMore: false }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledWith("/api/admin/artists?role=artist&limit=100&offset=0");
  });

  it("stops at maxPages even if the server keeps claiming more", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [1], hasMore: true }));

    const items = await fetchAllPages<number>("/api/list", () => ({ items: [1], hasMore: true }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxPages: 3,
      pageSize: 1,
    });

    expect(items).toEqual([1, 1, 1]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("returns what it has when a request fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [1], hasMore: true }))
      .mockResolvedValueOnce(jsonResponse({}, false));

    const items = await fetchAllPages<number>("/api/list", () => ({ items: [1], hasMore: true }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(items).toEqual([1]);
  });

  it("swallows network and JSON errors", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    expect(
      await fetchAllPages("/api/list", () => ({ items: [], hasMore: false }), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).toEqual([]);

    const badJson = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("bad json");
      },
    });
    expect(
      await fetchAllPages("/api/list", () => ({ items: [], hasMore: false }), {
        fetchImpl: badJson as unknown as typeof fetch,
      }),
    ).toEqual([]);
  });

  it("stops when a page returns no items even if hasMore is true", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [], hasMore: true }));
    const items = await fetchAllPages<number>("/api/list", () => ({ items: [], hasMore: true }), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(items).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
