// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createForwardingSink } from "./logger";

describe("log forwarding sink", () => {
  it("forwards JSON log lines to the webhook as a batch", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    const sink = createForwardingSink("https://logs.example.com/ingest", fetchMock);

    sink.write('{"level":30,"msg":"first"}\n');
    sink.write('{"level":30,"msg":"second"}\n');
    sink.end();

    await new Promise((r) => setTimeout(r, 150));

    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(init.headers["Content-Type"]).toBe("application/json");
    const batch = JSON.parse(init.body) as Array<{ msg: string }>;
    expect(batch.map((l) => l.msg)).toEqual(["first", "second"]);
  });

  it("skips the fetch when no lines are buffered", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    const sink = createForwardingSink("https://logs.example.com/ingest", fetchMock);
    sink.end();
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
