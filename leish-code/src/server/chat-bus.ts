import { EventEmitter } from "node:events";
import { logger } from "./logger";

/**
 * Chat pub/sub used by the SSE live-chat stream.
 *
 * Backends (chosen at first use, based on env):
 * - Upstash Redis (`UPSTASH_REST_URL` + `UPSTASH_REST_TOKEN` set): HTTP
 *   pub/sub — `POST /publish/<channel>` broadcasts, `GET /subscribe/<channel>`
 *   streams events. Works across instances (multi-region / multiple pods).
 * - In-memory EventEmitter: single-instance deployments (local dev, tests,
 *   single Vercel function). Falls back automatically with a warning.
 *
 * Consumers just use subscribeToBooking() / publishToBooking().
 */

export type ChatMessageEvent = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};

interface ChatBus {
  subscribe(bookingId: string, listener: (message: ChatMessageEvent) => void): () => void;
  publish(bookingId: string, message: ChatMessageEvent): void;
}

// ── In-memory backend ───────────────────────────────────────────────────────

export function createMemoryBusForTest(): ChatBus {
  return createMemoryBus();
}

function createMemoryBus(): ChatBus {
  const bus = new EventEmitter();
  bus.setMaxListeners(0); // many concurrent SSE connections are expected
  return {
    subscribe(bookingId, listener) {
      const channel = `chat:${bookingId}`;
      bus.on(channel, listener);
      return () => {
        bus.off(channel, listener);
      };
    },
    publish(bookingId, message) {
      bus.emit(`chat:${bookingId}`, message);
    },
  };
}

// ── Upstash Redis backend ────────────────────────────────────────────────────

export function createUpstashBus(opts?: {
  url?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}): ChatBus | null {
  return createUpstashBusInner(opts);
}

function createUpstashBusInner(opts?: {
  url?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}): ChatBus | null {
  const url = opts?.url ?? process.env.UPSTASH_REST_URL;
  const token = opts?.token ?? process.env.UPSTASH_REST_TOKEN;
  if (!url || !token) return null;
  const doFetch = opts?.fetchImpl ?? fetch;
  const base = url.replace(/\/$/, "");

  const listeners = new Map<string, Set<(m: ChatMessageEvent) => void>>();
  const streams = new Map<string, AbortController>();

  function channelOf(bookingId: string) {
    return `chat:${bookingId}`;
  }

  async function pump(channel: string) {
    const controller = new AbortController();
    streams.set(channel, controller);
    try {
      const res = await doFetch(`${base}/subscribe/${encodeURIComponent(channel)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        logger.warn({ channel, status: res.status }, "upstash subscribe failed");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Upstash pub/sub messages arrive as JSON lines.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed) as ChatMessageEvent;
            listeners.get(channel)?.forEach((fn) => fn(msg));
          } catch {
            // non-JSON heartbeat/comment — ignore
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        logger.warn({ channel, err: (err as Error).message }, "upstash subscribe stream ended");
      }
    } finally {
      streams.delete(channel);
    }
  }

  return {
    subscribe(bookingId, listener) {
      const channel = channelOf(bookingId);
      let set = listeners.get(channel);
      if (!set) {
        set = new Set();
        listeners.set(channel, set);
        void pump(channel); // start streaming
      }
      set.add(listener);
      return () => {
        set?.delete(listener);
        if (set && set.size === 0) {
          listeners.delete(channel);
          streams.get(channel)?.abort();
        }
      };
    },
    publish(bookingId, message) {
      const channel = channelOf(bookingId);
      // Fire-and-forget; failures are logged, not fatal.
      void doFetch(`${base}/publish/${encodeURIComponent(channel)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(message),
      }).catch((err) => {
        logger.warn({ channel, err: (err as Error).message }, "upstash publish failed");
      });
    },
  };
}

// ── Singleton ───────────────────────────────────────────────────────────────

let bus: ChatBus | null = null;

export function getChatBus(): ChatBus {
  if (bus) return bus;
  bus = createUpstashBus() ?? createMemoryBus();
  return bus;
}

export function subscribeToBooking(
  bookingId: string,
  listener: (message: ChatMessageEvent) => void,
): () => void {
  return getChatBus().subscribe(bookingId, listener);
}

export function publishToBooking(bookingId: string, message: ChatMessageEvent) {
  getChatBus().publish(bookingId, message);
}
