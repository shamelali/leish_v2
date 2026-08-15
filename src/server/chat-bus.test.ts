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
});
