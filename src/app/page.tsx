import Image from "next/image";
import Link from "next/link";
import { CATEGORIES } from "@/lib/data";
import { listAllArtists } from "@/server/catalog";
import { Button } from "@/components/Button";
import { ArtistCard } from "@/components/ArtistCard";
import { catalogImageSrc } from "@/lib/utils";

// Catalog is DB-backed — render per-request so edits show up immediately.
export const dynamic = "force-dynamic";

const STEPS = [
  {
    step: "01",
    title: "Browse Artists",
    text: "Explore Malaysia's top makeup artists and studios. Filter by style, location, or budget.",
  },
  {
    step: "02",
    title: "Book Instantly",
    text: "Select your date and time, choose your services, and secure your booking with instant confirmation.",
  },
  {
    step: "03",
    title: "Get Glam",
    text: "Relax and let our expert artists work their magic. You'll leave looking and feeling amazing.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "Found my bridal MUA through Leish! three weeks before the wedding. The booking, deposit and timeline all just worked.",
    name: "Nurul Aisyah",
    role: "Bride · Kuala Lumpur",
  },
  {
    quote:
      "As a freelance MUA, the calendar and instant payouts changed how I run my month. My no-show rate dropped to zero.",
    name: "Farah Izzati",
    role: "Professional MUA · Shah Alam",
  },
  {
    quote:
      "We compared six studios in one afternoon instead of twenty DMs. Transparent pricing — no surprises on the day.",
    name: "Dimas & Hana",
    role: "Engagement shoot · Petaling Jaya",
  },
];

const TRUST_POINTS = [
  {
    title: "Verified professionals",
    text: "Every listed artist is identity-checked with real client reviews from completed bookings.",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
        <path
          fillRule="evenodd"
          d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.79 6.8-6.8a1 1 0 011.4 0z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    title: "Secure deposits",
    text: "Pay a fixed booking fee to lock your date. Balance is only due before the event.",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
        <path
          fillRule="evenodd"
          d="M10 1a4.5 4.5 0 00-4.5 4.5V7H4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-1.5V5.5A4.5 4.5 0 0010 1zm3 6V5.5a3 3 0 10-6 0V7h6z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  {
    title: "Free to join",
    text: "Clients book for free. Artists keep their profile, portfolio and calendar at no cost.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
        className="h-5 w-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m8-8a10 10 0 11-20 0 10 10 0 0120 0z"
        />
      </svg>
    ),
  },
];

export default async function HomePage() {
  const artists = await listAllArtists();
  const featured = [...artists].sort((a, b) => b.rating - a.rating).slice(0, 3);

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary-soft via-background to-accent/10" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-surface px-4 py-1.5 text-sm font-medium text-link shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Book Beauty. Anywhere.
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              Your Beauty,
              <br />
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Perfected.
              </span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-ink-muted">
              Discover top-rated makeup artists and studios, check real-time availability, and book
              in minutes.
            </p>

            {/* Social proof */}
            <div className="mt-8 flex items-center gap-3">
              <div className="flex -space-x-2">
                {artists.slice(0, 4).map((a) => (
                  <Image
                    key={a.id}
                    src={catalogImageSrc(a.image)}
                    alt={a.name}
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-full border-2 border-surface object-cover"
                  />
                ))}
              </div>
              <p className="text-sm text-ink-muted">
                <span className="font-semibold text-ink">4.9</span> from{" "}
                <span className="font-semibold text-ink">500+</span> verified reviews
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/artists" size="lg">
                Find &amp; Book Artists
              </Button>
              <Button href="/studios" size="lg" variant="outline">
                Explore Studios
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-[var(--elev-pop)]">
              <Image
                src="/images/hero.jpg"
                alt="Makeup artist perfecting a client's look"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div className="absolute -left-4 bottom-10 hidden rounded-2xl border border-line bg-surface p-4 shadow-[var(--elev-pop)] sm:block">
              <p className="text-xs text-ink-muted">Bridal Makeup</p>
              <p className="mt-1 text-sm font-semibold text-ink">Booked in 3 minutes</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-star">
                  <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
                </svg>
                5.0 · 182 reviews
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust signals ────────────────────────────────── */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          {TRUST_POINTS.map((item) => (
            <div key={item.title} className="flex gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-fg">
                {item.icon}
              </span>
              <div>
                <h3 className="font-semibold text-ink">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-ink-muted">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Categories ───────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-link">Specialties</p>
            <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
              Browse by Category
            </h2>
          </div>
          <Link
            href="/artists"
            className="hidden text-sm font-semibold text-link hover:underline sm:block"
          >
            View All →
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/artists?category=${cat.slug}`}
              className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-inverse shadow-[var(--elev-card)] transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] hover:-translate-y-1 hover:shadow-[var(--elev-card-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Image
                src={cat.image}
                alt={cat.name}
                fill
                sizes="(max-width: 1024px) 50vw, 25vw"
                className="object-cover opacity-90 transition-all duration-500 group-hover:scale-105 group-hover:opacity-70"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <h3 className="text-lg font-semibold text-white">{cat.name}</h3>
                <p className="mt-0.5 text-xs text-white/85">{cat.count} artists</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          {[
            { value: String(artists.length), label: "Artists Onboarding" },
            { value: String(CATEGORIES.length * 3), label: "Beauty Categories" },
            { value: "KL & Selangor", label: "Service Area" },
            { value: "4.9★", label: "Average Rating" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-3xl font-semibold text-ink">{stat.value}</p>
              <p className="mt-1 text-sm text-ink-muted">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Featured artists ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-link">Top Rated</p>
            <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
              Featured Artists
            </h2>
          </div>
          <Link
            href="/artists"
            className="hidden text-sm font-semibold text-link hover:underline sm:block"
          >
            View All →
          </Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section id="how-it-works" className="bg-inverse py-16 text-inverse-fg">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-inverse-accent">
            The Process
          </p>
          <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            How It Works — Get your perfect look in three simple steps
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 transition-colors duration-[var(--dur-fast)] hover:border-primary/60"
              >
                <span className="font-display text-4xl font-semibold text-inverse-accent">
                  {item.step}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-inverse-fg/75">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-link">Social Proof</p>
          <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
            Loved by clients &amp; artists
          </h2>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.name}
              className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-[var(--elev-card)]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="h-6 w-6 text-primary/40"
              >
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
              </svg>
              <blockquote className="mt-4 flex-1 text-sm leading-6 text-ink-muted">
                {t.quote}
              </blockquote>
              <figcaption className="mt-5 border-t border-line pt-4">
                <p className="text-sm font-semibold text-ink">{t.name}</p>
                <p className="text-xs text-ink-muted">{t.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── Join CTA ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--leish-header-from)] to-primary p-8 text-white shadow-[var(--elev-card)]">
            <h3 className="font-display text-2xl font-semibold">Are you a Makeup Artist?</h3>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/85">
              Join Malaysia&apos;s beauty platform. Create your professional profile, showcase your
              portfolio, and start receiving booking requests from clients in your area.
            </p>
            <div className="mt-6">
              <Button
                href="/onboarding"
                variant="secondary"
                className="bg-white text-[color:var(--leish-header-from)] hover:bg-white/90"
              >
                Apply as an Artist
              </Button>
            </div>
          </div>
          <div className="rounded-3xl border border-line bg-surface p-8 shadow-[var(--elev-card)]">
            <h3 className="font-display text-2xl font-semibold text-ink">Ready to Glow?</h3>
            <p className="mt-3 max-w-sm text-sm leading-6 text-ink-muted">
              Join hundreds of happy clients who found their ideal makeup artist through Leish!.
              Book today and experience beauty perfected.
            </p>
            <div className="mt-6">
              <Button href="/artists" variant="outline">
                Browse Artists
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
