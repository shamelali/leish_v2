import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the sandbox preview host (e.g. 3000-<id>.e2b.app) to reach dev
  // resources (HMR) without being blocked as a cross-origin request.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
