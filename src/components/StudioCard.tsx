import Image from "next/image";
import Link from "next/link";
import type { Studio } from "@/lib/types";
import { catalogImageSrc, catalogPath, formatRM } from "@/lib/utils";
import { RatingStars } from "./RatingStars";

export function StudioCard({ studio }: { studio: Studio }) {
  return (
    <Link
      href={catalogPath("studios", studio)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--elev-card)] transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-1 hover:border-primary/40 hover:shadow-[var(--elev-card-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
        <Image
          src={catalogImageSrc(studio.image)}
          alt={studio.name}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover transition-transform duration-500 ease-[var(--ease-out)] group-hover:scale-105"
        />
        <span className="absolute bottom-3 left-3 rounded-full bg-ink/85 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur dark:bg-black/70">
          From {formatRM(studio.priceFrom)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-lg font-semibold text-ink transition-colors group-hover:text-link">
          {studio.name}
        </h3>
        <div className="mt-1 flex items-center gap-2">
          <RatingStars rating={studio.rating} />
          <span className="text-xs text-ink-muted">
            {studio.rating} ({studio.reviewCount} reviews)
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">{studio.tagline}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {studio.services.slice(0, 3).map((s) => (
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
          {studio.area}, {studio.state}
        </div>
      </div>
    </Link>
  );
}
