import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
const redis = env.REDIS_URL ? new Redis({ url: env.REDIS_URL, token: process.env.REDIS_TOKEN! }) : null;
const memory = new Map<string,{count:number; reset:number}>();
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const now = Date.now();
  if (redis) {
    const count = await redis.incr(key);
    if (count===1) await redis.expire(key, windowSec);
    if (count>limit) { const ttl = await redis.ttl(key); return { ok:false, retryAfter: ttl>0?ttl:windowSec }; }
    return { ok:true, retryAfter:0 };
  }
  const entry = memory.get(key);
  if (!entry || entry.reset < now) { memory.set(key,{ count:1, reset: now+windowSec*1000 }); return { ok:true, retryAfter:0 }; }
  entry.count++;
  if (entry.count>limit) return { ok:false, retryAfter: Math.ceil((entry.reset-now)/1000) };
  return { ok:true, retryAfter:0 };
}
