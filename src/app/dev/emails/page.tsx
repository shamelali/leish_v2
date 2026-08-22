"use client";

import { notFound } from "next/navigation";
import { getDb } from "@/server/db";
import { useState } from "react";

/**
 * Dev-only inbox for the "dev" email provider.
 * Lists everything written to the email_outbox table so email flows can be
 * exercised locally without a real provider. Never available in production.
 */

interface OutboxRow {
  id: string;
  to_email: string;
  subject: string;
  text: string;
  html: string | null;
  created_at: string;
}

export default async function DevEmailsPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const rows = (await getDb()
    .prepare("SELECT * FROM email_outbox ORDER BY created_at DESC LIMIT 50")
    .all()) as unknown as OutboxRow[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium text-rose-600 dark:text-rose-500">Dev only</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        Email outbox
      </h1>
      <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
        Messages captured by the dev email provider. Not visible in production.
      </p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-12 text-center dark:border-stone-700 dark:bg-stone-900">
          <p className="text-stone-500 dark:text-stone-400">No emails sent yet.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((email) => (
            <details
              key={email.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
            >
              <summary className="cursor-pointer text-sm font-medium text-stone-900 dark:text-stone-100">
                {email.subject}{" "}
                <span className="font-normal text-stone-400">→ {email.to_email}</span>
              </summary>
              <EmailPreview text={email.text} html={email.html} />
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function EmailPreview({ text, html }: { text: string; html: string | null }) {
  const [tab, setTab] = useState<"text" | "html">("text");

  return (
    <div className="mt-3">
      {html && (
        <div className="mb-2 flex gap-2 border-b border-stone-200 dark:border-stone-700">
          <button
            onClick={() => setTab("text")}
            className={`px-3 py-1.5 text-xs font-medium ${
              tab === "text"
                ? "border-b-2 border-rose-500 text-rose-600"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            Text
          </button>
          <button
            onClick={() => setTab("html")}
            className={`px-3 py-1.5 text-xs font-medium ${
              tab === "html"
                ? "border-b-2 border-rose-500 text-rose-600"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            HTML
          </button>
        </div>
      )}
      {tab === "text" ? (
        <p className="whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-sm leading-6 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {text}
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-700"
          dangerouslySetInnerHTML={{ __html: html ?? "" }}
        />
      )}
    </div>
  );
}
