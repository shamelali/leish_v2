import { listAllArtists } from "@/server/catalog";
import ArtistsBrowser from "@/components/ArtistsBrowser";

// Catalog is DB-backed — fetch server-side and hand to the client filter UI.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Browse Makeup Artists",
  description: "Find and book Malaysia's top makeup artists for any occasion.",
};

export default async function ArtistsPage() {
  const artists = await listAllArtists();
  return <ArtistsBrowser artists={artists} />;
}
