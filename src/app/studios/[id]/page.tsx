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
      <nav aria-label="Breadcrumb" className="text-sm text-ink-muted">
        <Link href="/studios" className="transition-colors hover:text-link">
          Studios
        </Link>
        <span aria-hidden="true" className="mx-2 text-ink-subtle">
          /
        </span>
        <span className="font-medium text-ink">{studio.name}</span>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-surface-sunken shadow-[var(--elev-card)]">
            <Image
              src={catalogImageSrc(studio.image, "/images/studio-1.jpg")}
              alt={studio.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-cover"
            />
          </div>

          <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-ink">
            {studio.name}
          </h1>
          <p className="mt-2 text-lg text-ink-muted">{studio.tagline}</p>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
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
              {studio.address}
            </span>
          </div>

          <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-[var(--elev-card)]">
            <h2 className="font-display text-2xl font-semibold text-ink">About the studio</h2>
            <p className="mt-3 leading-7 text-ink-muted">{studio.description}</p>
          </div>

          <div className="mt-8">
            <h2 className="font-display text-2xl font-semibold text-ink">Services</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {studio.services.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-primary/25 bg-primary-soft px-3 py-1.5 text-sm font-medium text-primary-soft-fg"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        <aside className="h-fit rounded-2xl border border-line bg-surface p-6 shadow-[var(--elev-card)] lg:sticky lg:top-20">
          <div className="flex items-center gap-2">
            <RatingStars rating={studio.rating} />
            <span className="text-sm text-ink-muted">
              {studio.rating} · {studio.reviewCount} reviews
            </span>
          </div>
          <p className="mt-4 text-sm text-ink-muted">Starting from</p>
          <p className="font-display text-3xl font-semibold text-ink">
            {formatRM(studio.priceFrom)}
          </p>
          <dl className="mt-5 space-y-3 border-t border-line pt-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Hours</dt>
              <dd className="text-right font-medium text-ink">{studio.hours}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Phone</dt>
              <dd className="font-medium text-ink">{studio.phone}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Location</dt>
              <dd className="text-right font-medium text-ink">
                {studio.area}, {studio.state}
              </dd>
            </div>
          </dl>
          <div className="mt-6">
            <Button href="/register" className="w-full">
              Book an appointment
            </Button>
          </div>
          <p className="mt-3 text-center text-xs text-ink-subtle">
            Demo — appointments require a free account
          </p>
        </aside>
      </div>
    </div>
  );
}
