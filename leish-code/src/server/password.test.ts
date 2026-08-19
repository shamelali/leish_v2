// @vitest-environment node

import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing (scrypt)", () => {
  it("hashes and verifies a correct password", () => {
    const stored = hashPassword("s3cret-password");
    expect(stored).toContain(":");
    expect(verifyPassword("s3cret-password", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("correct-password");
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("produces a unique salt per hash", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("returns false for malformed stored values", () => {
    expect(verifyPassword("x", "not-a-valid-format")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });
});
