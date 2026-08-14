"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth, ROLE_LABELS } from "@/lib/auth";
import { ARTISTS } from "@/lib/data";
import { formatRM } from "@/lib/utils";
import { Button } from "@/components/Button";

const MOCK_APPOINTMENTS = [
  {
    id: "appt-1",
    artist: ARTISTS[0],
    service: "Solemnization Makeup",
    date: "Sat, 22 Aug 2026",
    time: "10:00 AM",
    status: "Confirmed",
    price: 580,
  },
  {
    id: "appt-2",
    artist: ARTISTS[1],
    service: "Graduation Makeup",
    date: "Sun, 6 Sep 2026",
    time: "2:00 PM",
    status: "Pending",
    price: 350,
  },
];

export default function DashboardPage() {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <span className="text-5xl">🔐</span>
        <h1 className="mt-6 font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">Please sign in</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-400">
          Log in to manage your appointments, favorites, and profile.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button href="/login?redirect=%2Fdashboard">Log in</Button>
          <Button href="/register" variant="outline">Sign up free</Button>
        </div>
      </div>
    );
  }

  const isArtist = user.role === "artist";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-rose-600 dark:text-rose-500">Dashboard</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            Hi, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="mt-2 text-stone-500 dark:text-stone-400">
            Signed in as <span className="font-medium text-stone-700 dark:text-stone-200">{ROLE_LABELS[user.role]}</span>
            {" "}({user.email})
          </p>
        </div>
        <Button variant="outline" onClick={logout}>Log out</Button>
      </div>

      {/* Role-specific quick actions */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {isArtist ? (
          <>
            <QuickAction icon="🎨" title="Update profile" text="Edit portfolio, services & pricing" href="/onboarding" />
            <QuickAction icon="📅" title="Booking requests" text="Review and confirm incoming requests" href="#" />
            <QuickAction icon="📊" title="Earnings" text="Track income from completed bookings" href="#" />
          </>
        ) : (
          <>
            <QuickAction icon="✨" title="Find artists" text="Browse top-rated MUAs near you" href="/artists" />
            <QuickAction icon="💄" title="Explore studios" text="Discover premium beauty studios" href="/studios" />
            <QuickAction icon="❤️" title="Favorites" text="Your saved artists & studios" href="#" />
          </>
        )}
      </div>

      {/* Appointments */}
      <section className="mt-12">
        <h2 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          {isArtist ? "Booking requests" : "Upcoming appointments"}
        </h2>
        <div className="mt-4 space-y-4">
          {MOCK_APPOINTMENTS.map((appt) => (
            <div key={appt.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
              <Image
                src={appt.artist.image}
                alt={appt.artist.name}
                width={56}
                height={56}
                className="h-14 w-14 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-900 dark:text-stone-100">{appt.artist.name}</p>
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  {appt.service} · {formatRM(appt.price)}
                </p>
              </div>
              <div className="text-sm text-stone-600 dark:text-stone-400">
                <p className="font-medium text-stone-800 dark:text-stone-200">{appt.date}</p>
                <p>{appt.time}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  appt.status === "Confirmed"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                }`}
              >
                {appt.status}
              </span>
              <Link
                href={`/artists/${appt.artist.id}`}
                className="text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-500 dark:hover:text-rose-400"
              >
                View →
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-stone-400 dark:text-stone-500">Demo data shown for illustration.</p>
      </section>
    </div>
  );
}

function QuickAction({
  icon,
  title,
  text,
  href,
}: {
  icon: string;
  title: string;
  text: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-stone-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900"
    >
      <span className="text-2xl">{icon}</span>
      <p className="mt-3 font-semibold text-stone-900 dark:text-stone-100">{title}</p>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{text}</p>
    </Link>
  );
}
