"use client";

import { useEffect, useState } from "react";
import { Badge, referralStatusVariant } from "@/components/admin/Badge";
import { formatRM } from "@/lib/utils";

interface Referral {
  id: string;
  referrer_type: string;
  referrer_id: string;
  referrer_name: string | null;
  referee_type: string;
  referee_id: string;
  referee_name: string | null;
  status: string;
  reward_sen: number;
  created_at: string;
  qualified_at: string | null;
  paid_at: string | null;
}

interface ReferralsResponse {
  referrals: Referral[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

const STATUS_OPTIONS = ["", "pending", "qualified", "paid"];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: "50", offset: "0" });
    if (status) params.set("status", status);
    fetch(`/api/admin/referrals?${params}`)
      .then((r) => r.json() as Promise<ReferralsResponse>)
      .then((d) => {
        if (cancelled) return;
        setReferrals(d.referrals ?? []);
        setTotal(d.pagination?.total ?? 0);
      })
      .catch(() => {
        if (!cancelled) setMessage("Failed to load referrals.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Referrals
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Artist/studio referral chain ({total} total). Status filters mirror
          GET /api/admin/referrals.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label
          htmlFor="referral-status"
          className="text-sm font-medium text-stone-700 dark:text-stone-300"
        >
          Status
        </label>
        <select
          id="referral-status"
          value={status}
          onChange={(e) => {
            setLoading(true);
            setStatus(e.target.value);
          }}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "All" : s}
            </option>
          ))}
        </select>
      </div>

      {message && <p className="text-sm text-rose-600 dark:text-rose-400">{message}</p>}

      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 dark:border-stone-800">
              {["Referrer", "Referee", "Reward", "Status", "Created"].map((h) => (
                <th
                  key={h}
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-stone-500">
                  Loading referrals...
                </td>
              </tr>
            ) : (
              referrals.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <td className="whitespace-nowrap px-6 py-3 text-stone-900 dark:text-stone-100">
                    {r.referrer_name ?? r.referrer_id.slice(0, 8)}
                    <span className="ml-2 text-xs text-stone-500">({r.referrer_type})</span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {r.referee_name ?? r.referee_id.slice(0, 8)}
                    <span className="ml-2 text-xs text-stone-500">({r.referee_type})</span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {formatRM(r.reward_sen)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3">
                    <Badge variant={referralStatusVariant(r.status)}>{r.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {formatDate(r.created_at)}
                  </td>
                </tr>
              ))
            )}
            {!loading && referrals.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-stone-500">
                  No referrals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
