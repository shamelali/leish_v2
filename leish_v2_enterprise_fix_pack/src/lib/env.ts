import { z } from "zod";
const envSchema = z.object({
  NODE_ENV: z.enum(["development","production","test"]).default("development"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be >=32 chars").refine(v => process.env.NODE_ENV !== "production" || v.length >= 32),
  DATABASE_URL: z.string().url().optional(),
  LEISH_DB_PATH: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  BILLPLZ_API_KEY: z.string().optional(),
  BILLPLZ_COLLECTION_ID: z.string().optional(),
  BILLPLZ_X_SIGNATURE: z.string().min(10).optional(),
  EMAIL_PROVIDER: z.enum(["dev","resend"]).default("dev"),
  RESEND_API_KEY: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
  REDIS_TOKEN: z.string().optional(),
  PASSWORD_PEPPER: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(["fatal","error","warn","info","debug","trace"]).default("info"),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid ENV - fix .env.local");
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
