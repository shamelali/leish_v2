export function validateEnv() {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.SKIP_ENV_VALIDATION) return;
  const required = ['DATABASE_URL'];
  if (typeof window === 'undefined') {
    if (process.env.VERCEL_ENV === undefined && process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
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
