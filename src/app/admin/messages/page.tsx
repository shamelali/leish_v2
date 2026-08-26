"use client";

import { useEffect, useState } from "react";

interface Message {
  id: string;
  booking_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  artist_name: string;
  service: string;
  sender_name: string;
  sender_email: string;
}

interface MessagesResponse {
  messages: Message[];
  total: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [bookingIdFilter, setBookingIdFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const limit = 50;
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (bookingIdFilter) params.set("bookingId", bookingIdFilter);

    fetch(`/api/admin/messages?${params}`)
      .then((r) => r.json() as Promise<MessagesResponse>)
      .then((d) => {
        setMessages(d.messages);
        setTotal(d.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookingIdFilter, limit, offset]);

  const totalPages = Math.ceil(total / limit);

  function handleFilter() {
    setBookingIdFilter(searchInput.trim());
    setOffset(0);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Messages
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          View all messages across bookings.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Filter by booking ID..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleFilter()}
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 placeholder:text-stone-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:placeholder:text-stone-500"
        />
        <button
          onClick={handleFilter}
          className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Filter
        </button>
        {bookingIdFilter && (
          <button
            onClick={() => {
              setBookingIdFilter("");
              setSearchInput("");
              setOffset(0);
            }}
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Clear
          </button>
        )}
        <span className="text-sm text-stone-500 dark:text-stone-400">
          {total} {total === 1 ? "message" : "messages"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Sender
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Booking
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Message
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    Loading...
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    No messages found.
                  </td>
                </tr>
              ) : (
                messages.map((m) => (
                  <tr key={m.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="whitespace-nowrap px-6 py-3 text-stone-900 dark:text-stone-100">
                      <div className="font-medium">{m.sender_name}</div>
                      <div className="text-xs text-stone-500 dark:text-stone-400">
                        {m.sender_email}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                      <div>{m.artist_name}</div>
                      <div className="text-xs text-stone-500 dark:text-stone-400">{m.service}</div>
                    </td>
                    <td className="px-6 py-3 text-stone-700 dark:text-stone-300">
                      <p className="line-clamp-2 max-w-md">{m.body}</p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                      {formatDate(m.created_at)}
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
