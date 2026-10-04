// @vitest-environment node

import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { listAllArtists } from "@/server/catalog";

/**
 * Public catalog route — the e2e suite asserts the no-params contract stays
 * stable (`count` + `artists`), while the backlog change adds `?limit&offset`,
 * `X-Total-Count`, and `pagination` metadata.
 */
describe("GET /api/catalog/artists (paginated)", () => {
  async function get(path = "/api/catalog/artists"): Promise<Response> {
    return GET(new Request(`http://localhost${path}`));
  }

  it("returns the first page plus total count by default", async () => {
    const seeded = await listAllArtists(); // ensure the catalog is seeded
    const res = await get();
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      count: number;
      total: number;
      artists: Array<{ id: string }>;
      pagination: { total: number; limit: number; offset: number; hasMore: boolean };
    };

    expect(body.artists.length).toBeGreaterThan(0);
    expect(body.count).toBe(body.artists.length);
    expect(body.total).toBeGreaterThanOrEqual(seeded.length);
    expect(body.pagination).toEqual({
      total: body.total,
      limit: 50,
      offset: 0,
      hasMore: body.total > body.artists.length,
    });
    expect(res.headers.get("X-Total-Count")).toBe(String(body.total));
  });

  it("honours limit and offset with no overlap between pages", async () => {
    const page1 = (await (await get("/api/catalog/artists?limit=2&offset=0")).json()) as {
      artists: Array<{ id: string }>;
      pagination: { limit: number; offset: number; hasMore: boolean };
    };
    const page2 = (await (await get("/api/catalog/artists?limit=2&offset=2")).json()) as {
      artists: Array<{ id: string }>;
      pagination: { limit: number; offset: number };
    };

    expect(page1.artists.length).toBeLessThanOrEqual(2);
    expect(page1.pagination.limit).toBe(2);
    expect(page1.pagination.offset).toBe(0);
    expect(page2.pagination.offset).toBe(2);

    const page1Ids = new Set(page1.artists.map((a) => a.id));
    for (const artist of page2.artists) {
      expect(page1Ids.has(artist.id)).toBe(false);
    }
  });

  it("clamps limit to the 1..100 range", async () => {
    const high = (await (await get("/api/catalog/artists?limit=999")).json()) as {
      pagination: { limit: number };
    };
    expect(high.pagination.limit).toBe(100);

    const zero = (await (await get("/api/catalog/artists?limit=0")).json()) as {
      pagination: { limit: number };
    };
    expect(zero.pagination.limit).toBe(50);

    const negativeOffset = (await (await get("/api/catalog/artists?offset=-5")).json()) as {
      pagination: { offset: number };
    };
    expect(negativeOffset.pagination.offset).toBe(0);
  });

  it("keeps the legacy `count`/`artists` fields for cached clients", async () => {
    const res = await get("/api/catalog/artists?limit=3");
    const body = (await res.json()) as { count: number; artists: unknown[] };
    expect(body.count).toBe(body.artists.length);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
  });
});
