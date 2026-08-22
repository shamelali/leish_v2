"use client";

import { useEffect, useState } from "react";

interface AuditEntry {
  id: string;
  admin_user_id: string;
  action: string;
  target_table: string;
  target_id: string | null;
  details: string;
  created_at: string;
  admin_name: string;
  admin_email: string;
}

const TARGET_TABLES = [
  "",
  "users",
  "bookings",
  "payments",
  "quotations",
  "messages",
  "email_outbox",
  "artist_profiles",
  "sessions",
  "catalog_overrides",
  "platform_settings",
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [targetTable, setTargetTable] = useState("");
  const limit = 50;
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (action) params.set("action", action);
    if (targetTable) params.set("targetTable", targetTable);

    fetch(`/api/admin/audit?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setEntries(d.entries);
        setTotal(d.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [action, targetTable, limit, offset]);

  const totalPages = Math.ceil(total / limit);

  function handleActionFilter() {
    setAction(actionInput.trim());
    setOffset(0);
  }

  function handleTableFilter(value: string) {
    setTargetTable(value);
    setOffset(0);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Audit Log
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Track all admin actions across the platform.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Filter by action..."
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleActionFilter()}
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 placeholder:text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:placeholder:text-stone-500"
        />
        <button
          onClick={handleActionFilter}
          className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Search
        </button>
        <select
          value={targetTable}
          onChange={(e) => handleTableFilter(e.target.value)}
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
        >
          <option value="">All tables</option>
          {TARGET_TABLES.filter(Boolean).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {(action || targetTable) && (
          <button
            onClick={() => {
              setAction("");
              setActionInput("");
              setTargetTable("");
              setOffset(0);
            }}
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Clear
          </button>
        )}
        <span className="text-sm text-stone-500 dark:text-stone-400">
          {total} {total === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Admin
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Target
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
                    Loading...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
                    No audit entries found.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="whitespace-nowrap px-6 py-3 text-stone-900 dark:text-stone-100">
                      <div className="font-medium">{e.admin_name ?? "System"}</div>
                      <div className="text-xs text-stone-500 dark:text-stone-400">{e.admin_email}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-medium text-stone-900 dark:text-stone-100">
                      {e.action}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                      {e.target_table}
                      {e.target_id && (
                        <span className="ml-1 text-xs text-stone-400 dark:text-stone-500">
                          / {e.target_id.slice(0, 8)}...
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-stone-600 dark:text-stone-400">
                      {e.details && e.details !== "{}" ? (
                        <p className="line-clamp-1 max-w-xs font-mono text-xs">{e.details}</p>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                      {formatDate(e.created_at)}
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
