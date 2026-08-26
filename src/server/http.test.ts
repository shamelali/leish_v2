// @vitest-environment node

import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  jsonError,
  readJson,
  tryRoute,
  requestOrigin,
  appOrigin,
  csrf,
  statefulRoute,
} from "./http";

function fakeRequest(
  url = "http://localhost:3000/test",
  headers: Record<string, string> = {},
): Request {
  return new Request(url, { method: "POST", headers });
}

describe("jsonError", () => {
  it("returns a JSON response with the given status", () => {
    const res = jsonError("Not found", 404);
    expect(res.status).toBe(404);
  });

  it("includes the error message in the body", async () => {
    const res = jsonError("Bad request", 400);
    const body = await res.json();
    expect(body).toEqual({ error: "Bad request" });
  });
});

describe("readJson", () => {
  it("parses a valid JSON body", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
      headers: { "Content-Type": "application/json" },
    });
    const result = await readJson<{ name: string }>(req);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.name).toBe("test");
  });

  it("returns an error for invalid JSON", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "not-json",
    });
    const result = await readJson(req);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(400);
  });
});

describe("tryRoute", () => {
  it("passes through a successful handler", async () => {
    const handler = tryRoute(async (req: Request) => {
      void req;
      return NextResponse.json({ ok: true });
    });
    const res = await handler(fakeRequest());
    const body: { ok?: boolean; error?: string } = await res.json();
    expect(body.ok).toBe(true);
  });

  it("catches errors and returns a 500", async () => {
    const handler = tryRoute(async (req: Request) => {
      void req;
      throw new Error("boom");
    });
    const res = await handler(fakeRequest());
    expect(res.status).toBe(500);
    const body: { error?: string } = await res.json();
    expect(body.error).toBe("Something went wrong. Please try again.");
  });

  it("passes context to the error log", async () => {
    const handler = tryRoute(
      async (req: Request) => {
        void req;
        throw new Error("fail");
      },
      { route: "test-route" },
    );
    const res = await handler(fakeRequest());
    expect(res.status).toBe(500);
  });
});

describe("requestOrigin", () => {
  it("returns the origin from x-forwarded-host", () => {
    const req = fakeRequest("http://internal:3000/test", {
      "x-forwarded-host": "leish.my",
      "x-forwarded-proto": "https",
    });
    expect(requestOrigin(req)).toBe("https://leish.my");
  });

  it("falls back to host header", () => {
    const req = fakeRequest("http://localhost:3000/test", {
      host: "leish.my",
    });
    expect(requestOrigin(req)).toBe("http://leish.my");
  });

  it("falls back to request URL", () => {
    const req = fakeRequest("https://leish.my/test");
    expect(requestOrigin(req)).toBe("https://leish.my");
  });

  it("handles missing protocol in forwarded header", () => {
    const req = fakeRequest("http://localhost:3000/test", {
      "x-forwarded-host": "leish.my",
    });
    expect(requestOrigin(req)).toBe("http://leish.my");
  });
});

describe("appOrigin", () => {
  it("uses NEXT_PUBLIC_SITE_URL when set", () => {
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://leish.my";
    try {
      const req = fakeRequest();
      expect(appOrigin(req)).toBe("https://leish.my");
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  });

  it("falls back to requestOrigin when not set", () => {
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      const req = fakeRequest("https://fallback.test/test");
      expect(appOrigin(req)).toBe("https://fallback.test");
    } finally {
      if (original !== undefined) process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  });
});

describe("csrf", () => {
  it("calls the handler when origin matches", async () => {
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    try {
      const handler = csrf(async (req: Request) => {
        void req;
        return NextResponse.json({ done: true });
      });
      const req = fakeRequest("http://localhost:3000/test", {
        origin: "http://localhost:3000",
      });
      const res = await handler(req);
      expect(res.status).toBe(200);
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  });

  it("blocks cross-origin requests", async () => {
    const handler = csrf(async (req: Request) => {
      void req;
      return NextResponse.json({ done: true });
    });
    const req = fakeRequest("http://localhost:3000/test", {
      origin: "https://evil.example.com",
    });
    const res = await handler(req);
    expect(res.status).toBe(403);
  });

  it("allows requests without an origin header", async () => {
    const handler = csrf(async (req: Request) => {
      void req;
      return NextResponse.json({ done: true });
    });
    const req = fakeRequest();
    const res = await handler(req);
    expect(res.status).toBe(200);
  });
});

describe("statefulRoute", () => {
  it("combines tryRoute and csrf", async () => {
    const original = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    try {
      const handler = statefulRoute(async (req: Request) => {
        void req;
        return NextResponse.json({ ok: true });
      });
      const req = fakeRequest("http://localhost:3000/test", {
        origin: "http://localhost:3000",
      });
      const res = await handler(req);
      expect(res.status).toBe(200);
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  });

  it("blocks cross-origin state-changing requests", async () => {
    const handler = statefulRoute(async (req: Request) => {
      void req;
      return NextResponse.json({ ok: true });
    });
    const req = fakeRequest("http://localhost:3000/test", {
      origin: "https://evil.example.com",
    });
    const res = await handler(req);
    expect(res.status).toBe(403);
  });

  it("catches handler errors", async () => {
    const handler = statefulRoute(async (req: Request) => {
      void req;
      throw new Error("crash");
    });
    const req = fakeRequest();
    const res = await handler(req);
    expect(res.status).toBe(500);
  });
});
