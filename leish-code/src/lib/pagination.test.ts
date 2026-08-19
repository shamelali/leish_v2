// @vitest-environment node

import { describe, expect, it } from "vitest";

/** Mirrors the pagination parsing in GET /api/bookings. */
function parsePagination(params: URLSearchParams) {
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 20) || 20, 1), 100);
  const offset = Math.max(Number(params.get("offset") ?? 0) || 0, 0);
  return { limit, offset };
}

describe("pagination parsing", () => {
  it("defaults to limit 20 / offset 0", () => {
    expect(parsePagination(new URLSearchParams(""))).toEqual({ limit: 20, offset: 0 });
  });

  it("honours explicit limit and offset", () => {
    expect(parsePagination(new URLSearchParams("limit=5&offset=10"))).toEqual({
      limit: 5,
      offset: 10,
    });
  });

  it("clamps limit to 1..100", () => {
    expect(parsePagination(new URLSearchParams("limit=0"))).toEqual({ limit: 20, offset: 0 });
    expect(parsePagination(new URLSearchParams("limit=999"))).toEqual({ limit: 100, offset: 0 });
    // Negative limits clamp to the minimum page size.
    expect(parsePagination(new URLSearchParams("limit=-5"))).toEqual({ limit: 1, offset: 0 });
  });

  it("never returns a negative offset", () => {
    expect(parsePagination(new URLSearchParams("offset=-3"))).toEqual({ limit: 20, offset: 0 });
  });
});
