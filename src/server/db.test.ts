// @vitest-environment node

import { describe, expect, it } from "vitest";
import { compilePlaceholders, resolveParams } from "./db";

describe("placeholder translation (sqlite -> pg)", () => {
  it("translates positional ? to $n", () => {
    const c = compilePlaceholders("SELECT * FROM users WHERE id = ? AND role = ?");
    expect(c.sql).toBe("SELECT * FROM users WHERE id = $1 AND role = $2");
    expect(c.usesNamed).toBe(false);
  });

  it("translates @name placeholders to $n in order", () => {
    const c = compilePlaceholders("INSERT INTO users (id, email) VALUES (@id, @email)");
    expect(c.sql).toBe("INSERT INTO users (id, email) VALUES ($1, $2)");
    expect(c.usesNamed).toBe(true);
    expect(c.names).toEqual(["id", "email"]);
  });

  it("leaves SQL without placeholders untouched", () => {
    const c = compilePlaceholders("SELECT 1");
    expect(c.sql).toBe("SELECT 1");
  });

  it("resolves positional params to a plain array", () => {
    const c = compilePlaceholders("SELECT * FROM t WHERE id = ?");
    expect(resolveParams(c, ["abc"])).toEqual(["abc"]);
  });

  it("resolves named-object params in placeholder order", () => {
    const c = compilePlaceholders("INSERT INTO t (a, b) VALUES (@a, @b)");
    expect(resolveParams(c, [{ a: 1, b: 2 }])).toEqual([1, 2]);
  });

  it("maps named params by the SQL's key order, not object order", () => {
    const c = compilePlaceholders("INSERT INTO t (a, b) VALUES (@b, @a)");
    expect(resolveParams(c, [{ a: 1, b: 2 }])).toEqual([2, 1]);
  });
});
