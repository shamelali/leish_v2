// @vitest-environment node

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createSessionToken, verifySessionToken, revokeSession } from "./session";
import { getDb } from "./db";

async function seedUser(id: string) {
  const db = getDb();
  await db
    .prepare(
      "INSERT INTO users (id, email, name, role, password, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(id, `${id}@test.local`, "Test", "customer", "x:y", new Date().toISOString());
}

describe("session tokens (JWT)", () => {
  it("signs and verifies a session payload", async () => {
    const jti = randomUUID();
    const token = await createSessionToken({
      sub: "user-1",
      email: "a@b.com",
      name: "Aina",
      role: "customer",
      jti,
    });
    expect(token.split(".")).toHaveLength(3);

    const payload = await verifySessionToken(token);
    expect(payload).toEqual({
      sub: "user-1",
      email: "a@b.com",
      name: "Aina",
      role: "customer",
      jti,
    });
  });

  it("returns null for a tampered token", async () => {
    const token = await createSessionToken({
      sub: "u",
      email: "a@b.com",
      name: "A",
      role: "customer",
      jti: randomUUID(),
    });
    const tampered = `${token.slice(0, -4)}xxxx`;
    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();
    expect(await verifySessionToken("")).toBeNull();
  });

  it("returns null once the session is revoked", async () => {
    await seedUser("user-revoke");
    const jti = randomUUID();
    const token = await createSessionToken({
      sub: "user-revoke",
      email: "r@b.com",
      name: "Rev",
      role: "customer",
      jti,
    });
    expect(await verifySessionToken(token)).not.toBeNull();

    await revokeSession(jti);
    expect(await verifySessionToken(token)).toBeNull();
  });
});
