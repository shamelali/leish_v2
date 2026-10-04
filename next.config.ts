import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // No Content-Security-Policy here on purpose. A static CSP cannot carry a
  // per-request nonce, and shipping one alongside the nonce policy from
  // `src/proxy.ts` emits two CSP headers — the browser enforces *both*, so the
  // stricter nonce-less one wins and every script is blocked. The proxy is the
  // single source of truth; see `src/lib/csp.ts`.
];

const supabasePattern = {
  protocol: "https" as const,
  hostname: "*.supabase.co",
  pathname: "/**" as const,
};
const blobPattern = {
  protocol: "https" as const,
  hostname: "*.public.blob.vercel-storage.com",
  pathname: "/**" as const,
};

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Standalone output is for Docker/self-hosting. Vercel's post-build trace
  // step is incompatible with it (ENOENT .next/next-server.js.nft.json), so
  // only enable it when NOT building on Vercel.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  async headers() {
    if (process.env.NODE_ENV === "development") return [];
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  allowedDevOrigins: ["*.e2b.app"],
  images: {
    remotePatterns: [supabasePattern, blobPattern],
  },
};

export default nextConfig;
