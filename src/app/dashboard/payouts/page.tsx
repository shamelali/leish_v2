"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { formatRM } from "@/lib/utils";

interface Payout {
  id: string;
  bookingId: string;
  artistName: string | null;
  service: string;
  eventDate: string;
  grossSen: number;
  commissionSen: number;
  netSen: number;
  status: string;
  settleableAt: string | null;
  settledAt: string | null;
  notes: string | null;
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  settled: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  failed: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

export default function ArtistPayoutsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/me/payouts")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (!cancelled) setPayouts(d.payouts ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const totals = payouts.reduce(
    (acc, p) => {
      acc.net += p.netSen;
      if (p.status === "pending") acc.pending += p.netSen;
      if (p.status === "settled") acc.settled += p.netSen;
      return acc;
    },
    { net: 0, pending: 0, settled: 0 },
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Your Payouts
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Net amounts payable to you (quote total − platform commission − booking deposit).
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-rose-600 hover:text-rose-500 dark:text-rose-400"
        >
          ← Dashboard
        </Link>
      </div>

      {!loading && user && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Total net", value: totals.net },
            { label: "Pending", value: totals.pending },
            { label: "Settled", value: totals.settled },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
                {label}
              </p>
              <p className="mt-1 font-display text-xl font-semibold text-stone-900 dark:text-stone-100">
                {formatRM(value)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 dark:border-stone-800">
              {["Service", "Event", "Gross", "Commission", "Net", "Status"].map((h, i) => (
                <th
                  key={h}
                  className={`px-5 py-3 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400 ${
                    i >= 2 ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {(loading || !user) && fetching ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-stone-500 dark:text-stone-400">
                  Loading...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-stone-500 dark:text-stone-400">
                  Failed to load payouts.
                </td>
              </tr>
            ) : payouts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-stone-500 dark:text-stone-400">
                  No payouts yet — they appear here once a client pays the balance for your booking.
                </td>
              </tr>
            ) : (
              payouts.map((p) => (
                <tr key={p.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <td className="px-5 py-3 font-medium text-stone-900 dark:text-stone-100">
                    {p.service}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-stone-600 dark:text-stone-400">
                    {formatDate(p.eventDate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-stone-600 dark:text-stone-400">
                    {formatRM(p.grossSen)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-stone-600 dark:text-stone-400">
                    −{formatRM(p.commissionSen)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-stone-900 dark:text-stone-100">
                    {formatRM(p.netSen)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[p.status] ?? STATUS_STYLES.pending
                      }`}
                    >
                      {p.status === "settled" && p.settledAt
                        ? `settled ${formatDate(p.settledAt)}`
                        : p.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
