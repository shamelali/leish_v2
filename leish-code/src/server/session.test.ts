// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

describe("session tokens (JWT)", () => {
  it("signs and verifies a session payload", async () => {
    const token = await createSessionToken({
      sub: "user-1",
      email: "a@b.com",
      name: "Aina",
      role: "customer",
    });
    expect(token.split(".")).toHaveLength(3);

    const payload = await verifySessionToken(token);
    expect(payload).toEqual({
      sub: "user-1",
      email: "a@b.com",
      name: "Aina",
      role: "customer",
    });
  });

  it("returns null for a tampered token", async () => {
    const token = await createSessionToken({
      sub: "u",
      email: "a@b.com",
      name: "A",
      role: "customer",
    });
    const tampered = `${token.slice(0, -4)}xxxx`;
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });
});
