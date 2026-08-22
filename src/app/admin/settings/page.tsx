"use client";

import { useEffect, useState } from "react";

interface Settings {
  [key: string]: string;
}

const SETTING_LABELS: Record<string, { label: string; description: string }> = {
  site_name: { label: "Site Name", description: "The display name of the platform" },
  contact_email: { label: "Contact Email", description: "Public support email address" },
  booking_fee_sen: {
    label: "Booking Fee (sen)",
    description: "Default booking fee in Malaysian sen (e.g., 20000 = RM 200)",
  },
  session_ttl_days: {
    label: "Session TTL (days)",
    description: "How long sessions last before expiring",
  },
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((body) => setSettings(body.settings ?? {}))
      .catch(() => setMessage("Failed to load settings."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Save failed");
      setMessage("Settings saved successfully.");
    } catch {
      setMessage("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-stone-500 dark:text-stone-400">Loading settings...</p>
      </div>
    );
  }

  const inputCls =
    "h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-rose-500 dark:focus:ring-rose-900/40";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Platform Settings
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Configure global platform settings.
        </p>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
        <div className="space-y-6">
          {Object.entries(SETTING_LABELS).map(([key, { label, description }]) => (
            <div key={key}>
              <label
                htmlFor={`setting-${key}`}
                className="block text-sm font-medium text-stone-800 dark:text-stone-200"
              >
                {label}
              </label>
              <p className="mb-1.5 text-xs text-stone-500 dark:text-stone-400">{description}</p>
              <input
                id={`setting-${key}`}
                type="text"
                value={settings[key] ?? ""}
                onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                className={inputCls}
              />
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-10 items-center justify-center rounded-full bg-rose-600 px-6 text-sm font-medium text-white transition-colors hover:bg-rose-500 disabled:pointer-events-none disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          {message && (
            <p
              className={`text-sm ${
                message.includes("success")
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
