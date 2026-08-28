import { describe, it, expect, vi, beforeEach } from "vitest";
import * as agnostai from "agnostai";

vi.mock("agnostai", () => ({
  init: vi.fn(),
}));

describe("server/agnost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("initAgnost initializes when AGNOST_ORG_ID is set", async () => {
    vi.stubGlobal("process", {
      ...process,
      env: {
        ...process.env,
        AGNOST_ORG_ID: "test-org-id-123",
        AGNOST_ENDPOINT: "https://api.test.agnost.ai",
      },
    });

    const { initAgnost, isAgnostEnabled } = await import("@/server/agnost");

    initAgnost();

    expect(agnostai.init).toHaveBeenCalledWith("test-org-id-123", {
      endpoint: "https://api.test.agnost.ai",
    });
    expect(isAgnostEnabled()).toBe(true);
  });

  it("initAgnost does not initialize when AGNOST_ORG_ID is missing", async () => {
    vi.stubGlobal("process", {
      ...process,
      env: {
        ...process.env,
        AGNOST_ORG_ID: undefined,
        AGNOST_ENDPOINT: undefined,
      },
    });

    const { initAgnost, isAgnostEnabled } = await import("@/server/agnost");

    initAgnost();

    expect(agnostai.init).not.toHaveBeenCalled();
    expect(isAgnostEnabled()).toBe(false);
  });

  it("initAgnost is idempotent (only initializes once)", async () => {
    vi.stubGlobal("process", {
      ...process,
      env: {
        ...process.env,
        AGNOST_ORG_ID: "test-org-id",
      },
    });

    const { initAgnost } = await import("@/server/agnost");

    initAgnost();
    initAgnost();
    initAgnost();

    expect(agnostai.init).toHaveBeenCalledTimes(1);
  });
});
