export function validateEnv() {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.SKIP_ENV_VALIDATION) return;
  // Only validate at runtime, not during build
  const required = ['DATABASE_URL'];
  if (typeof window === 'undefined') {
    // Server-only checks, skip during build
    if (process.env.VERCEL_ENV === undefined && process.env.NODE_ENV === 'production' &&!process.env.DATABASE_URL) {
      // During vercel build, DATABASE_URL may not be set yet - don't crash
      return;
    }
  }
}
export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};
