"use client";

import { useEffect, useState } from "react";

interface Studio {
  id: string;
  name: string;
  tagline: string;
  description: string;
  state: string;
  area: string;
  address: string;
  services: string[];
  priceFrom: number;
  rating: number;
  reviewCount: number;
  hours: string;
  phone: string;
}

function formatRM(sen: number) {
  return `RM ${(sen / 100).toFixed(2)}`;
}

export default function AdminStudiosPage() {
  const [studios, setStudios] = useState<Studio[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Studio | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetch("/api/admin/studios")
      .then((r) => r.json())
      .then((d) => setStudios(d.studios ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = studios.filter(
    (s) =>
      s.name.toLowerCase().includes(filter.toLowerCase()) ||
      s.state.toLowerCase().includes(filter.toLowerCase()) ||
      s.area.toLowerCase().includes(filter.toLowerCase()),
  );

  function openDetail(studio: Studio) {
    setSelected(studio);
    setEditForm({
      name: studio.name,
      tagline: studio.tagline,
      description: studio.description,
      state: studio.state,
      area: studio.area,
      address: studio.address,
      priceFrom: studio.priceFrom,
      hours: studio.hours,
      phone: studio.phone,
    });
  }

  async function saveOverrides() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/studios/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setStudios((prev) =>
          prev.map((s) =>
            s.id === selected.id
              ? { ...s, ...Object.fromEntries(Object.entries(editForm).filter(([k]) => k in s)) }
              : s,
          ),
        );
        setSelected(null);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading studios...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Studios Catalog
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          {studios.length} studios &mdash; static data with DB overrides.
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="border-b border-stone-200 px-6 py-4 dark:border-stone-800">
          <input
            type="text"
            placeholder="Filter by name, state, or area..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full max-w-sm rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder:text-stone-500"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  State
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Area
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Price From
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Rating
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Services
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <td className="whitespace-nowrap px-6 py-3">
                    <div className="font-medium text-stone-900 dark:text-stone-100">{s.name}</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">{s.id}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {s.state}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {s.area}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 font-medium text-stone-900 dark:text-stone-100">
                    {formatRM(s.priceFrom)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {s.rating} ({s.reviewCount})
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {s.services.length} services
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {s.phone}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3">
                    <button
                      onClick={() => openDetail(s)}
                      className="rounded-md bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/30"
                    >
                      View / Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    No studios found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-xl dark:border-stone-800 dark:bg-stone-900">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-stone-900 dark:text-stone-100">
                {selected.name}
              </h2>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                  Name
                </label>
                <input
                  type="text"
                  value={String(editForm.name ?? "")}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                  Tagline
                </label>
                <input
                  type="text"
                  value={String(editForm.tagline ?? "")}
                  onChange={(e) => setEditForm((f) => ({ ...f, tagline: e.target.value }))}
                  className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={String(editForm.description ?? "")}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                    State
                  </label>
                  <input
                    type="text"
                    value={String(editForm.state ?? "")}
                    onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))}
                    className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                    Area
                  </label>
                  <input
                    type="text"
                    value={String(editForm.area ?? "")}
                    onChange={(e) => setEditForm((f) => ({ ...f, area: e.target.value }))}
                    className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                  Address
                </label>
                <input
                  type="text"
                  value={String(editForm.address ?? "")}
                  onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                    Price From (sen)
                  </label>
                  <input
                    type="number"
                    value={String(editForm.priceFrom ?? "")}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, priceFrom: Number(e.target.value) }))
                    }
                    className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                    Hours
                  </label>
                  <input
                    type="text"
                    value={String(editForm.hours ?? "")}
                    onChange={(e) => setEditForm((f) => ({ ...f, hours: e.target.value }))}
                    className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={String(editForm.phone ?? "")}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  />
                </div>
              </div>

              {/* Services (read-only display) */}
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                  Services
                </label>
                <div className="flex flex-wrap gap-2">
                  {selected.services.map((svc, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-300"
                    >
                      {svc}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  Cancel
                </button>
                <button
                  onClick={saveOverrides}
                  disabled={saving}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Overrides"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
