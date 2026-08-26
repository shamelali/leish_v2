"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface MonthCount {
  month: string;
  count: number;
}
interface MonthRevenue {
  month: string;
  sen: number;
}
interface Analytics {
  totals: {
    users: number;
    bookings: number;
    revenueSen: number;
    pendingPayoutsSen: number;
    completedBookings: number;
    artists: number;
  };
  bookingsByMonth: MonthCount[];
  signupsByMonth: MonthCount[];
  revenueByMonth: MonthRevenue[];
  bookingsByStatus: { status: string; count: number }[];
  topArtists: {
    artist_id: string;
    artist_name: string;
    bookings: number;
    revenue_sen: number;
  }[];
}

function rm(sen: number) {
  return `RM ${(sen / 100).toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
}

function monthLabel(m: string) {
  const [y, mm] = m.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mm) - 1]} ${y.slice(2)}`;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <p className="text-sm font-medium text-stone-500 dark:text-stone-400">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-2xl font-semibold",
          accent ? "text-rose-600 dark:text-rose-400" : "text-stone-900 dark:text-stone-100",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Dependency-free vertical bar chart. */
function BarChart({
  data,
  format,
}: {
  data: { label: string; value: number }[];
  format: (v: number) => string;
}) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-stone-500">No data yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex h-48 items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="text-[10px] font-medium text-stone-500 opacity-0 transition-opacity group-hover:opacity-100 dark:text-stone-400">
            {format(d.value)}
          </span>
          <div
            className="w-full rounded-t-md bg-rose-500/80 transition-colors group-hover:bg-rose-600 dark:bg-rose-600/70 dark:group-hover:bg-rose-500"
            style={{ height: `${Math.max(4, (d.value / max) * 140)}px` }}
            title={`${d.label}: ${format(d.value)}`}
          />
          <span className="w-full truncate text-center text-[10px] text-stone-500 dark:text-stone-400">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => (r.ok ? r.json() as Promise<Analytics> : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-rose-600 dark:text-rose-400">Failed to load analytics.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading analytics…</p>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    requested: "bg-amber-400",
    accepted: "bg-blue-400",
    confirmed: "bg-emerald-500",
    completed: "bg-emerald-700",
    cancelled: "bg-rose-400",
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Analytics
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Platform growth and revenue trends.
        </p>
      </div>

      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Total Revenue" value={rm(data.totals.revenueSen)} accent />
        <Stat label="Pending Payouts" value={rm(data.totals.pendingPayoutsSen)} />
        <Stat label="Users" value={String(data.totals.users)} />
        <Stat label="Artists" value={String(data.totals.artists)} />
        <Stat label="Bookings" value={String(data.totals.bookings)} />
        <Stat label="Completed" value={String(data.totals.completedBookings)} />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-4 font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
            Revenue by Month
          </h2>
          <BarChart
            data={data.revenueByMonth.map((r) => ({ label: monthLabel(r.month), value: r.sen }))}
            format={rm}
          />
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-4 font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
            Bookings by Month
          </h2>
          <BarChart
            data={data.bookingsByMonth.map((r) => ({ label: monthLabel(r.month), value: r.count }))}
            format={(v) => String(v)}
          />
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-4 font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
            New Signups by Month
          </h2>
          <BarChart
            data={data.signupsByMonth.map((r) => ({ label: monthLabel(r.month), value: r.count }))}
            format={(v) => String(v)}
          />
        </div>

        {/* Status distribution */}
        <div className="rounded-xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <h2 className="mb-4 font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
            Bookings by Status
          </h2>
          <div className="space-y-3">
            {data.bookingsByStatus.map((s) => {
              const total = data.totals.bookings || 1;
              return (
                <div key={s.status}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="capitalize text-stone-700 dark:text-stone-300">
                      {s.status}
                    </span>
                    <span className="text-stone-500 dark:text-stone-400">{s.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        statusColors[s.status] ?? "bg-stone-400",
                      )}
                      style={{ width: `${(s.count / total) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {data.bookingsByStatus.length === 0 && (
              <p className="py-6 text-center text-sm text-stone-500">No bookings yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Top artists */}
      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="border-b border-stone-200 px-6 py-4 dark:border-stone-800">
          <h2 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
            Top Artists by Revenue
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 dark:border-stone-800">
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
                Artist
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
                Bookings
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500">
                Revenue
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {data.topArtists.map((a) => (
              <tr key={a.artist_id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                <td className="px-6 py-3 font-medium text-stone-900 dark:text-stone-100">
                  {a.artist_name}
                </td>
                <td className="px-6 py-3 text-stone-600 dark:text-stone-400">{a.bookings}</td>
                <td className="px-6 py-3 text-stone-600 dark:text-stone-400">
                  {rm(a.revenue_sen)}
                </td>
              </tr>
            ))}
            {data.topArtists.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-sm text-stone-500">
                  No booking data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
