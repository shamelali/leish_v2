"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/admin/StatCard";
import { Badge, bookingStatusVariant } from "@/components/admin/Badge";

interface DashboardData {
  stats: {
    users: { total: number; customers: number; artists: number; studios: number; admins: number };
    bookings: {
      total: number;
      requested: number;
      accepted: number;
      confirmed: number;
      completed: number;
      cancelled: number;
    };
    payments: { total: number; paid: number; required: number; totalRevenue: number };
    artistProfiles: number;
  };
  recentBookings: Array<{
    id: string;
    artist_name: string;
    service: string;
    date: string;
    time: string;
    status: string;
    created_at: string;
  }>;
  recentAudit: Array<{
    id: string;
    action: string;
    target_table: string;
    target_id: string | null;
    created_at: string;
  }>;
}

function formatRM(sen: number) {
  return `RM ${(sen / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading dashboard...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-rose-600 dark:text-rose-400">Failed to load dashboard data.</p>
      </div>
    );
  }

  const { stats, recentBookings, recentAudit } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Platform overview and recent activity.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={stats.users.total} icon="👥" />
        <StatCard label="Total Bookings" value={stats.bookings.total} icon="📅" />
        <StatCard label="Revenue" value={formatRM(stats.payments.totalRevenue)} icon="💰" />
        <StatCard label="Artist Profiles" value={stats.artistProfiles} icon="🎨" />
      </div>

      {/* User breakdown */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Customers" value={stats.users.customers} icon="👤" />
        <StatCard label="Artists" value={stats.users.artists} icon="🎨" />
        <StatCard label="Studios" value={stats.users.studios} icon="💄" />
        <StatCard label="Admins" value={stats.users.admins} icon="🛡️" />
      </div>

      {/* Booking breakdown */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Requested" value={stats.bookings.requested} icon="⏳" />
        <StatCard label="Accepted" value={stats.bookings.accepted} icon="✅" />
        <StatCard label="Confirmed" value={stats.bookings.confirmed} icon="✔️" />
        <StatCard label="Completed" value={stats.bookings.completed} icon="🎉" />
        <StatCard label="Cancelled" value={stats.bookings.cancelled} icon="❌" />
      </div>

      {/* Recent bookings */}
      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="border-b border-stone-200 px-6 py-4 dark:border-stone-800">
          <h2 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
            Recent Bookings
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Artist
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Service
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {recentBookings.map((b) => (
                <tr key={b.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <td className="whitespace-nowrap px-6 py-3 text-stone-900 dark:text-stone-100">
                    {b.artist_name}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {b.service}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {b.date} {b.time}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3">
                    <Badge variant={bookingStatusVariant(b.status)}>{b.status}</Badge>
                  </td>
                </tr>
              ))}
              {recentBookings.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    No bookings yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent audit */}
      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="border-b border-stone-200 px-6 py-4 dark:border-stone-800">
          <h2 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
            Recent Audit Log
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Target
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {recentAudit.map((a) => (
                <tr key={a.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <td className="whitespace-nowrap px-6 py-3 font-medium text-stone-900 dark:text-stone-100">
                    {a.action}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {a.target_table}
                    {a.target_id && ` / ${a.target_id.slice(0, 8)}...`}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {formatDate(a.created_at)}
                  </td>
                </tr>
              ))}
              {recentAudit.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    No audit entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
