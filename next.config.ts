import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  experimental: { turbopack: {} },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};
export default nextConfig;
