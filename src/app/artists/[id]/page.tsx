import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ARTISTS, getArtist } from "@/lib/data";
import { formatRM } from "@/lib/utils";
import { Button } from "@/components/Button";
import { RatingStars } from "@/components/RatingStars";

interface Props {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  return ARTISTS.map((a) => ({ id: a.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const artist = getArtist(id);
  if (!artist) return { title: "Artist not found" };
  return {
    title: `${artist.name} — Makeup Artist`,
    description: artist.tagline,
  };
}

export default async function ArtistDetailPage({ params }: Props) {
  const { id } = await params;
  const artist = getArtist(id);
  if (!artist) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-stone-500 dark:text-stone-400">
        <Link href="/artists" className="hover:text-rose-600 dark:hover:text-rose-400">Artists</Link>
        <span className="mx-2">/</span>
        <span className="text-stone-800 dark:text-stone-200">{artist.name}</span>
      </nav>

      {/* Profile header */}
      <div className="mt-6 grid gap-8 lg:grid-cols-[380px_1fr]">
        <div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-stone-100 dark:bg-stone-800">
            <Image
              src={artist.image}
              alt={artist.name}
              fill
              priority
              sizes="380px"
              className="object-cover"
            />
            {artist.verified && (
              <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-stone-800 backdrop-blur dark:bg-stone-900/90 dark:text-stone-100">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400">
                  <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
            <p className="text-sm text-stone-500 dark:text-stone-400">Starting from</p>
            <p className="mt-1 font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">
              {formatRM(artist.priceFrom)}
            </p>
            <div className="mt-4">
              <Button href={`/artists/${artist.id}/book`} className="w-full">
                Request Booking
              </Button>
            </div>
            <p className="mt-3 text-center text-xs text-stone-400 dark:text-stone-500">
              Instant confirmation · Free cancellation up to 48h
            </p>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              {artist.name}
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              {artist.rating} <RatingStars rating={artist.rating} className="!gap-0" />
            </span>
          </div>
          <p className="mt-2 text-lg text-stone-600 dark:text-stone-400">{artist.tagline}</p>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-stone-500 dark:text-stone-400">
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-stone-400 dark:text-stone-500">
                <path fillRule="evenodd" d="M9.69 18.933l.003.001c.137.088.31.088.447 0l.003-.001c.127-.082 3.143-2.043 4.926-4.686C17.327 12.06 18 9.967 18 8a8 8 0 10-16 0c0 1.967.673 4.06 2.066 6.247 1.783 2.643 4.799 4.604 4.926 4.686h-.302zM10 11a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              {artist.area}, {artist.state}
            </span>
            <span>{artist.reviewCount} reviews</span>
            <span>{artist.yearsExperience}+ years experience</span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {artist.specialties.map((s) => (
              <span key={s} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-sm font-medium text-rose-700 dark:border-rose-800/60 dark:bg-rose-500/10 dark:text-rose-400">
                {s}
              </span>
            ))}
          </div>

          {/* Availability */}
          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-800/60 dark:bg-emerald-500/10">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <h2 className="font-semibold text-stone-900 dark:text-stone-100">Available slots</h2>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {artist.availability.map((slot) => (
                <span key={slot} className="rounded-full bg-white px-3.5 py-1.5 text-sm text-stone-700 ring-1 ring-emerald-200 dark:bg-stone-900 dark:text-emerald-100 dark:ring-emerald-800/70">
                  {slot}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">About</h2>
            <p className="mt-3 leading-7 text-stone-600 dark:text-stone-400">{artist.bio}</p>
          </div>
        </div>
      </div>

      {/* Portfolio */}
      <section className="mt-14">
        <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">Portfolio</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {artist.portfolio.map((src, i) => (
            <div key={src} className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-stone-100 dark:bg-stone-800">
              <Image
                src={src}
                alt={`${artist.name} portfolio ${i + 1}`}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover transition-transform duration-500 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="mt-14 grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">Services &amp; Pricing</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
            {artist.services.map((svc, i) => (
              <div
                key={svc.name}
                className={`flex items-center justify-between gap-4 px-5 py-4 ${i > 0 ? "border-t border-stone-100 dark:border-stone-800" : ""}`}
              >
                <div>
                  <p className="font-medium text-stone-900 dark:text-stone-100">{svc.name}</p>
                  <p className="text-sm text-stone-500 dark:text-stone-400">{svc.duration}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-stone-900 dark:text-stone-100">{formatRM(svc.price)}</span>
                  <Link
                    href={`/artists/${artist.id}/book?service=${encodeURIComponent(svc.name)}`}
                    className="rounded-full border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:border-rose-400 hover:text-rose-700 dark:border-stone-700 dark:text-stone-200 dark:hover:border-rose-500 dark:hover:text-rose-400"
                  >
                    Book
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reviews */}
        <div>
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">Reviews</h2>
            <span className="text-sm text-stone-500 dark:text-stone-400">{artist.reviewCount} total</span>
          </div>
          <div className="mt-4 space-y-4">
            {artist.reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-stone-900 dark:text-stone-100">{r.author}</p>
                  <RatingStars rating={r.rating} className="!gap-0 scale-90" />
                </div>
                <p className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">{r.event} · {r.date}</p>
                <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-400">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
