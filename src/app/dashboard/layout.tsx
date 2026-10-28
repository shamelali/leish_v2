import { requirePageUser } from "@/server/page-auth";

export const metadata = {
  title: "Dashboard",
};

/**
 * Server-side guard for the authenticated dashboard.
 *
 * Both pages below are client components that only learn about the session
 * after hydration. Without this check an anonymous request renders the
 * authenticated shell (and starts fetching) before the client-side redirect
 * fires — so users briefly see a page they are not allowed to view.
 * Mirrors `src/app/admin/layout.tsx`.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return <>{children}</>;
}
