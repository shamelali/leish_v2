export default function Loading() {
  return (
    <div
      className="mx-auto flex min-h-[50vh] max-w-6xl items-center justify-center px-4"
      role="status"
      aria-label="Loading"
    >
      <div className="flex items-center gap-3 text-stone-400 dark:text-stone-500">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-6 w-6 animate-spin text-rose-600"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path
            d="M22 12a10 10 0 00-10-10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}
