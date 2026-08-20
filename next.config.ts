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
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Static security headers (production). The Content-Security-Policy with a
  // per-request nonce is applied in middleware (see src/middleware.ts).
  async headers() {
    if (process.env.NODE_ENV === "development") return [];
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Allow the sandbox preview host (e.g. 3000-<id>.e2b.app) to reach dev
  // resources (HMR) without being blocked as a cross-origin request.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
