import { requirePageUser } from "@/server/page-auth";

/**
 * Server-side guard for artist/studio onboarding.
 *
 * The page itself is a client component that waits for `useAuth()` and then
 * redirects; checking here means an anonymous visitor never receives the
 * form shell at all.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser("/onboarding");
  return <>{children}</>;
}
