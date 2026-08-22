"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  bookingStatusVariant,
  paymentStatusVariant,
  quotationStatusVariant,
} from "@/components/admin/Badge";

interface Booking {
  id: string;
  user_id: string;
  artist_id: string;
  artist_name: string;
  service: string;
  price: number;
  date: string;
  time: string;
  notes: string | null;
  event_type: string | null;
  venue: string | null;
  guest_count: number;
  status: string;
  created_at: string;
  customer_name?: string;
  customer_email?: string;
}

interface Payment {
  id: string;
  booking_id: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  provider_ref: string | null;
  provider_url: string | null;
  created_at: string;
  updated_at: string;
}

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
}

interface BookingDetail {
  booking: Booking;
  payment: Payment | null;
  quotation: Quotation | null;
}

function formatRM(sen: number) {
  return `RM ${(sen / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_OPTIONS = ["requested", "accepted", "confirmed", "cancelled", "completed"] as const;

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    void fetch(`/api/admin/bookings?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setBookings(data.bookings);
          setTotal(data.total);
        }
      })
      .catch(() => {
        if (!cancelled) setBookings([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, statusFilter, limit, offset]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/admin/bookings/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setDetail(data);
      setNotesDraft(data.booking.notes ?? "");
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedId) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/bookings/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      setDetail((prev) => (prev ? { ...prev, booking: data.booking } : null));
      setBookings((prev) =>
        prev.map((b) => (b.id === selectedId ? { ...b, status: newStatus } : b)),
      );
    } catch {
      /* ignore */
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedId) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/admin/bookings/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      setDetail((prev) => (prev ? { ...prev, booking: data.booking } : null));
    } catch {
      /* ignore */
    } finally {
      setSavingNotes(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Bookings
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Manage all platform bookings.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by artist or ID..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          className="w-64 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setOffset(0);
          }}
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <span className="text-sm text-stone-500 dark:text-stone-400">
          {total} {total === 1 ? "booking" : "bookings"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Artist
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Service
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Amount
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {bookings.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  onClick={() => openDetail(b.id)}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-stone-500 dark:text-stone-400">
                    {b.id.slice(0, 8)}...
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-900 dark:text-stone-100">
                    {b.customer_name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-900 dark:text-stone-100">
                    {b.artist_name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600 dark:text-stone-400">
                    {b.service}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600 dark:text-stone-400">
                    {formatDate(b.date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge variant={bookingStatusVariant(b.status)}>{b.status}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-stone-600 dark:text-stone-400">
                    {formatRM(b.price)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(b.id);
                      }}
                      className="text-xs font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    No bookings found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            Previous
          </button>
          <span className="text-sm text-stone-500 dark:text-stone-400">
            Page {Math.floor(offset / limit) + 1} of {totalPages}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
          >
            Next
          </button>
        </div>
      )}

      {/* Detail panel */}
      {selectedId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900">
            <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4 dark:border-stone-800">
              <h2 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
                Booking Detail
              </h2>
              <button
                onClick={() => {
                  setSelectedId(null);
                  setDetail(null);
                }}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              >
                ✕
              </button>
            </div>

            {detailLoading ? (
              <div className="flex h-48 items-center justify-center">
                <p className="text-sm text-stone-500 dark:text-stone-400">Loading...</p>
              </div>
            ) : !detail ? (
              <div className="flex h-48 items-center justify-center">
                <p className="text-sm text-rose-600 dark:text-rose-400">Failed to load booking.</p>
              </div>
            ) : (
              <div className="space-y-6 p-6">
                {/* Booking info */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                      Booking ID
                    </p>
                    <p className="mt-1 font-mono text-sm text-stone-900 dark:text-stone-100">
                      {detail.booking.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                      Customer
                    </p>
                    <p className="mt-1 text-sm text-stone-900 dark:text-stone-100">
                      {detail.booking.customer_name ?? "—"}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {detail.booking.customer_email ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                      Artist
                    </p>
                    <p className="mt-1 text-sm text-stone-900 dark:text-stone-100">
                      {detail.booking.artist_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                      Service
                    </p>
                    <p className="mt-1 text-sm text-stone-900 dark:text-stone-100">
                      {detail.booking.service}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                      Date & Time
                    </p>
                    <p className="mt-1 text-sm text-stone-900 dark:text-stone-100">
                      {formatDate(detail.booking.date)} at {detail.booking.time}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                      Amount
                    </p>
                    <p className="mt-1 text-sm text-stone-900 dark:text-stone-100">
                      {formatRM(detail.booking.price)}
                    </p>
                  </div>
                  {detail.booking.event_type && (
                    <div>
                      <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                        Event Type
                      </p>
                      <p className="mt-1 text-sm text-stone-900 dark:text-stone-100">
                        {detail.booking.event_type}
                      </p>
                    </div>
                  )}
                  {detail.booking.venue && (
                    <div>
                      <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                        Venue
                      </p>
                      <p className="mt-1 text-sm text-stone-900 dark:text-stone-100">
                        {detail.booking.venue}
                      </p>
                    </div>
                  )}
                  {detail.booking.guest_count > 0 && (
                    <div>
                      <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                        Guest Count
                      </p>
                      <p className="mt-1 text-sm text-stone-900 dark:text-stone-100">
                        {detail.booking.guest_count}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                      Created
                    </p>
                    <p className="mt-1 text-sm text-stone-900 dark:text-stone-100">
                      {formatDateTime(detail.booking.created_at)}
                    </p>
                  </div>
                </div>

                {/* Status change */}
                <div>
                  <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                    Status
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <Badge variant={bookingStatusVariant(detail.booking.status)}>
                      {detail.booking.status}
                    </Badge>
                    <select
                      value={detail.booking.status}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      disabled={updatingStatus}
                      className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                    {updatingStatus && (
                      <span className="text-xs text-stone-500 dark:text-stone-400">Saving...</span>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                    Notes
                  </p>
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
                    placeholder="Add notes..."
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50 dark:bg-rose-700 dark:hover:bg-rose-600"
                    >
                      {savingNotes ? "Saving..." : "Save Notes"}
                    </button>
                  </div>
                </div>

                {/* Payment */}
                {detail.payment && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-800/50">
                    <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                      Payment
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-stone-500 dark:text-stone-400">Amount</p>
                        <p className="text-sm text-stone-900 dark:text-stone-100">
                          {formatRM(detail.payment.amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-500 dark:text-stone-400">Status</p>
                        <Badge variant={paymentStatusVariant(detail.payment.status)}>
                          {detail.payment.status}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-stone-500 dark:text-stone-400">Provider</p>
                        <p className="text-sm text-stone-900 dark:text-stone-100">
                          {detail.payment.provider}
                        </p>
                      </div>
                      {detail.payment.provider_ref && (
                        <div>
                          <p className="text-xs text-stone-500 dark:text-stone-400">Reference</p>
                          <p className="font-mono text-xs text-stone-900 dark:text-stone-100">
                            {detail.payment.provider_ref}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Quotation */}
                {detail.quotation && (
                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-800/50">
                    <p className="text-xs font-medium uppercase text-stone-500 dark:text-stone-400">
                      Quotation
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-stone-500 dark:text-stone-400">Total</p>
                        <p className="text-sm text-stone-900 dark:text-stone-100">
                          {formatRM(detail.quotation.total)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-500 dark:text-stone-400">Status</p>
                        <Badge variant={quotationStatusVariant(detail.quotation.status)}>
                          {detail.quotation.status}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-stone-500 dark:text-stone-400">Base Fee</p>
                        <p className="text-sm text-stone-900 dark:text-stone-100">
                          {formatRM(detail.quotation.base_fee)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-stone-500 dark:text-stone-400">Travel Fee</p>
                        <p className="text-sm text-stone-900 dark:text-stone-100">
                          {formatRM(detail.quotation.travel_fee)}
                        </p>
                      </div>
                      {detail.quotation.artist_note && (
                        <div className="sm:col-span-2">
                          <p className="text-xs text-stone-500 dark:text-stone-400">Artist Note</p>
                          <p className="text-sm text-stone-900 dark:text-stone-100">
                            {detail.quotation.artist_note}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
