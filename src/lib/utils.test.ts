import { describe, expect, it } from "vitest";
import { cn, formatRM, pluralize } from "./utils";

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
