import { Writable } from "node:stream";
import pino from "pino";

/**
 * Structured logging with pino.
 * - JSON lines in production, pretty-printed in development.
 * - Level: `LOG_LEVEL` env override, defaults to info.
 * - When `LOG_WEBHOOK_URL` is set, every log line is also forwarded to the
 *   webhook (JSON POST, fire-and-forget with batching). Use it to stream
 *   logs into an observability sink (OTel/DataDog/self-hosted).
 */

type FetchLike = typeof fetch;

export function createForwardingSink(webhookUrl: string, fetchImpl: FetchLike): Writable {
  const buffer: string[] = [];
  let flushing = false;
  let timer: NodeJS.Timeout | null = null;

  async function flush() {
    if (flushing || buffer.length === 0) return;
    flushing = true;
    const batch = buffer.splice(0, 20);
    try {
      await fetchImpl(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: `[${batch.join(",")}]`,
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Sink failures must never affect the request path.
    } finally {
      flushing = false;
      if (buffer.length > 0) void flush();
    }
  }

  return new Writable({
    write(chunk, _enc, cb) {
      const line = chunk.toString().trim();
      process.stdout.write(line + "\n"); // keep normal stdout output
      if (line) {
        buffer.push(line);
        // Debounce so synchronous bursts batch into one request.
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          void flush();
        }, 50);
      }
      cb();
    },
  });
}

export function createLogger(opts?: {
  webhookUrl?: string;
  fetchImpl?: FetchLike;
  level?: string;
}) {
  const webhookUrl = opts?.webhookUrl ?? process.env.LOG_WEBHOOK_URL;
  const fetchImpl = opts?.fetchImpl ?? fetch;

  return pino({
    level: opts?.level ?? process.env.LOG_LEVEL ?? "info",
    base: { service: "leish-api" },
    ...(webhookUrl
      ? { stream: createForwardingSink(webhookUrl, fetchImpl) }
      : {
          transport:
            process.env.NODE_ENV !== "production"
              ? {
                  target: "pino-pretty",
                  options: { colorize: true, translateTime: "HH:MM:ss" },
                }
              : undefined,
        }),
  });
}

export const logger = createLogger();
export default logger;
