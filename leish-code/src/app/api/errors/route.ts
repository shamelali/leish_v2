import { NextResponse } from "next/server";
import { reportError } from "@/server/errors";
import { enforceRateLimit, readJson, tryRoute } from "@/server/http";
import { z } from "zod";

/**
 * POST /api/errors
 * Client-side error ingestion. The browser POSTs sanitized details
 * ({ message, url, stack? }) and they are logged/reported server-side.
 * Rate-limited per IP; never exposes user data.
 */

const clientErrorSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  url: z.string().trim().max(500).optional().default(""),
  stack: z.string().trim().max(8000).optional().default(""),
});

export const POST = tryRoute(
  async function POST(request: Request) {
    const limited = await enforceRateLimit(request, { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const body = await readJson<unknown>(request);
    if (!body.ok) return body.error;

    const parsed = clientErrorSchema.safeParse(body.data);
    if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

    await reportError(new Error(parsed.data.message), {
      metadata: { clientUrl: parsed.data.url },
      stack: parsed.data.stack || undefined,
      route: "client",
    });

    return NextResponse.json({ ok: true });
  },
  { route: "POST /api/errors" },
);
