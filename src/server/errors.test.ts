// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { buildSentryEnvelope, parseSentryDsn, reportError } from "./errors";

describe("parseSentryDsn", () => {
  it("parses a valid DSN", () => {
    const dsn = parseSentryDsn("https://abc123@o123.ingest.sentry.io/4500000000000000");
    expect(dsn).toEqual({
      publicKey: "abc123",
      host: "o123.ingest.sentry.io",
      projectId: "4500000000000000",
    });
  });

  it("returns null for an invalid DSN", () => {
    expect(parseSentryDsn("not-a-dsn")).toBeNull();
    expect(parseSentryDsn("http://key@host/1")).toBeNull(); // https only
  });
});

describe("buildSentryEnvelope", () => {
  it("builds a 3-part envelope with header, item header and event", () => {
    const report = {
      message: "boom",
      route: "/api/test",
      occurredAt: "2026-08-15T00:00:00.000Z",
    };
    const envelope = buildSentryEnvelope("https://key@host/1", report, "a".repeat(32));

    const lines = envelope.split("\n");
    expect(lines).toHaveLength(3);

    const envelopeHeader = JSON.parse(lines[0]);
    expect(envelopeHeader.event_id).toBe("a".repeat(32));
    expect(envelopeHeader.dsn).toBe("https://key@host/1");

    const itemHeader = JSON.parse(lines[1]);
    expect(itemHeader.type).toBe("event");

    const event = JSON.parse(lines[2]);
    expect(event.message).toBe("boom");
    expect(event.extra.route).toBe("/api/test");
    expect(event.platform).toBe("node");
  });
});

describe("reportError", () => {
  it("POSTs a Sentry envelope to the DSN with auth header", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.SENTRY_DSN = "https://sentrykey@sentry.example.com/42";

    await reportError(new Error("test error"), { route: "GET /x" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      RequestInfo | URL,
      RequestInit | undefined,
    ];
    expect(String(url)).toBe("https://sentry.example.com/api/42/envelope/");
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.["Content-Type"]).toBe("application/x-sentry-envelope");
    expect(String(headers?.["X-Sentry-Auth"])).toContain("sentry_key=sentrykey");
    const body = String(init?.body);
    expect(body.split("\n")).toHaveLength(3);

    delete process.env.SENTRY_DSN;
    vi.unstubAllGlobals();
  });

  it("does not fail when the sink is unreachable", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env.SENTRY_DSN = "https://key@host.example/1";

    await expect(reportError(new Error("x"))).resolves.toBeUndefined();

    delete process.env.SENTRY_DSN;
    vi.unstubAllGlobals();
  });
});
