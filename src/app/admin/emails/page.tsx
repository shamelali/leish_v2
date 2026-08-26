"use client";

import { useEffect, useState } from "react";

interface EmailEntry {
  id: string;
  to_email: string;
  subject: string;
  text: string;
  html: string | null;
  created_at: string;
}

interface EmailsResponse {
  emails: EmailEntry[];
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

export default function AdminEmailsPage() {
  const [emails, setEmails] = useState<EmailEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 20;
  const [offset, setOffset] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });

    fetch(`/api/admin/emails?${params}`)
      .then((r) => r.json() as Promise<EmailsResponse>)
      .then((d) => {
        setEmails(d.emails);
        setTotal(d.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [limit, offset]);

  const totalPages = Math.ceil(total / limit);
  const previewEmail = emails.find((e) => e.id === previewId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Email Outbox
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Emails sent by the platform. In dev mode, these are stored locally.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-stone-500 dark:text-stone-400">
          {total} {total === 1 ? "email" : "emails"}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 dark:border-stone-800">
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Subject
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Preview
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Date
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    Loading...
                  </td>
                </tr>
              ) : emails.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                  >
                    No emails in outbox.
                  </td>
                </tr>
              ) : (
                emails.map((e) => (
                  <tr key={e.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="whitespace-nowrap px-6 py-3 text-stone-900 dark:text-stone-100">
                      {e.to_email}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-medium text-stone-900 dark:text-stone-100">
                      {e.subject}
                    </td>
                    <td className="px-6 py-3 text-stone-600 dark:text-stone-400">
                      <p className="line-clamp-1 max-w-sm">{e.text}</p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-stone-600 dark:text-stone-400">
                      {formatDate(e.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <button
                        onClick={() => setPreviewId(previewId === e.id ? null : e.id)}
                        className="text-sm font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                      >
                        {previewId === e.id ? "Close" : "View"}
                      </button>
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

      {/* Preview modal */}
      {previewEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-700 dark:bg-stone-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
                Email Preview
              </h2>
              <button
                onClick={() => setPreviewId(null)}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-stone-500 dark:text-stone-400">To: </span>
                <span className="text-stone-900 dark:text-stone-100">{previewEmail.to_email}</span>
              </div>
              <div>
                <span className="font-medium text-stone-500 dark:text-stone-400">Subject: </span>
                <span className="text-stone-900 dark:text-stone-100">{previewEmail.subject}</span>
              </div>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-800">
                {previewEmail.html ? (
                  <div dangerouslySetInnerHTML={{ __html: previewEmail.html }} />
                ) : (
                  <pre className="whitespace-pre-wrap text-stone-700 dark:text-stone-300">
                    {previewEmail.text}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
