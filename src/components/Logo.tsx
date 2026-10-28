import Image from "next/image";
import Link from "next/link";

/**
 * Brand logo. The wordmark is cream + crimson, so it sits on a small
 * brand-gradient chip — keeps contrast correct on any surface (light/dark).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center rounded-xl bg-gradient-to-r from-[var(--leish-header-from)] to-[var(--leish-header-to)] px-3 py-2 shadow-[var(--elev-card)] transition-shadow hover:shadow-[var(--elev-card-hover)] ${className ?? ""}`}
    >
      <Image
        src="/images/logo.png"
        alt="Leish!"
        width={1430}
        height={690}
        priority
        className="h-7 w-auto sm:h-8"
      />
    </Link>
  );
}
