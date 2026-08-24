import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared layout for legal documents (terms, privacy). Content lives in the
 * pages; this only standardises typography, spacing and the review-status
 * banner.
 */
export function LegalDoc({
  title,
  updated,
  draft = true,
  children,
}: {
  title: string;
  updated: string;
  /** Show the pending-legal-review banner. Remove once counsel signs off. */
  draft?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100">
        {title}
      </h1>
      <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">Last updated: {updated}</p>

      {draft && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>Draft.</strong> This document is pending professional legal review and may change.
          Questions?{" "}
          <Link href="/contact" className="font-semibold underline">
            Contact us
          </Link>
          .
        </div>
      )}

      <div className="mt-8 space-y-6 text-[15px] leading-7 text-stone-700 [&_a]:text-rose-600 [&_a:hover]:underline [&_h2]:mt-10 [&_h2]:border-b [&_h2]:pb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-stone-900 [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-stone-900 [&_li]:ml-5 [&_ol]:list-decimal [&_p+ul]:mt-2 [&_strong]:text-stone-900 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:px-3 [&_py]:py-2 [&_th]:border [&_th]:bg-stone-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:dark:bg-stone-800/60 [&_tr>td]:dark:border-stone-700 [&_tr>th]:dark:border-stone-700 [&_ul]:list-disc dark:text-stone-300 dark:[&_strong]:text-stone-100">
        {children}
      </div>
    </div>
  );
}
