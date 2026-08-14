import Image from "next/image";
import Link from "next/link";
import type { Studio } from "@/lib/types";
import { formatRM } from "@/lib/utils";
import { RatingStars } from "./RatingStars";

export function StudioCard({ studio }: { studio: Studio }) {
  return (
    <Link
      href={`/studios/${studio.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition-shadow hover:shadow-lg hover:shadow-stone-200/60 dark:border-stone-800 dark:bg-stone-900 dark:hover:shadow-stone-950/60"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-stone-100 dark:bg-stone-800">
        <Image
          src={studio.image}
          alt={studio.name}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute bottom-3 left-3 rounded-full bg-stone-900/80 px-2.5 py-1 text-xs font-medium text-white backdrop-blur dark:bg-black/70">
          From {formatRM(studio.priceFrom)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold text-stone-900 group-hover:text-rose-700 dark:text-stone-100 dark:group-hover:text-rose-400">
          {studio.name}
        </h3>
        <div className="mt-1 flex items-center gap-2">
          <RatingStars rating={studio.rating} />
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {studio.rating} ({studio.reviewCount} reviews)
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-stone-500 dark:text-stone-400">{studio.tagline}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {studio.services.slice(0, 3).map((s) => (
            <span key={s} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              {s}
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-stone-400 dark:text-stone-500">
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
