import { describe, expect, it } from "vitest";
import { catalogImageSrc, catalogPath, cn, formatRM, pluralize, safeRedirectPath } from "./utils";

describe("cn", () => {
  it("joins truthy classes and skips falsy values", () => {
    expect(cn("a", false, "b", undefined, null, "", "c")).toBe("a b c");
  });

  it("returns an empty string for no classes", () => {
    expect(cn()).toBe("");
  });
});

describe("formatRM", () => {
  it("formats values as MYR with no decimals", () => {
    expect(formatRM(680)).toMatch(/^RM/);
    expect(formatRM(680)).toContain("680");
  });

  it("handles zero and large values", () => {
    expect(formatRM(0)).toContain("0");
    expect(formatRM(2880)).toContain("2,880");
  });
});

describe("pluralize", () => {
  it("uses singular for one and plural otherwise", () => {
    expect(pluralize(1, "artist")).toBe("artist");
    expect(pluralize(2, "artist")).toBe("artists");
  });

  it("supports custom plural forms", () => {
    expect(pluralize(1, "studio", "studios")).toBe("studio");
    expect(pluralize(5, "studio", "studios")).toBe("studios");
  });
});

describe("catalogPath", () => {
  it("prefers slug over id", () => {
    expect(catalogPath("artists", { id: "uuid-1", slug: "aisha-azman" })).toBe(
      "/artists/aisha-azman",
    );
  });

  it("falls back to id when slug is missing", () => {
    expect(catalogPath("studios", { id: "glow-room-cyberjaya" })).toBe(
      "/studios/glow-room-cyberjaya",
    );
  });
});

describe("catalogImageSrc", () => {
  it("returns a fallback for empty or missing src", () => {
    expect(catalogImageSrc("")).toBe("/images/hero.jpg");
    expect(catalogImageSrc(null)).toBe("/images/hero.jpg");
    expect(catalogImageSrc("/images/artist-1.jpg")).toBe("/images/artist-1.jpg");
  });
});

describe("safeRedirectPath", () => {
  it("keeps a same-origin path", () => {
    expect(safeRedirectPath("/dashboard/payouts")).toBe("/dashboard/payouts");
    expect(safeRedirectPath("/bookings/abc/chat?tab=1")).toBe("/bookings/abc/chat?tab=1");
  });

  it("falls back when no target was supplied", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath("")).toBe("/dashboard");
    expect(safeRedirectPath("   ")).toBe("/dashboard");
    expect(safeRedirectPath(null, "/onboarding")).toBe("/onboarding");
  });

  it("refuses off-site targets", () => {
    // Each of these leaves the site once passed to router.push().
    expect(safeRedirectPath("https://evil.example")).toBe("/dashboard");
    expect(safeRedirectPath("//evil.example")).toBe("/dashboard");
    expect(safeRedirectPath("/\\evil.example")).toBe("/dashboard");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("refuses control characters that could smuggle headers", () => {
    expect(safeRedirectPath("/dashboard\r\nSet-Cookie: x=1")).toBe("/dashboard");
  });
});
