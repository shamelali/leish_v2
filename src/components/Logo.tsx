import Link from "next/link";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`group flex items-baseline gap-0.5 font-semibold tracking-tight ${className ?? ""}`}>
      <span className="text-xl text-stone-900 dark:text-stone-100">Leish</span>
      <span className="text-xl text-rose-600 transition-transform group-hover:-translate-y-0.5 dark:text-rose-500">!</span>
    </Link>
  );
}
