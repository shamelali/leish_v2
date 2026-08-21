import Image from "next/image";
import Link from "next/link";
import { ARTISTS, CATEGORIES } from "@/lib/data";
import { Button } from "@/components/Button";
import { ArtistCard } from "@/components/ArtistCard";

export default function HomePage() {
  const featured = [...ARTISTS].sort((a, b) => b.rating - a.rating).slice(0, 3);

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-rose-50 via-stone-50 to-amber-50 dark:from-stone-950 dark:via-stone-950 dark:to-rose-950/40" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-3 py-1 text-sm font-medium text-rose-700 dark:border-rose-800/60 dark:bg-stone-900 dark:text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Book Beauty. Anywhere.
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-stone-900 sm:text-6xl dark:text-stone-100">
              Your Beauty,
              <br />
              <span className="text-rose-600 dark:text-rose-500">Perfected.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-8 text-stone-600 dark:text-stone-400">
              Discover top-rated makeup artists and studios, check real-time availability, and book
              in minutes.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <div className="flex -space-x-2">
                {ARTISTS.slice(0, 4).map((a) => (
                  <Image
                    key={a.id}
                    src={a.image}
                    alt={a.name}
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-full border-2 border-white object-cover dark:border-stone-950"
                  />
                ))}
              </div>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                <span className="font-semibold text-stone-900 dark:text-stone-100">4.9</span> from{" "}
                <span className="font-semibold text-stone-900 dark:text-stone-100">500+</span>{" "}
                reviews
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
            <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Next available: Tomorrow, 10:00 AM
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-2xl shadow-rose-200/50 dark:shadow-black/50">
              <Image
                src="/images/hero.jpg"
                alt="Makeup artist perfecting a client's look"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div className="absolute -left-4 bottom-10 hidden rounded-2xl border border-stone-100 bg-white p-4 shadow-xl sm:block dark:border-stone-800 dark:bg-stone-900">
              <p className="text-xs text-stone-500 dark:text-stone-400">Bridal Makeup</p>
              <p className="mt-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
                Booked in 3 minutes
              </p>
              <div className="mt-2 flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-amber-400">
                  <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
                </svg>
                5.0 · 182 reviews
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Categories ───────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-medium text-rose-600 dark:text-rose-500">Specialties</p>
            <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              Browse by Category
            </h2>
          </div>
          <Link
            href="/artists"
            className="hidden text-sm font-medium text-rose-600 hover:text-rose-700 sm:block dark:text-rose-500 dark:hover:text-rose-400"
          >
            View All →
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.slug}
              href={`/artists?category=${cat.slug}`}
              className="group relative aspect-[4/5] overflow-hidden rounded-2xl bg-stone-900 dark:bg-stone-800"
            >
              <Image
                src={cat.image}
                alt={cat.name}
                fill
                sizes="(max-width: 1024px) 50vw, 25vw"
                className="object-cover opacity-90 transition-all duration-500 group-hover:scale-105 group-hover:opacity-70"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <h3 className="text-lg font-semibold text-white">{cat.name}</h3>
                <p className="mt-0.5 text-xs text-white/80">{cat.count} artists</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────── */}
      <section className="border-y border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          {[
            { value: String(ARTISTS.length), label: "Artists Onboarding" },
            { value: String(CATEGORIES.length * 3), label: "Beauty Categories" },
            { value: "KL & Selangor", label: "Service Area" },
            { value: "4.9★", label: "Average Rating" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Featured artists ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-medium text-rose-600 dark:text-rose-500">Top Rated</p>
            <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              Featured Artists
            </h2>
          </div>
          <Link
            href="/artists"
            className="hidden text-sm font-medium text-rose-600 hover:text-rose-700 sm:block dark:text-rose-500 dark:hover:text-rose-400"
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
      <section id="how-it-works" className="bg-stone-900 py-16 text-white dark:bg-black">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-sm font-medium text-rose-300 dark:text-rose-400">The Process</p>
          <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            How It Works — Get your perfect look in three simple steps
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
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
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-white/10 bg-white/5 p-6 dark:border-white/10 dark:bg-white/5"
              >
                <span className="font-display text-4xl font-semibold text-rose-400">
                  {item.step}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-300">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Join CTA ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-600 to-rose-400 p-8 text-white">
            <h3 className="font-display text-2xl font-semibold">Are you a Makeup Artist?</h3>
            <p className="mt-3 max-w-sm text-sm leading-6 text-rose-50">
              Join Malaysia&apos;s beauty platform. Create your professional profile, showcase your
              portfolio, and start receiving booking requests from clients in your area.
            </p>
            <div className="mt-6">
              <Button
                href="/onboarding"
                variant="secondary"
                className="bg-white text-rose-700 hover:bg-rose-50"
              >
                Apply as an Artist
              </Button>
            </div>
          </div>
          <div className="rounded-3xl border border-stone-200 bg-white p-8 dark:border-stone-800 dark:bg-stone-900">
            <h3 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
              Ready to Glow?
            </h3>
            <p className="mt-3 max-w-sm text-sm leading-6 text-stone-500 dark:text-stone-400">
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
