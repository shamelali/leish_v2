import { notFound } from "next/navigation";
import Link from "next/link";
import { BRIDAL_EVENTS, NON_BRIDAL_EVENTS } from "@/lib/data";
import { listEntityReviews, resolveArtist } from "@/server/catalog";
import { getBookingFeeSen } from "@/server/settings";
import { RatingStars } from "@/components/RatingStars";
import BookingCalendar from "@/components/booking-calendar";

// Catalog is DB-backed — render per-request.
export const dynamic = "force-dynamic";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-muted">{children}</h2>
  );
}

export default async function ArtistProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // DB-backed catalog profile (seeded from src/lib/data.ts). Slugs match the
  // original catalog ids, so existing links/bookings keep working.
  // Slug first (pretty URLs), then id — seeded artists have slug === id,
  // admin-created ones have a UUID id and a separate slug.
  const artist = await resolveArtist(slug);
  if (!artist) notFound();

  const reviews = await listEntityReviews("artist", artist.id);
  const bookingFeeSen = await getBookingFeeSen();

  const eventTypes = [
    ...BRIDAL_EVENTS.filter((e) => artist.bridal.includes(e.id)),
    ...NON_BRIDAL_EVENTS.filter((e) => artist.nonBridal.includes(e.id)),
  ];

  return (
    <div className="min-h-screen py-10">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="mb-6 flex items-center gap-2 text-sm text-ink-muted"
        >
          <Link href="/artists" className="transition-colors hover:text-link">
            Makeup Artists
          </Link>
          <span aria-hidden="true" className="text-ink-subtle">
            /
          </span>
          <span className="font-medium text-ink">{artist.name}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-3">
          {/* Main profile column */}
          <div className="space-y-8 lg:col-span-2">
            {/* Header info */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--elev-card)] sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  {artist.verified && (
                    <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-soft-fg">
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                        className="h-3.5 w-3.5 text-primary"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.8a1 1 0 011.4 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Verified Artist
                    </span>
                  )}
                  <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
                    {artist.name}
                  </h1>
                  {artist.tagline && <p className="mt-1 text-ink-muted">{artist.tagline}</p>}
                  <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      className="h-4 w-4 text-ink-subtle"
                    >
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
                <div className="mt-6 border-t border-line pt-6">
                  <SectionTitle>About the Artist</SectionTitle>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{artist.bio}</p>
                </div>
              )}

              {artist.specialties.length > 0 && (
                <div className="mt-6 border-t border-line pt-6">
                  <SectionTitle>Specialties</SectionTitle>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {artist.specialties.map((specialty) => (
                      <span
                        key={specialty}
                        className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-fg"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Services List */}
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--elev-card)] sm:p-8">
              <h2 className="font-display text-xl font-bold text-ink">Services &amp; Rates</h2>
              <p className="mt-1 text-sm text-ink-muted">
                All prices include consultation and touch-up kits.
              </p>

              <div className="mt-6 space-y-4">
                {artist.services.map((service) => (
                  <div
                    key={service.name}
                    className="flex flex-col rounded-xl border border-line bg-surface p-4 transition-colors duration-[var(--dur-fast)] hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <h3 className="font-semibold text-ink">{service.name}</h3>
                      <p className="mt-1 text-xs text-ink-muted">Duration: {service.duration}</p>
                    </div>
                    <div className="mt-3 text-left sm:mt-0 sm:text-right">
                      <span className="font-display text-lg font-bold text-link">
                        RM {service.price}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reviews */}
            {reviews.length > 0 && (
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--elev-card)] sm:p-8">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-bold text-ink">Reviews</h2>
                  <span className="text-sm text-ink-muted">
                    {artist.rating} · {artist.reviewCount} reviews
                  </span>
                </div>
                <div className="mt-6 space-y-5">
                  {reviews.map((review) => (
                    <div key={review.id} className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <RatingStars rating={review.rating} />
                          <span className="text-sm font-semibold text-ink">{review.author}</span>
                        </div>
                        <span className="text-xs text-ink-muted">
                          {[review.event, review.date].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{review.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Booking Column */}
          <div className="space-y-6">
            <div className="sticky top-20">
              <h2 className="mb-3 font-display text-xl font-bold text-ink">Book an Appointment</h2>
              <BookingCalendar
                artistId={artist.id}
                artistName={artist.name}
                services={artist.services}
                eventTypes={eventTypes}
                bookingFeeSen={bookingFeeSen}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
