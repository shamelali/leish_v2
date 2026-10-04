import Image from "next/image";
import Link from "next/link";
import type { Artist } from "@/lib/types";
import { catalogImageSrc, catalogPath, formatRM } from "@/lib/utils";

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-ink shadow-sm backdrop-blur dark:bg-surface/95 dark:text-ink">
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
      Verified
    </span>
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link
      href={catalogPath("artists", artist)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--elev-card)] transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--elev-card-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-sunken">
        <Image
          src={catalogImageSrc(artist.image)}
          alt={artist.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-105"
        />
        {artist.verified && (
          <span className="absolute left-3 top-3">
            <VerifiedBadge />
          </span>
        )}
        <span className="absolute bottom-3 left-3 rounded-full bg-ink/85 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur dark:bg-black/70">
          From {formatRM(artist.priceFrom)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-ink transition-colors group-hover:text-link">
            {artist.name}
          </h3>
          <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-ink">
            {artist.rating}
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="h-3.5 w-3.5 text-star"
            >
              <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
            </svg>
            <span className="font-normal text-ink-subtle">({artist.reviewCount})</span>
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-muted">{artist.tagline}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {artist.specialties.slice(0, 3).map((s) => (
            <span
              key={s}
              className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary-soft-fg"
            >
              {s}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-1.5 text-xs text-ink-muted">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className="h-3.5 w-3.5 text-ink-subtle"
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
