/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: { serverActions: { allowedOrigins: ["leish.my"] } },
};
module.exports = nextConfig;
