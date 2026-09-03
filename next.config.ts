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
  // Cloudflare Turnstile CSP — must allow challenges.cloudflare.com
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self' 'sha256-OBTN3RiyCV4Bq7dFqZ5a2pAXjnCcCYeTJMO2I/LYKeo=' 'sha256-35cLDmLFwhkossgndXMP8iTa3kLiLccFvfwRJe6XWuM=' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; img-src data: https:; style-src 'self' 'unsafe-inline';",
  },
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
