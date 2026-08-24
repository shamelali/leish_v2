import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { resolveStudio } from "@/server/catalog";
import { catalogImageSrc, formatRM } from "@/lib/utils";
import { RatingStars } from "@/components/RatingStars";
import { Button } from "@/components/Button";

// Catalog is DB-backed — render per-request.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const studio = await resolveStudio(id);
  if (!studio) return { title: "Studio not found" };
  return { title: studio.name, description: studio.tagline };
}

export default async function StudioDetailPage({ params }: Props) {
  const { id } = await params;
  const studio = await resolveStudio(id);
  if (!studio) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <nav className="text-sm text-stone-500 dark:text-stone-400">
        <Link href="/studios" className="hover:text-rose-600 dark:hover:text-rose-400">
          Studios
        </Link>
        <span className="mx-2">/</span>
        <span className="text-stone-800 dark:text-stone-200">{studio.name}</span>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-stone-100 dark:bg-stone-800">
            <Image
              src={catalogImageSrc(studio.image, "/images/studio-1.jpg")}
              alt={studio.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-cover"
            />
          </div>

          <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            {studio.name}
          </h1>
          <p className="mt-2 text-lg text-stone-600 dark:text-stone-400">{studio.tagline}</p>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-stone-500 dark:text-stone-400">
            <span className="inline-flex items-center gap-1.5">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4 text-stone-400 dark:text-stone-500"
              >
                <path
                  fillRule="evenodd"
                  d="M9.69 18.933l.003.001c.137.088.31.088.447 0l.003-.001c.127-.082 3.143-2.043 4.926-4.686C17.327 12.06 18 9.967 18 8a8 8 0 10-16 0c0 1.967.673 4.06 2.066 6.247 1.783 2.643 4.799 4.604 4.926 4.686h-.302zM10 11a3 3 0 100-6 3 3 0 000 6z"
                  clipRule="evenodd"
                />
              </svg>
              {studio.address}
            </span>
          </div>

          <div className="mt-8">
            <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
              About the studio
            </h2>
            <p className="mt-3 leading-7 text-stone-600 dark:text-stone-400">
              {studio.description}
            </p>
          </div>

          <div className="mt-8">
            <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
              Services
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {studio.services.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 dark:border-rose-800/60 dark:bg-rose-500/10 dark:text-rose-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
          <div className="flex items-center gap-2">
            <RatingStars rating={studio.rating} />
            <span className="text-sm text-stone-600 dark:text-stone-400">
              {studio.rating} · {studio.reviewCount} reviews
            </span>
          </div>
          <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">Starting from</p>
          <p className="font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">
            {formatRM(studio.priceFrom)}
          </p>
          <dl className="mt-5 space-y-3 border-t border-stone-100 pt-5 text-sm dark:border-stone-800">
            <div className="flex justify-between gap-4">
              <dt className="text-stone-500 dark:text-stone-400">Hours</dt>
              <dd className="text-right font-medium text-stone-900 dark:text-stone-100">
                {studio.hours}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-stone-500 dark:text-stone-400">Phone</dt>
              <dd className="font-medium text-stone-900 dark:text-stone-100">{studio.phone}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-stone-500 dark:text-stone-400">Location</dt>
              <dd className="text-right font-medium text-stone-900 dark:text-stone-100">
                {studio.area}, {studio.state}
              </dd>
            </div>
          </dl>
          <div className="mt-6">
            <Button href="/register" className="w-full">
              Book an appointment
            </Button>
          </div>
          <p className="mt-3 text-center text-xs text-stone-400 dark:text-stone-500">
            Demo — appointments require a free account
          </p>
        </aside>
      </div>
    </div>
  );
}
