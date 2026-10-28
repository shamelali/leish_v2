import { describe, expect, it } from "vitest";
import { getTurnstileToken, setTurnstileToken } from "./turnstile-token";

describe("turnstile-token", () => {
  it("stores and retrieves the latest Turnstile token", () => {
    expect(getTurnstileToken()).toBeNull();
    setTurnstileToken("tok_123");
    expect(getTurnstileToken()).toBe("tok_123");
    setTurnstileToken(null);
    expect(getTurnstileToken()).toBeNull();
  });
});
