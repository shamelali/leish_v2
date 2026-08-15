import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  const [
    { count: pendingCount },
    { count: totalProvidersCount },
    { count: totalBookingsCount },
    { data: recentBookings },
    { data: recentPayments },
  ] = await Promise.all([
    supabase.from("providers").select("*", { count: "exact", head: true }).eq("is_active", false),
    supabase.from("providers").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("bookings").select("*", { count: "exact", head: true }),
    supabase
      .from("bookings")
      .select("id, status, amount, deposit_amount, created_at, client_id, provider_id")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("payment_transactions")
      .select("id, booking_id, billplz_bill_id, amount, paid, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const confirmedCount = recentBookings?.filter((b) => b.status === "confirmed").length ?? 0;

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
          Admin Dashboard
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Overview of platform activity, provider applications, bookings, and payment events.
        </p>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
            Pending Applications
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-semibold text-stone-900 dark:text-stone-100">
              {pendingCount ?? 0}
            </p>
            {(pendingCount ?? 0) > 0 && (
              <Link
                href="/admin/providers"
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400"
              >
                Review &rarr;
              </Link>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Active MUAs</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-semibold text-stone-900 dark:text-stone-100">
              {totalProvidersCount ?? 0}
            </p>
            <span className="text-xs text-emerald-600 font-medium dark:text-emerald-400">
              Target: 10
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Total Bookings</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-semibold text-stone-900 dark:text-stone-100">
              {totalBookingsCount ?? 0}
            </p>
            <span className="text-xs text-stone-500">{confirmedCount} confirmed</span>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Payment Webhooks</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-semibold text-stone-900 dark:text-stone-100">
              {recentPayments?.length ?? 0}
            </p>
            <span className="text-xs text-emerald-600 font-medium dark:text-emerald-400">
              Billplz live-ready
            </span>
          </div>
        </div>
      </div>

      {/* Quick Navigation Links */}
      <div className="flex gap-3">
        <Link
          href="/admin/providers"
          className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          Manage Providers ({pendingCount ?? 0} pending)
        </Link>
        <Link
          href="/artists"
          className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          View Public Catalog &rarr;
        </Link>
      </div>

      {/* Recent Payment Transactions Log */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Recent Payment Transactions (Billplz Log)
          </h2>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden shadow-sm dark:border-stone-800 dark:bg-stone-900">
          {recentPayments && recentPayments.length > 0 ? (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500 dark:border-stone-800 dark:bg-stone-800/50 dark:text-stone-400">
                <tr>
                  <th className="px-6 py-3">Billplz ID</th>
                  <th className="px-6 py-3">Booking ID</th>
                  <th className="px-6 py-3">Amount (RM)</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {recentPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                    <td className="px-6 py-4 font-mono text-xs text-stone-900 dark:text-stone-200">
                      {payment.billplz_bill_id}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-stone-500">
                      {payment.booking_id.slice(0, 8)}…
                    </td>
                    <td className="px-6 py-4 font-medium text-stone-900 dark:text-stone-100">
                      RM {Number(payment.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      {payment.paid ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                          Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-stone-500 dark:text-stone-400">
                      {new Date(payment.created_at).toLocaleString("en-MY", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-sm text-stone-500 dark:text-stone-400">
              No transactions recorded yet. Live webhook events will appear here automatically.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
