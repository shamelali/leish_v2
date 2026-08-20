import { NextRequest, NextResponse } from "next/server";
import { ZodSchema } from "zod";
import { logger } from "@/server/logger";
import { rateLimit } from "@/server/rate-limit";
import { getSession } from "@/server/auth/session";
type Opts<T> = { schema?: ZodSchema<T>; auth?: boolean; roles?: string[]; rateLimit?: { key: string; limit: number; window: number } };
export function apiHandler<T>(fn: (req: NextRequest, ctx: { body?: T; user?: any }) => Promise<NextResponse>, opts: Opts<T> = {}) {
  return async (req: NextRequest, routeCtx?: any) => {
    const requestId = crypto.randomUUID();
    const start = Date.now();
    try {
      if (opts.rateLimit) {
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
        const { ok, retryAfter } = await rateLimit(`${opts.rateLimit.key}:${ip}`, opts.rateLimit.limit, opts.rateLimit.window);
        if (!ok) return NextResponse.json({ error:"Too many requests" }, { status:429, headers:{ "Retry-After": String(retryAfter) } });
      }
      let user = null;
      if (opts.auth) {
        user = await getSession();
        if (!user) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
        if (opts.roles && !opts.roles.includes(user.role)) return NextResponse.json({ error:"Forbidden" }, { status:403 });
      }
      let body: T | undefined;
      if (opts.schema && req.method!=="GET") {
        const json = await req.json().catch(()=> ({}));
        const parsed = opts.schema.safeParse(json);
        if (!parsed.success) return NextResponse.json({ error:"Validation failed", issues: parsed.error.flatten() }, { status:400 });
        body = parsed.data;
      }
      const res = await fn(req, { body, user, ...routeCtx });
      res.headers.set("x-request-id", requestId);
      logger.info({ requestId, path: req.nextUrl.pathname, duration: Date.now()-start, status: res.status });
      return res;
    } catch (e:any) {
      logger.error({ requestId, err:e, path: req.nextUrl.pathname }, "api error");
      return NextResponse.json({ error: process.env.NODE_ENV==="production" ? "Internal error" : e.message, requestId }, { status:500 });
    }
  };
}
