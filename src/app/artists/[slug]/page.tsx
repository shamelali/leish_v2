import { notFound } from "next/navigation";
import { getArtistBySlug } from "@/lib/actions/artists";
import BookingCalendar from "@/components/booking-calendar";

export default async function ArtistProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rawArtist = await getArtistBySlug(slug);
  // null means "not found" — handled downstream
  const artist = rawArtist
    ? (rawArtist as {
        id: string;
        display_name: string;
        bio: string | null;
        district: string;
        state: string;
        services: Array<{
          id: string;
          name: string;
          price: number;
          duration_minutes: number;
          is_active: boolean;
        }>;
        availability_slots: Array<{
          id: string;
          start_at: string;
          end_at: string;
          is_booked: boolean;
        }>;
        default_deposit_percent: number;
      })
    : null;

  // getArtistBySlug returns null only on a genuine "not found" — any real
  // infra error throws instead, so this is now a trustworthy signal
  // (unlike v1's silent-null pattern which conflated the two cases).
  if (!artist) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">{artist.display_name}</h1>
      <p className="mt-2 text-gray-600">{artist.bio}</p>
      <p className="mt-1 text-sm text-gray-500">
        {artist.district}, {artist.state}
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Services</h2>
        <ul className="mt-3 space-y-2">
          {artist.services
            ?.filter((s: { is_active: boolean }) => s.is_active)
            .map(
              (service: { id: string; name: string; price: number; duration_minutes: number }) => (
                <li key={service.id} className="rounded border p-3">
                  <span className="font-medium">{service.name}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    RM {service.price} · {service.duration_minutes} min
                  </span>
                </li>
              ),
            )}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Book</h2>
        <BookingCalendar
          providerId={artist.id}
          slots={artist.availability_slots ?? []}
          services={artist.services ?? []}
        />
      </section>
    </main>
  );
}
