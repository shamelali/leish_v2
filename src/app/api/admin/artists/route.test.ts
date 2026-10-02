// @vitest-environment node

import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { GET } from "./route";
import { createSessionToken } from "@/server/session";
import { getDb } from "@/server/db";

const ADMIN_ID = `admin-artists-${randomUUID()}`;

beforeAll(async () => {
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, 'admin', 'x:y', ?)",
    )
    .run(ADMIN_ID, `${ADMIN_ID}@test.local`, "Artists Admin", new Date().toISOString());
});

async function adminCookie(): Promise<string> {
  const token = await createSessionToken({
    sub: ADMIN_ID,
    email: `${ADMIN_ID}@test.local`,
    name: "Artists Admin",
    role: "admin",
    jti: randomUUID(),
  });
  return `leish_session=${token}`;
}

function get(path: string, cookie?: string): Promise<Response> {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return GET(new Request(`http://localhost${path}`, { headers }));
}

describe("GET /api/admin/artists (paginated)", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await get("/api/admin/artists");
    expect(res.status).toBe(401);
  });

  it("lists a page with totals and X-Total-Count", async () => {
    const res = await get("/api/admin/artists", await adminCookie());
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      artists: Array<{ id: string; claimedBy: unknown[] }>;
      total: number;
      limit: number;
      offset: number;
      pagination: { total: number; limit: number; offset: number; hasMore: boolean };
    };

    expect(body.artists.length).toBeGreaterThan(0);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
    expect(body.total).toBeGreaterThanOrEqual(body.artists.length);
    expect(body.pagination.total).toBe(body.total);
    expect(body.pagination.hasMore).toBe(body.total > body.artists.length);
    expect(res.headers.get("X-Total-Count")).toBe(String(body.total));

    // Claim metadata is attached to every artist on the page.
    for (const artist of body.artists) {
      expect(Array.isArray(artist.claimedBy)).toBe(true);
    }
  });

  it("paginates without overlap and clamps the limit", async () => {
    const page1 = (await (
      await get("/api/admin/artists?limit=1&offset=0", await adminCookie())
    ).json()) as {
      artists: Array<{ id: string }>;
      pagination: { limit: number; hasMore: boolean };
    };
    const page2 = (await (
      await get("/api/admin/artists?limit=1&offset=1", await adminCookie())
    ).json()) as {
      artists: Array<{ id: string }>;
    };

    expect(page1.artists).toHaveLength(1);
    expect(page1.pagination.limit).toBe(1);
    expect(page2.artists).toHaveLength(1);
    expect(page2.artists[0]!.id).not.toBe(page1.artists[0]!.id);

    const clamped = (await (
      await get("/api/admin/artists?limit=9999", await adminCookie())
    ).json()) as { pagination: { limit: number } };
    expect(clamped.pagination.limit).toBe(200);
  });

  it("only attaches claims belonging to artists on the page", async () => {
    const res = await get("/api/admin/artists?limit=1", await adminCookie());
    const body = (await res.json()) as {
      artists: Array<{ id: string; claimedBy: Array<{ artist_id: string }> }>;
    };
    const [artist] = body.artists;
    expect(artist).toBeDefined();
    for (const claim of artist!.claimedBy) {
      expect(claim.artist_id).toBe(artist!.id);
    }
  });
});
