"use client";

import { useEffect, useState } from "react";
import { Badge, payoutStatusVariant } from "@/components/admin/Badge";
import { formatRM } from "@/lib/utils";

interface Payout {
  id: string;
  bookingId: string;
  artistUserId: string | null;
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
  createdAt: string;
}

const STATUS_OPTIONS = ["", "pending", "settled", "failed"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isSettleable(payout: Payout): boolean {
  return (
    payout.status === "pending" &&
    (!payout.settleableAt || new Date(payout.settleableAt).getTime() <= Date.now())
  );
}

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    fetch(`/api/admin/payouts?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setPayouts(d.payouts ?? []);
      })
      .catch(() => {
        if (!cancelled) setMessage("Failed to load payouts.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, refreshKey]);

  async function act(payoutId: string, action: "settle" | "fail") {
    setBusyId(payoutId);
    setMessage("");
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: payoutId, action }),
      });
      if (!res.ok) throw new Error("failed");
      setMessage(action === "settle" ? "Payout marked as settled." : "Payout marked as failed.");
      setRefreshKey((k) => k + 1);
    } catch {
      setMessage("Failed to update payout.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Artist Payouts
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Net amounts payable to artists (quote total − commission − deposit). Settle manually via
          bank transfer / DuitNow after the event&apos;s 24-hour dispute window.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by payout status"
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <span className="text-sm text-stone-500 dark:text-stone-400">
          {payouts.length} {payouts.length === 1 ? "payout" : "payouts"}
        </span>
        {message && <span className="text-sm text-emerald-600 dark:text-emerald-400">{message}</span>}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                {["Artist", "Service", "Event", "Gross", "Commission", "Net Payable", "Status", ""].map(
                  (h, i) => (
                    <th
                      key={i}
                      className={
                        i >= 3 && i <= 5
                          ? "px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400"
                          : "px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400"
                      }
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
                    Loading...
                  </td>
                </tr>
              ) : payouts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
                    No payouts found.
                  </td>
                </tr>
              ) : (
                payouts.map((p) => (
                  <tr key={p.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="whitespace-nowrap px-6 py-3 font-medium text-stone-900 dark:text-stone-100">
                      {p.artistName ?? "Unclaimed"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                      {p.service}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                      {formatDate(p.eventDate)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right text-stone-600 dark:text-stone-400">
                      {formatRM(p.grossSen)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right text-stone-600 dark:text-stone-400">
                      −{formatRM(p.commissionSen)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right font-semibold text-stone-900 dark:text-stone-100">
                      {formatRM(p.netSen)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <Badge variant={payoutStatusVariant(p.status)}>{p.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right">
                      {isSettleable(p) && (
                        <button
                          onClick={() => act(p.id, "settle")}
                          disabled={busyId === p.id}
                          className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                        >
                          {busyId === p.id ? "..." : "Mark settled"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
