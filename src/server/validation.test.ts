// @vitest-environment node

import { describe, expect, it } from "vitest";
import { bookingSchema, loginSchema, registerSchema } from "./validation";

describe("registerSchema", () => {
  it("accepts a valid registration", () => {
    const result = registerSchema.safeParse({
      name: "Aina Rahman",
      email: "AINA@Example.com ",
      password: "password123",
      role: "customer",
      consent: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("aina@example.com"); // lowercased + trimmed
    }
  });

  it("rejects a short password", () => {
    const result = registerSchema.safeParse({
      name: "Aina",
      email: "a@b.com",
      password: "short",
      role: "customer",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({
      name: "Aina",
      email: "not-an-email",
      password: "password123",
      role: "customer",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown role", () => {
    const result = registerSchema.safeParse({
      name: "Aina",
      email: "a@b.com",
      password: "password123",
      role: "admin",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects missing password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("bookingSchema", () => {
  it("accepts a valid booking", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const result = bookingSchema.safeParse({
      artistId: "aisha-azman",
      service: "Bridal Makeup",
      date: tomorrow,
      time: "10:00 AM",
      notes: "At the venue",
      eventType: "Solemnization",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a past date", () => {
    const result = bookingSchema.safeParse({
      artistId: "aisha-azman",
      service: "Bridal Makeup",
      date: "2020-01-01",
      time: "10:00 AM",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    const result = bookingSchema.safeParse({
      artistId: "aisha-azman",
      service: "Bridal Makeup",
      date: "tomorrow",
      time: "10:00 AM",
    });
    expect(result.success).toBe(false);
  });

  it("defaults notes to an empty string", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const result = bookingSchema.safeParse({
      artistId: "aisha-azman",
      service: "Bridal Makeup",
      date: tomorrow,
      time: "10:00 AM",
      eventType: "Reception",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.notes).toBe("");
  });
});
