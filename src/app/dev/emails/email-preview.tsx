"use client";

import { useState } from "react";

export function EmailPreview({ text, html }: { text: string; html: string | null }) {
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
