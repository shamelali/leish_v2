import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://leish.my";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/onboarding",
        "/dev",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
