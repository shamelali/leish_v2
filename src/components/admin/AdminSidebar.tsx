"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/users", label: "Users", icon: "👥" },
  { href: "/admin/artists", label: "Artists", icon: "🎨" },
  { href: "/admin/studios", label: "Studios", icon: "💄" },
  { href: "/admin/bookings", label: "Bookings", icon: "📅" },
  { href: "/admin/payments", label: "Payments", icon: "💳" },
  { href: "/admin/quotations", label: "Quotations", icon: "📋" },
  { href: "/admin/messages", label: "Messages", icon: "💬" },
  { href: "/admin/emails", label: "Email Outbox", icon: "📧" },
  { href: "/admin/audit", label: "Audit Log", icon: "📝" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 lg:block">
      <div className="flex h-16 items-center border-b border-stone-200 px-6 dark:border-stone-800">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="font-display text-lg font-semibold text-rose-600">Leish!</span>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">
            Admin
          </span>
        </Link>
      </div>
      <nav className="flex flex-col gap-1 p-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200",
              )}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
