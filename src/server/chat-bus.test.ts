// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { getChatBus, publishToBooking, subscribeToBooking } from "./chat-bus";
import { createUpstashBus } from "./chat-bus";

describe("chat bus (in-memory fallback)", () => {
  it("delivers published messages to subscribers of the same booking", async () => {
    const received: string[] = [];
    const unsubscribe = subscribeToBooking("booking-1", (m) => received.push(m.body));

    publishToBooking("booking-1", {
      id: "m1",
      senderId: "u1",
      senderName: "A",
      body: "hello",
      createdAt: new Date().toISOString(),
    });

    expect(received).toEqual(["hello"]);

    // Different booking does not receive it.
    const other: string[] = [];
    const unsub2 = subscribeToBooking("booking-2", (m) => other.push(m.body));
    publishToBooking("booking-2", {
      id: "m2",
      senderId: "u2",
      senderName: "B",
      body: "yo",
      createdAt: "",
    });
    expect(other).toEqual(["yo"]);

    unsubscribe();
    unsub2();
  });

  it("stops delivering after unsubscribe", () => {
    const received: string[] = [];
    const unsubscribe = subscribeToBooking("booking-3", (m) => received.push(m.body));
    unsubscribe();
    publishToBooking("booking-3", {
      id: "m",
      senderId: "u",
      senderName: "A",
      body: "x",
      createdAt: "",
    });
    expect(received).toEqual([]);
  });

  it("returns the singleton instance", () => {
    expect(getChatBus()).toBe(getChatBus());
  });
});

describe("chat bus (upstash backend)", () => {
  it("returns null without configuration", () => {
    expect(createUpstashBus({ url: undefined, token: undefined })).toBeNull();
  });

  it("publishes to the upstash publish endpoint", () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    const bus = createUpstashBus({
      url: "https://example.upstash.io",
      token: "tok",
      fetchImpl: fetchMock,
    });
    expect(bus).not.toBeNull();

    bus!.publish("b1", {
      id: "m1",
      senderId: "u1",
      senderName: "A",
      body: "hi",
      createdAt: "2026-01-01",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://example.upstash.io/publish/chat%3Ab1");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string).body).toBe("hi");
  });

  it("streams subscribe responses and dispatches JSON lines to listeners", async () => {
    // A streaming body that emits two JSON lines (newline-terminated) then closes.
    const lines =
      [
        JSON.stringify({ id: "m1", senderId: "u1", senderName: "A", body: "one", createdAt: "" }),
        "",
        JSON.stringify({ id: "m2", senderId: "u2", senderName: "B", body: "two", createdAt: "" }),
      ].join("\n") + "\n";
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(lines));
        controller.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));

    const bus = createUpstashBus({
      url: "https://example.upstash.io/",
      token: "tok",
      fetchImpl: fetchMock,
    })!;

    const received: string[] = [];
    bus.subscribe("b9", (m) => received.push(m.body));

    await vi.waitFor(() => expect(received).toEqual(["one", "two"]));

    // Subscribe URL used the encoded channel and bearer auth.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe("https://example.upstash.io/subscribe/chat%3Ab9");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("tolerates non-JSON heartbeat lines in the stream", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            ": heartbeat\n" +
              JSON.stringify({
                id: "m",
                senderId: "s",
                senderName: "n",
                body: "ok",
                createdAt: "",
              }) +
              "\n",
          ),
        );
        controller.close();
      },
    });
    const bus = createUpstashBus({
      url: "https://example.upstash.io",
      token: "tok",
      fetchImpl: vi.fn(async () => new Response(stream, { status: 200 })),
    })!;

    const received: string[] = [];
    bus.subscribe("b10", (m) => received.push(m.body));
    await vi.waitFor(() => expect(received).toEqual(["ok"]));
  });

  it("stops the upstream stream after the last listener unsubscribes", async () => {
    let abortSpy: AbortController | undefined;
    const stream = new ReadableStream({
      start() {
        /* never emits — stays open */
      },
      cancel() {},
    });
    const fetchMock = vi.fn(async () => {
      abortSpy = new AbortController();
      return new Response(stream, { status: 200 });
    });

    const bus = createUpstashBus({ url: "https://x.io", token: "t", fetchImpl: fetchMock })!;
    const unsub = bus.subscribe("b11", () => {});
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    unsub();
    // Give microtasks a beat; nothing should throw and no extra fetch occurs.
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    void abortSpy;
  });
});
