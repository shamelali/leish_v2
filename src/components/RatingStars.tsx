import { cn } from "@/lib/utils";

export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span
      className={cn(
        "relative inline-flex items-center text-stone-300 dark:text-stone-700",
        className,
      )}
      aria-label={`Rated ${rating} out of 5`}
    >
      <span className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <svg key={`filled-${i}`} viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
          </svg>
        ))}
      </span>
      <span className="absolute inset-0 flex gap-0.5 overflow-hidden" style={{ width: `${pct}%` }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <svg
            key={`empty-${i}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 shrink-0 text-amber-400"
          >
            <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
          </svg>
        ))}
      </span>
    </span>
  );
}
