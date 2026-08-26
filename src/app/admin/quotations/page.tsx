"use client";

import { useEffect, useState } from "react";
import { Badge, quotationStatusVariant } from "@/components/admin/Badge";
import { formatRM } from "@/lib/utils";

interface Quotation {
  id: string;
  booking_id: string;
  base_fee: number;
  travel_fee: number;
  early_call_fee: number;
  accommodation_fee: number;
  extras: string;
  artist_note: string | null;
  total: number;
  status: string;
  created_at: string;
  expires_at: string;
  artist_name: string;
  service: string;
  customer_name: string;
}

interface QuotationsResponse {
  quotations: Quotation[];
  total: number;
}

const STATUS_OPTIONS = ["", "pending", "paid", "expired", "superseded"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminQuotationsPage() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const limit = 20;
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) params.set("status", status);

    fetch(`/api/admin/quotations?${params}`)
      .then((r) => r.json() as Promise<QuotationsResponse>)
      .then((d) => {
        setQuotations(d.quotations);
        setTotal(d.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, limit, offset]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Quotations
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          All quotation records and their lifecycle status.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <span className="text-sm text-stone-500 dark:text-stone-400">
          {total} {total === 1 ? "record" : "records"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Artist
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Service
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Expires
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    Loading...
                  </td>
                </tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    No quotations found.
                  </td>
                </tr>
              ) : (
                quotations.map((q) => (
                  <tr key={q.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="whitespace-nowrap px-6 py-3 text-stone-900 dark:text-stone-100">
                      {q.customer_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-stone-900 dark:text-stone-100">
                      {q.artist_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                      {q.service}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right font-medium text-stone-900 dark:text-stone-100">
                      {formatRM(q.total)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <Badge variant={quotationStatusVariant(q.status)}>{q.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                      {formatDate(q.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                      {formatDate(q.expires_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-stone-200 px-6 py-3 dark:border-stone-800">
          <span className="text-sm text-stone-500 dark:text-stone-400">
            Page {totalPages === 0 ? 0 : offset / limit + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
              disabled={offset === 0}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset((o) => Math.min(o + limit, (totalPages - 1) * limit))}
              disabled={offset + limit >= total}
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
