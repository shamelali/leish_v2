"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  IconAudit,
  IconCalendar,
  IconCard,
  IconChart,
  IconClose,
  IconCollapse,
  IconDashboard,
  IconExpand,
  IconGlobe,
  IconLogout,
  IconMail,
  IconMenu,
  IconMessage,
  IconPalette,
  IconQuotation,
  IconSettings,
  IconStore,
} from "./icons";

interface NavItem {
  href: string;
  label: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: IconDashboard, exact: true },
      { href: "/admin/analytics", label: "Analytics", icon: IconChart },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { href: "/admin/artists", label: "Artists", icon: IconPalette },
      { href: "/admin/studios", label: "Studios", icon: IconStore },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/bookings", label: "Bookings", icon: IconCalendar },
      { href: "/admin/payments", label: "Payments", icon: IconCard },
      { href: "/admin/payouts", label: "Payouts", icon: IconCard },
      { href: "/admin/quotations", label: "Quotations", icon: IconQuotation },
      { href: "/admin/messages", label: "Messages", icon: IconMessage },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/emails", label: "Email Outbox", icon: IconMail },
      { href: "/admin/audit", label: "Audit Log", icon: IconAudit },
      { href: "/admin/settings", label: "Settings", icon: IconSettings },
    ],
  },
];

const COLLAPSE_KEY = "leish-admin-sidebar-collapsed";

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-rose-400",
        collapsed && "justify-center px-0",
        active
          ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
          : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100",
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-rose-600 dark:bg-rose-400" />
      )}
      <Icon />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 dark:bg-stone-700"
        >
          {item.label}
        </span>
      )}
    </Link>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        "flex h-16 shrink-0 items-center border-b border-stone-200 dark:border-stone-800",
        collapsed ? "justify-center px-2" : "justify-between px-5",
      )}
    >
      <Link href="/admin" className="flex items-center gap-2.5 overflow-hidden">
        <span className="font-display text-xl font-semibold tracking-tight text-rose-600 dark:text-rose-500">
          L
        </span>
        {!collapsed && (
          <>
            <span className="font-display text-lg font-semibold text-stone-900 dark:text-stone-100">
              Leish!
            </span>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
              Admin
            </span>
          </>
        )}
      </Link>
    </div>
  );
}

function SidebarBody({
  collapsed,
  userName,
  userEmail,
  onNavigate,
  onToggleCollapse,
}: {
  collapsed: boolean;
  userName: string;
  userEmail: string;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = useCallback(async () => {
    await logout();
    router.push("/login");
  }, [logout, router]);

  return (
    <div className="flex h-full flex-col">
      <Brand collapsed={collapsed} />

      {/* Navigation */}
      <nav
        aria-label="Admin"
        className={cn("flex-1 space-y-5 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                {group.label}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-stone-200 dark:bg-stone-800" />
            )}
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className={cn(
          "shrink-0 border-t border-stone-200 py-3 dark:border-stone-800",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {!collapsed && (
          <Link
            href="/"
            className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-100"
          >
            <IconGlobe />
            Back to site
          </Link>
        )}
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg p-2",
            collapsed && "justify-center",
          )}
        >
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-700 text-xs font-bold text-white"
          >
            {initials(userName) || "A"}
          </span>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                  {userName}
                </p>
                <p className="truncate text-xs text-stone-500 dark:text-stone-400">{userEmail}</p>
              </div>
              <button
                onClick={handleLogout}
                aria-label="Log out"
                title="Log out"
                className="rounded-lg p-2 text-stone-500 transition-colors hover:bg-stone-100 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-rose-400"
              >
                <IconLogout />
              </button>
            </>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
          className={cn(
            "mt-2 hidden w-full items-center justify-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 lg:flex dark:text-stone-400 dark:hover:bg-stone-800/70 dark:hover:text-stone-200",
            collapsed && "gap-0",
          )}
        >
          {collapsed ? <IconExpand /> : <IconCollapse />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );
}

export function AdminShell({
  user,
  children,
}: {
  user: { name: string; email: string };
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore collapse preference after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe post-mount restore
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }, []);

  // Close the mobile drawer on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:h-[calc(100vh-4rem)] lg:flex-row lg:overflow-hidden">
      {/* Mobile top bar */}
      <header className="sticky top-16 z-30 flex h-12 shrink-0 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur lg:hidden dark:border-stone-800 dark:bg-stone-900/95">
        <div className="flex items-center gap-2">
          <span className="font-display text-base font-semibold text-rose-600 dark:text-rose-500">
            Leish!
          </span>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
            Admin
          </span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open admin menu"
          aria-expanded={mobileOpen}
          className="rounded-lg p-2 text-stone-600 transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <IconMenu />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 lg:overflow-hidden">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "hidden shrink-0 border-r border-stone-200 bg-white transition-[width] duration-200 ease-in-out lg:block dark:border-stone-800 dark:bg-stone-900",
            collapsed ? "w-[76px]" : "w-64",
          )}
        >
          <SidebarBody
            collapsed={collapsed}
            userName={user.name}
            userEmail={user.email}
            onToggleCollapse={toggleCollapse}
          />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <button
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 h-full w-full cursor-default bg-black/50 backdrop-blur-sm"
            />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-stone-200 bg-white shadow-2xl dark:border-stone-800 dark:bg-stone-900">
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <IconClose />
              </button>
              <SidebarBody
                collapsed={false}
                userName={user.name}
                userEmail={user.email}
                onNavigate={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-stone-50 p-4 sm:p-6 dark:bg-stone-950">
          {children}
        </main>
      </div>
    </div>
  );
}
