import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * v1 bug (from leish-structure.html audit): this guard let the
 * `studio_manager` role into /admin alongside `admin`, which was almost
 * certainly unintentional. Here the check is explicit — admin only — and
 * it's backed by the `is_admin()` RLS function too, so even if this guard
 * had a bug, the underlying queries would still refuse to return data to
 * a non-admin.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect("/sign-in?redirect=/admin&error=missing_config");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/");

  return <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>;
}
