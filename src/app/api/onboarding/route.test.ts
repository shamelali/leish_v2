// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db";
import { hashPassword } from "@/server/password";
import { createSessionToken } from "@/server/session";
import { getArtistById, getStudioById } from "@/server/catalog";
import { getClaimedProfile } from "@/server/artist-profiles";
import { getClaimedStudioProfile } from "@/server/studio-profiles";

/**
 * Tests for POST /api/onboarding.
 *
 * The invariant under test: a request must never end with a catalog profile
 * that exists but is claimed by nobody. The previous implementation swallowed
 * ALREADY_CLAIMED on the second submission and returned 201, leaving an
 * orphaned public listing — these tests pin the 409 and the row counts so that
 * can't come back quietly.
 */

interface ReportContext {
  route?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// vi.mock factories are hoisted above every other statement, so anything they
// close over has to be hoisted too.
const { reportError, claimArtistSpy, claimStudioSpy } = vi.hoisted(() => ({
  reportError: vi.fn<(err: unknown, context: ReportContext) => Promise<void>>(async () => {}),
  // Claim functions are wrapped as pass-throughs so individual tests can force
  // a race outcome (ALREADY_CLAIMED after the pre-check passed).
  claimArtistSpy: vi.fn<(userId: string, artistId: string) => Promise<unknown>>(),
  claimStudioSpy: vi.fn<(userId: string, studioId: string) => Promise<unknown>>(),
}));

vi.mock("@/server/errors", () => ({
  reportError: (err: unknown, context: ReportContext) => reportError(err, context),
}));

vi.mock("@/server/artist-profiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/artist-profiles")>();
  return {
    ...actual,
    claimArtistProfile: (userId: string, artistId: string) => claimArtistSpy(userId, artistId),
  };
});

vi.mock("@/server/studio-profiles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/studio-profiles")>();
  return {
    ...actual,
    claimStudioProfile: (userId: string, studioId: string) => claimStudioSpy(userId, studioId),
  };
});

const { POST } = await import("./route");

const actualArtistProfiles = await vi.importActual<typeof import("@/server/artist-profiles")>(
  "@/server/artist-profiles",
);
const actualStudioProfiles = await vi.importActual<typeof import("@/server/studio-profiles")>(
  "@/server/studio-profiles",
);

// ── Fixtures ────────────────────────────────────────────────────────────────

async function seedUser(role: "artist" | "studio" | "customer", emailVerified = true) {
  const id = randomUUID();
  await getDb()
    .prepare(
      "INSERT INTO users (id, email, name, role, password, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      `${id}@test.local`,
      "Onboarding Tester",
      role,
      hashPassword("password123"),
      emailVerified ? 1 : 0,
      new Date().toISOString(),
    );
  return id;
}

async function cookieFor(userId: string, role: "artist" | "studio" | "customer") {
  const token = await createSessionToken({
    sub: userId,
    email: `${userId}@test.local`,
    name: "Onboarding Tester",
    role,
    jti: randomUUID(),
  });
  return `leish_session=${token}`;
}

let ipCounter = 0;

function post(body: unknown, cookie?: string, extraHeaders: Record<string, string> = {}) {
  const headers = new Headers({
    "content-type": "application/json",
    // Distinct IP per request so the per-IP limiter doesn't couple tests.
    "x-forwarded-for": `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`,
    ...extraHeaders,
  });
  if (cookie) headers.set("cookie", cookie);
  return POST(
    new Request("http://localhost/api/onboarding", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const artistBody = {
  type: "artist",
  name: "Nadia Rahman",
  phone: "+60123456789",
  state: "Selangor",
  area: "Petaling Jaya",
  priceFrom: 350,
  specialties: ["Bridal", "Soft Glam"],
  yearsExperience: 6,
  portfolioUrl: "https://instagram.com/nadia.mua",
  about: "Soft, luminous bridal looks.",
};

const studioBody = {
  type: "studio",
  name: "Glow House Studio",
  phone: "+60387654321",
  state: "Kuala Lumpur",
  area: "Bangsar",
  priceFrom: 280,
  address: "12 Jalan Bangsar",
  hours: "10am–8pm daily",
  about: "Bright, calm, two makeup stations.",
  description: "Bright, calm, two makeup stations.",
};

async function countRows(table: "artists" | "studios", name: string): Promise<number> {
  const row = (await getDb()
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE name = ?`)
    .get(name)) as { n: number };
  return Number(row.n);
}

async function unclaimedCount(kind: "artist" | "studio", name: string): Promise<number> {
  const sql =
    kind === "artist"
      ? `SELECT COUNT(*) AS n FROM artists a
         LEFT JOIN artist_profiles p ON p.artist_id = a.id
         WHERE a.name = ? AND p.user_id IS NULL`
      : `SELECT COUNT(*) AS n FROM studios s
         LEFT JOIN studio_profiles p ON p.studio_id = s.id
         WHERE s.name = ? AND p.user_id IS NULL`;
  const row = (await getDb().prepare(sql).get(name)) as { n: number };
  return Number(row.n);
}

beforeEach(async () => {
  reportError.mockClear();
  claimArtistSpy.mockReset().mockImplementation(actualArtistProfiles.claimArtistProfile);
  claimStudioSpy.mockReset().mockImplementation(actualStudioProfiles.claimStudioProfile);
  // Only remove rows these tests create; leave the seeded catalog alone.
  await getDb().prepare("DELETE FROM artist_profiles").run();
  await getDb().prepare("DELETE FROM studio_profiles").run();
  await getDb().prepare("DELETE FROM artists WHERE name IN (?, ?)").run(artistBody.name, "Tidy");
  await getDb().prepare("DELETE FROM studios WHERE name = ?").run(studioBody.name);
  await getDb().prepare("DELETE FROM users WHERE email LIKE '%@test.local'").run();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Gates ───────────────────────────────────────────────────────────────────

describe("POST /api/onboarding — gates", () => {
  it("401 without a session", async () => {
    const res = await post(artistBody);
    expect(res.status).toBe(401);
  });

  it("401 when the session's user row no longer exists", async () => {
    const ghost = randomUUID();
    const cookie = await cookieFor(ghost, "artist");
    const res = await post(artistBody, cookie);
    expect(res.status).toBe(401);
  });

  it("403 for customer accounts", async () => {
    const id = await seedUser("customer");
    const res = await post(artistBody, await cookieFor(id, "customer"));
    expect(res.status).toBe(403);
    expect(await countRows("artists", artistBody.name)).toBe(0);
  });

  it("403 for unverified email — same gate as the claim routes", async () => {
    const id = await seedUser("artist", false);
    const res = await post(artistBody, await cookieFor(id, "artist"));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toMatch(/verify your email/i);
    expect(await countRows("artists", artistBody.name)).toBe(0);
  });

  it("403 on a cross-origin request (statefulRoute CSRF)", async () => {
    const id = await seedUser("artist");
    const res = await post(artistBody, await cookieFor(id, "artist"), {
      origin: "https://evil.example",
    });
    expect(res.status).toBe(403);
    expect(await countRows("artists", artistBody.name)).toBe(0);
  });

  it("400 when the body isn't JSON", async () => {
    const id = await seedUser("artist");
    const res = await post("{not json", await cookieFor(id, "artist"));
    expect(res.status).toBe(400);
  });

  it("400 when the payload fails validation", async () => {
    const id = await seedUser("artist");
    const res = await post({ ...artistBody, name: "N" }, await cookieFor(id, "artist"));
    expect(res.status).toBe(400);
    expect(await countRows("artists", artistBody.name)).toBe(0);
  });

  it("400 when type does not match the account role", async () => {
    const id = await seedUser("artist");
    const res = await post({ ...studioBody }, await cookieFor(id, "artist"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/account role is artist/);
    expect(await countRows("studios", studioBody.name)).toBe(0);
  });

  it("429 after the per-IP limit, before any profile is created", async () => {
    const id = await seedUser("artist");
    const cookie = await cookieFor(id, "artist");
    const ip = "203.0.113.77";
    // Use an invalid body so the earlier calls fail validation and create
    // nothing; only the limiter is under test here.
    let last: Response | undefined;
    for (let i = 0; i < 6; i++) {
      last = await post({ ...artistBody, name: "N" }, cookie, { "x-forwarded-for": ip });
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("retry-after")).toBeTruthy();
    expect(await countRows("artists", artistBody.name)).toBe(0);
  });
});

// ── Happy paths ─────────────────────────────────────────────────────────────

describe("POST /api/onboarding — artist", () => {
  it("creates the profile with every submitted field and claims it", async () => {
    const id = await seedUser("artist");
    const res = await post(artistBody, await cookieFor(id, "artist"));
    expect(res.status).toBe(201);

    const body = (await res.json()) as { ok: true; type: string; id: string; slug: string };
    expect(body.type).toBe("artist");
    expect(body.slug).toBe("nadia-rahman");

    const artist = await getArtistById(body.id);
    expect(artist).not.toBeNull();
    expect(artist!.name).toBe("Nadia Rahman");
    expect(artist!.bio).toBe(artistBody.about);
    expect(artist!.state).toBe("Selangor");
    expect(artist!.area).toBe("Petaling Jaya");
    expect(artist!.priceFrom).toBe(350);
    expect(artist!.specialties).toEqual(["Bridal", "Soft Glam"]);
    expect(artist!.yearsExperience).toBe(6);
    expect(artist!.portfolio).toEqual(["https://instagram.com/nadia.mua"]);
    // Applicants are never auto-verified; the badge is an admin decision.
    expect(artist!.verified).toBe(false);

    const claim = await getClaimedProfile(id);
    expect(claim?.artist_id).toBe(body.id);
    expect(await unclaimedCount("artist", artistBody.name)).toBe(0);
  });

  it("tolerates an empty portfolio URL and no price", async () => {
    const id = await seedUser("artist");
    const rest: Partial<typeof artistBody> = { ...artistBody };
    delete rest.priceFrom;
    const res = await post({ ...rest, portfolioUrl: "" }, await cookieFor(id, "artist"));
    expect(res.status).toBe(201);
    const { id: artistId } = (await res.json()) as { id: string };
    const artist = await getArtistById(artistId);
    expect(artist!.portfolio).toEqual([]);
    expect(artist!.priceFrom).toBe(0);
  });
});

describe("POST /api/onboarding — studio", () => {
  it("creates the studio with every submitted field and claims it", async () => {
    const id = await seedUser("studio");
    const res = await post(studioBody, await cookieFor(id, "studio"));
    expect(res.status).toBe(201);

    const body = (await res.json()) as { ok: true; type: string; id: string; slug: string };
    expect(body.type).toBe("studio");
    expect(body.slug).toBe("glow-house-studio");

    const studio = await getStudioById(body.id);
    expect(studio).not.toBeNull();
    expect(studio!.name).toBe("Glow House Studio");
    expect(studio!.description).toBe(studioBody.description);
    expect(studio!.address).toBe("12 Jalan Bangsar");
    expect(studio!.hours).toBe("10am–8pm daily");
    expect(studio!.phone).toBe("+60387654321");
    expect(studio!.priceFrom).toBe(280);

    const claim = await getClaimedStudioProfile(id);
    expect(claim?.studio_id).toBe(body.id);
    expect(await unclaimedCount("studio", studioBody.name)).toBe(0);
  });

  it("falls back to `about` when `description` is absent", async () => {
    const id = await seedUser("studio");
    const rest: Partial<typeof studioBody> = { ...studioBody };
    delete rest.description;
    const res = await post(rest, await cookieFor(id, "studio"));
    expect(res.status).toBe(201);
    const { id: studioId } = (await res.json()) as { id: string };
    expect((await getStudioById(studioId))!.description).toBe(studioBody.about);
  });
});

// ── The bug: second submission ──────────────────────────────────────────────

describe("POST /api/onboarding — repeat submission", () => {
  it("artist: 409 with the existing id, and no second profile is created", async () => {
    const id = await seedUser("artist");
    const cookie = await cookieFor(id, "artist");

    const first = await post(artistBody, cookie);
    expect(first.status).toBe(201);
    const { id: firstId } = (await first.json()) as { id: string };

    const second = await post({ ...artistBody, name: "Nadia Rahman" }, cookie);
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: string; id?: string };
    expect(body.error).toMatch(/already claimed/i);
    expect(body.id).toBe(firstId);

    expect(await countRows("artists", artistBody.name)).toBe(1);
    expect(await unclaimedCount("artist", artistBody.name)).toBe(0);
    expect((await getClaimedProfile(id))?.artist_id).toBe(firstId);
    // The pre-check short-circuits; the catalog was never touched.
    expect(claimArtistSpy).toHaveBeenCalledTimes(1);
  });

  it("studio: 409 with the existing id, and no second profile is created", async () => {
    const id = await seedUser("studio");
    const cookie = await cookieFor(id, "studio");

    const first = await post(studioBody, cookie);
    expect(first.status).toBe(201);
    const { id: firstId } = (await first.json()) as { id: string };

    const second = await post(studioBody, cookie);
    expect(second.status).toBe(409);
    expect(((await second.json()) as { id?: string }).id).toBe(firstId);

    expect(await countRows("studios", studioBody.name)).toBe(1);
    expect(await unclaimedCount("studio", studioBody.name)).toBe(0);
  });

  it("an artist who already claimed a *catalog* artist gets 409 too", async () => {
    const id = await seedUser("artist");
    await getArtistById("aisha-azman"); // ensure seeded
    await actualArtistProfiles.claimArtistProfile(id, "aisha-azman");

    const res = await post(artistBody, await cookieFor(id, "artist"));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { id?: string }).id).toBe("aisha-azman");
    expect(await countRows("artists", artistBody.name)).toBe(0);
  });
});

// ── Race: the pre-check passed but the claim still collided ─────────────────

describe("POST /api/onboarding — claim race", () => {
  it("artist: rolls back the new profile and returns 409 (never 201)", async () => {
    const id = await seedUser("artist");
    const cookie = await cookieFor(id, "artist");

    // Simulate a concurrent submission winning between the pre-check and the
    // claim: the first claim call inserts a claim for a *different* artist as
    // the same user, then reports ALREADY_CLAIMED for ours.
    await getArtistById("aisha-azman");
    claimArtistSpy.mockImplementationOnce(async (userId: string) => {
      await actualArtistProfiles.claimArtistProfile(userId, "aisha-azman");
      throw new Error("ALREADY_CLAIMED");
    });

    const res = await post(artistBody, cookie);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; id?: string };
    expect(body.error).toMatch(/already claimed/i);
    expect(body.id).toBe("aisha-azman");

    // The profile we created for this request must be gone.
    expect(await countRows("artists", artistBody.name)).toBe(0);
    expect(await unclaimedCount("artist", artistBody.name)).toBe(0);
    // Clean rollback → nothing to alert on.
    expect(reportError).not.toHaveBeenCalled();
  });

  it("studio: rolls back the new profile and returns 409 (never 201)", async () => {
    const id = await seedUser("studio");
    const cookie = await cookieFor(id, "studio");

    await getStudioById("glow-room-cyberjaya");
    claimStudioSpy.mockImplementationOnce(async (userId: string) => {
      await actualStudioProfiles.claimStudioProfile(userId, "glow-room-cyberjaya");
      throw new Error("ALREADY_CLAIMED");
    });

    const res = await post(studioBody, cookie);
    expect(res.status).toBe(409);
    expect(await countRows("studios", studioBody.name)).toBe(0);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("a non-claim error rolls back the profile and surfaces as a 500", async () => {
    const id = await seedUser("artist");
    claimArtistSpy.mockImplementationOnce(async () => {
      throw new Error("connection reset");
    });

    const res = await post(artistBody, await cookieFor(id, "artist"));
    expect(res.status).toBe(500);
    expect(await countRows("artists", artistBody.name)).toBe(0);
    // tryRoute reports the underlying error; the rollback itself was clean.
    expect(reportError).toHaveBeenCalledTimes(1);
    expect((reportError.mock.calls[0]?.[0] as Error).message).toBe("connection reset");
  });

  it("alerts when the rollback itself fails, so the orphan gets cleaned up", async () => {
    const id = await seedUser("artist");
    const catalog = await import("@/server/catalog");
    vi.spyOn(catalog, "deleteArtist").mockRejectedValueOnce(new Error("db gone"));
    await getArtistById("aisha-azman");
    claimArtistSpy.mockImplementationOnce(async (userId: string) => {
      await actualArtistProfiles.claimArtistProfile(userId, "aisha-azman");
      throw new Error("ALREADY_CLAIMED");
    });

    const res = await post(artistBody, await cookieFor(id, "artist"));
    expect(res.status).toBe(409);

    expect(reportError).toHaveBeenCalledTimes(1);
    const [err, ctx] = reportError.mock.calls[0]!;
    expect((err as Error).message).toBe("db gone");
    expect(ctx.route).toBe("POST /api/onboarding");
    expect(ctx.userId).toBe(id);
    expect(ctx.metadata?.reason).toBe("orphaned_artist_profile");
    expect(typeof ctx.metadata?.artistId).toBe("string");
  });
});
