import Image from "next/image";
import Link from "next/link";
import type { Artist } from "@/lib/types";
import { formatRM } from "@/lib/utils";

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link
      href={`/artists/${artist.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition-shadow hover:shadow-lg hover:shadow-stone-200/60 dark:border-stone-800 dark:bg-stone-900 dark:hover:shadow-stone-950/60"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100 dark:bg-stone-800">
        <Image
          src={artist.image}
          alt={artist.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {artist.verified && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-stone-800 backdrop-blur dark:bg-stone-900/90 dark:text-stone-100">
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
            Verified
          </span>
        )}
        <span className="absolute bottom-3 left-3 rounded-full bg-stone-900/80 px-2.5 py-1 text-xs font-medium text-white backdrop-blur dark:bg-black/70">
          From {formatRM(artist.priceFrom)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-stone-900 group-hover:text-rose-700 dark:text-stone-100 dark:group-hover:text-rose-400">
            {artist.name}
          </h3>
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-stone-800 dark:text-stone-200">
            {artist.rating}
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-amber-400">
              <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
            </svg>
            <span className="font-normal text-stone-400 dark:text-stone-500">
              ({artist.reviewCount})
            </span>
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-stone-500 dark:text-stone-400">
          {artist.tagline}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {artist.specialties.slice(0, 3).map((s, i) => (
            <span
              key={`specialty-${i}`}
              className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300"
            >
              {s}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3.5 w-3.5 text-stone-400 dark:text-stone-500"
          >
            <path
              fillRule="evenodd"
              d="M9.69 18.933l.003.001c.137.088.31.088.447 0l.003-.001c.127-.082 3.143-2.043 4.926-4.686C17.327 12.06 18 9.967 18 8a8 8 0 10-16 0c0 1.967.673 4.06 2.066 6.247 1.783 2.643 4.799 4.604 4.926 4.686h-.302zM10 11a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
          {artist.area}, {artist.state}
        </div>
      </div>
    </Link>
  );
}
