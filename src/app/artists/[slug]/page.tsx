import { notFound } from "next/navigation";
import Link from "next/link";
import { getArtist, BRIDAL_EVENTS, NON_BRIDAL_EVENTS } from "@/lib/data";
import BookingCalendar from "@/components/booking-calendar";

export default async function ArtistProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Catalog-backed profile (src/lib/data.ts) — the same source the listing
  // pages use, so artist pages need no external DB to render.
  const artist = getArtist(slug);
  if (!artist) notFound();

  const eventTypes = [
    ...BRIDAL_EVENTS.filter((e) => artist.bridal.includes(e.id)),
    ...NON_BRIDAL_EVENTS.filter((e) => artist.nonBridal.includes(e.id)),
  ];

  return (
    <div className="min-h-screen bg-stone-50 py-10 dark:bg-stone-950">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-stone-500">
          <Link href="/artists" className="hover:text-rose-600 dark:hover:text-rose-400">
            Makeup Artists
          </Link>
          <span>/</span>
          <span className="font-medium text-stone-900 dark:text-stone-200">
            {artist.name}
          </span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-3">
          {/* Main profile column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header info */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  {artist.verified && (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 mb-3">
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.8a1 1 0 011.4 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Verified Artist
                    </div>
                  )}
                  <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100 sm:text-4xl">
                    {artist.name}
                  </h1>
                  {artist.tagline && (
                    <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                      {artist.tagline}
                    </p>
                  )}
                  <p className="mt-2 flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-stone-400">
                      <path
                        fillRule="evenodd"
                        d="M9.69 18.933l.003.001c.137.088.31.088.447 0l.003-.001c.127-.082 3.143-2.043 4.926-4.686C17.327 12.06 18 9.967 18 8a8 8 0 10-16 0c0 1.967.673 4.06 2.066 6.247 1.783 2.643 4.799 4.604 4.926 4.686h-.302zM10 11a3 3 0 100-6 3 3 0 000 6z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {artist.area ? `${artist.area}, ` : ""}
                    {artist.state || "Malaysia"}
                  </p>
                </div>
              </div>

              {artist.bio && (
                <div className="mt-6 border-t border-stone-100 pt-6 dark:border-stone-800">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                    About the Artist
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                    {artist.bio}
                  </p>
                </div>
              )}

              {artist.specialties.length > 0 && (
                <div className="mt-6 border-t border-stone-100 pt-6 dark:border-stone-800">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                    Specialties
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {artist.specialties.map((specialty) => (
                      <span
                        key={specialty}
                        className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Services List */}
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
                Services &amp; Rates
              </h2>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                All prices include consultation and touch-up kits.
              </p>

              <div className="mt-6 space-y-4">
                {artist.services.map((service) => (
                  <div
                    key={service.name}
                    className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-stone-100 p-4 hover:border-stone-200 dark:border-stone-800/80 dark:hover:border-stone-700"
                  >
                    <div>
                      <h3 className="font-semibold text-stone-900 dark:text-stone-100">
                        {service.name}
                      </h3>
                      <p className="mt-1 text-xs text-stone-400">Duration: {service.duration}</p>
                    </div>
                    <div className="mt-3 sm:mt-0 text-left sm:text-right">
                      <span className="text-lg font-bold text-rose-600 dark:text-rose-400">
                        RM {service.price}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar Booking Column */}
          <div className="space-y-6">
            <div className="sticky top-20">
              <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 mb-3">
                Book an Appointment
              </h2>
              <BookingCalendar
                artistId={artist.id}
                artistName={artist.name}
                services={artist.services}
                eventTypes={eventTypes}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
