"use client";

import { useEffect, useState } from "react";

interface ClaimedUser {
  user_id: string;
  user_name: string;
  user_email: string;
  claimed_at: string;
}

interface ArtistService {
  name: string;
  price: number;
  duration: string;
}

interface Artist {
  id: string;
  name: string;
  tagline: string;
  state: string;
  area: string;
  priceFrom: number;
  rating: number;
  reviewCount: number;
  specialties: string[];
  services: ArtistService[];
  verified: boolean;
  claimedBy: ClaimedUser[];
}

function formatRM(sen: number) {
  return `RM ${(sen / 100).toFixed(2)}`;
}

export default function AdminArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Artist | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    state: "",
    area: "",
    priceFrom: "",
    tagline: "",
  });
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    fetch("/api/admin/artists")
      .then((r) => r.json())
      .then((d) => setArtists(d.artists ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = artists.filter(
    (a) =>
      a.name.toLowerCase().includes(filter.toLowerCase()) ||
      a.state.toLowerCase().includes(filter.toLowerCase()) ||
      a.area.toLowerCase().includes(filter.toLowerCase()),
  );

  function openDetail(artist: Artist) {
    setSelected(artist);
    setEditForm({
      name: artist.name,
      tagline: artist.tagline,
      state: artist.state,
      area: artist.area,
      priceFrom: artist.priceFrom,
      verified: artist.verified,
    });
  }

  async function saveOverrides() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/artists/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setArtists((prev) =>
          prev.map((a) =>
            a.id === selected.id
              ? { ...a, ...Object.fromEntries(Object.entries(editForm).filter(([k]) => k in a)) }
              : a,
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
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading artists...</p>
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name,
          state: createForm.state,
          area: createForm.area,
          priceFrom: Number(createForm.priceFrom || 0),
          tagline: createForm.tagline,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "Failed to create artist");
        return;
      }
      setArtists((prev) => [...prev, data.artist]);
      setCreating(false);
      setCreateForm({ name: "", state: "", area: "", priceFrom: "", tagline: "" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Artists Catalog
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {artists.length} artists &mdash; catalog is DB-backed.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex h-9 items-center rounded-full bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-500"
          >
            + Add Artist
          </button>
        </div>
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-xl dark:border-stone-700 dark:bg-stone-900"
          >
            <h2 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
              Add Artist
            </h2>
            {[
              { key: "name" as const, label: "Name *", type: "text", required: true },
              { key: "tagline" as const, label: "Tagline", type: "text", required: false },
              { key: "state" as const, label: "State", type: "text", required: false },
              { key: "area" as const, label: "Area", type: "text", required: false },
              { key: "priceFrom" as const, label: "Price From (sen)", type: "number", required: false },
            ].map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-sm font-medium text-stone-800 dark:text-stone-200">
                  {f.label}
                </label>
                <input
                  type={f.type}
                  required={f.required}
                  value={String(createForm[f.key])}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, [f.key]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-rose-500 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                />
              </div>
            ))}
            {createError && (
              <p className="text-sm text-rose-600 dark:text-rose-400">{createError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-rose-600 px-5 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {saving ? "Creating…" : "Create Artist"}
              </button>
            </div>
          </form>
        </div>
      )}

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
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                  <td className="whitespace-nowrap px-6 py-3">
                    <div className="font-medium text-stone-900 dark:text-stone-100">{a.name}</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">{a.id}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {a.state}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {a.area}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 font-medium text-stone-900 dark:text-stone-100">
                    {formatRM(a.priceFrom)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {a.rating} ({a.reviewCount})
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                    {a.services.length} services
                  </td>
                  <td className="whitespace-nowrap px-6 py-3">
                    {a.verified ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                        Unverified
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3">
                    <button
                      onClick={() => openDetail(a)}
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
                    No artists found.
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

              <div className="grid grid-cols-2 gap-4">
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
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
                    <input
                      type="checkbox"
                      checked={Boolean(editForm.verified)}
                      onChange={(e) => setEditForm((f) => ({ ...f, verified: e.target.checked }))}
                      className="h-4 w-4 rounded border-stone-300 text-rose-600 focus:ring-rose-500"
                    />
                    Verified
                  </label>
                </div>
              </div>

              {/* Services (read-only display) */}
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                  Services
                </label>
                <div className="rounded-lg border border-stone-200 dark:border-stone-700">
                  {selected.services.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 text-sm even:bg-stone-50 dark:even:bg-stone-800/50"
                    >
                      <span className="text-stone-700 dark:text-stone-300">{s.name}</span>
                      <span className="text-stone-500 dark:text-stone-400">
                        {formatRM(s.price)} &middot; {s.duration}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Claimed users */}
              <div>
                <label className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">
                  Claimed By ({selected.claimedBy.length})
                </label>
                {selected.claimedBy.length === 0 ? (
                  <p className="text-sm text-stone-400 dark:text-stone-500">
                    No user has claimed this artist profile.
                  </p>
                ) : (
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700">
                    {selected.claimedBy.map((u) => (
                      <div
                        key={u.user_id}
                        className="flex items-center justify-between px-3 py-2 text-sm even:bg-stone-50 dark:even:bg-stone-800/50"
                      >
                        <div>
                          <span className="font-medium text-stone-900 dark:text-stone-100">
                            {u.user_name}
                          </span>
                          <span className="ml-2 text-stone-500 dark:text-stone-400">
                            {u.user_email}
                          </span>
                        </div>
                        <span className="text-xs text-stone-400 dark:text-stone-500">
                          Claimed {new Date(u.claimed_at).toLocaleDateString("en-MY")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
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
