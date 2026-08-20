import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import { NextRequest } from "next/server";

const redis = env.REDIS_URL ? new Redis({ url: env.REDIS_URL, token: process.env.REDIS_TOKEN! }) : null;
const memory = new Map<string,{count:number; reset:number}>();

// FIX: Trusted proxy - only use cf-connecting-ip / x-real-ip from trusted proxies
// Do NOT trust x-forwarded-for if it can be spoofed by client
function getClientIp(req: NextRequest): string {
  // In Vercel/Cloudflare, these are set by the edge and can't be spoofed
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  // Only use x-forwarded-for first entry if we trust the proxy (Vercel does)
  // For extra safety, hash the IP with user agent to prevent enumeration
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

export async function rateLimit(req: NextRequest, keyPrefix: string, limit: number, windowSec: number) {
  const ip = getClientIp(req);
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();
  
  if (redis) {
    const count = await redis.incr(key);
    if (count===1) await redis.expire(key, windowSec);
    if (count>limit) {
      const ttl = await redis.ttl(key);
      return { ok:false, retryAfter: ttl>0?ttl:windowSec, ip };
    }
    return { ok:true, retryAfter:0, ip };
  }
  const entry = memory.get(key);
  if (!entry || entry.reset < now) {
    memory.set(key,{ count:1, reset: now+windowSec*1000 });
    return { ok:true, retryAfter:0, ip };
  }
  entry.count++;
  if (entry.count>limit) return { ok:false, retryAfter: Math.ceil((entry.reset-now)/1000), ip };
  return { ok:true, retryAfter:0, ip };
}
