// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATHNAME_HEADER } from "@/lib/request-headers";

/**
 * Server-side page guards.
 *
 * The behaviour that matters is the *redirect contract*: anonymous visitors
 * must never receive the authenticated shell, and the return path must be the
 * exact page they asked for. Both are easy to break silently (a wrong fallback
 * just sends people to /dashboard), so they are pinned here.
 */

const state = vi.hoisted(() => ({
  token: null as string | null,
  pathname: null as string | null,
  supabaseUser: null as { id: string } | null,
  row: undefined as { id: string; role: string } | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (state.token ? { value: state.token } : undefined) }),
  headers: async () => new Headers(state.pathname ? { [PATHNAME_HEADER]: state.pathname } : {}),
}));

vi.mock("next/navigation", () => ({
  // `redirect()` throws in Next.js; the error doubles as the assertion target.
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock("@/lib/supabase/auth", () => ({
  getSupabaseUser: async () => state.supabaseUser,
}));

vi.mock("./session", () => ({
  SESSION_COOKIE: "leish_session",
  verifySessionToken: async (token: string) => (token === "valid" ? { sub: "u1" } : null),
}));

vi.mock("./db", () => ({
  getDb: () => ({ prepare: () => ({ get: async () => state.row }) }),
}));

const { getSessionUser, requirePageUser } = await import("./page-auth");

beforeEach(() => {
  state.token = null;
  state.pathname = null;
  state.supabaseUser = null;
  state.row = undefined;
});

describe("getSessionUser", () => {
  it("resolves the user from the JWT session cookie", async () => {
    state.token = "valid";
    state.row = { id: "u1", role: "customer" };

    await expect(getSessionUser()).resolves.toEqual(state.row);
  });

  it("returns null when there is no session cookie", async () => {
    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("returns null for an invalid or expired token", async () => {
    state.token = "forged";

    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("prefers a Supabase (OAuth) session over the JWT cookie", async () => {
    state.supabaseUser = { id: "supabase-1" };
    state.row = { id: "u1", role: "artist" };

    await expect(getSessionUser()).resolves.toEqual(state.row);
  });
});

describe("requirePageUser", () => {
  it("returns the user when signed in", async () => {
    state.token = "valid";
    state.row = { id: "u1", role: "artist" };

    await expect(requirePageUser()).resolves.toEqual(state.row);
  });

  it("redirects anonymous visitors to /login with the exact path", async () => {
    state.pathname = "/dashboard/payouts";

    await expect(requirePageUser()).rejects.toThrow(
      "REDIRECT:/login?redirect=%2Fdashboard%2Fpayouts",
    );
  });

  it("falls back when the proxy did not stamp a pathname", async () => {
    await expect(requirePageUser("/onboarding")).rejects.toThrow(
      "REDIRECT:/login?redirect=%2Fonboarding",
    );
  });
});
