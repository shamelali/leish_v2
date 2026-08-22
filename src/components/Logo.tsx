import Image from "next/image";
import Link from "next/link";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center ${className ?? ""}`}>
      <Image
        src="/images/logo.png"
        alt="Leish!"
        width={1430}
        height={690}
        priority
        className="h-8 w-auto sm:h-9"
      />
    </Link>
  );
}
