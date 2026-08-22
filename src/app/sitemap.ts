import type { MetadataRoute } from "next";
import { listAllArtists, listAllStudios } from "@/server/catalog";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://leish.my";

  const staticRoutes = ["", "/artists", "/studios", "/login", "/register", "/onboarding"].map(
    (route) => ({
      url: `${base}${route}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: route === "" ? 1 : 0.8,
    }),
  );

  const [artists, studios] = await Promise.all([listAllArtists(), listAllStudios()]);

  const artistRoutes = artists.map((artist) => ({
    url: `${base}/artists/${artist.id}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  const studioRoutes = studios.map((studio) => ({
    url: `${base}/studios/${studio.id}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...artistRoutes, ...studioRoutes];
}
