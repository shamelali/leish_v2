import { requirePageUser } from "@/server/page-auth";

/**
 * Server-side guard for the per-booking chat room.
 *
 * The page is a client component that redirects after hydration. Chat has no
 * guest mode (`useSession()` requires both a user and a session cookie), so an
 * anonymous request has nothing to render and is sent to /login with the exact
 * room URL to come back to.
 */
export default async function BookingChatLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return <>{children}</>;
}
