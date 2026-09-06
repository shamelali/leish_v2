import { Writable } from "node:stream";
import pino from "pino";

/**
 * Structured logging with pino.
 * - JSON lines in production, pretty-printed in development.
 * - Level: `LOG_LEVEL` env override, defaults to info.
 * - PII redaction: emails, phone numbers, and sensitive fields are masked.
 * - When `LOG_WEBHOOK_URL` is set, every log line is also forwarded to the
 *   webhook (JSON POST, fire-and-forget with batching). Use it to stream
 *   logs into an observability sink (OTel/DataDog/self-hosted).
 */

type FetchLike = typeof fetch;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\+?\d{9,15}/g;
const SENSITIVE_KEYS = ["password", "token", "secret", "authorization", "cookie", "session"];

function redactPii(value: unknown): unknown {
  if (typeof value === "string") {
    let result = value;
    result = result.replace(EMAIL_RE, (m) => {
      const [local, domain] = m.split("@");
      return `${local[0]}***@${domain}`;
    });
    result = result.replace(PHONE_RE, (m) => {
      if (m.length < 6) return m;
      return m.slice(0, 3) + "***" + m.slice(-2);
    });
    return result;
  }
  if (Array.isArray(value)) {
    return value.map(redactPii);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactPii(v);
      }
    }
    return out;
  }
  return value;
}

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
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    hooks: {
      logMethod(args, method) {
        // Redact PII from all log arguments
        for (let i = 0; i < args.length; i++) {
          if (args[i] && typeof args[i] === "object") {
            args[i] = redactPii(args[i]) as Record<string, unknown>;
          }
        }
        method.apply(this, args);
      },
    },
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
