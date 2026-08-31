import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/server/session";
import { getDb, type UserRow } from "@/server/db";
import { getSupabaseUser } from "@/lib/supabase/auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata = {
  title: "Admin",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user: UserRow | null = null;

  // 1. Check Supabase session first (OAuth users)
  try {
    const sbUser = await getSupabaseUser();
    if (sbUser) {
      const row = await getDb()
        .prepare("SELECT * FROM users WHERE id = ?")
        .get<UserRow>(sbUser.id);
      if (row) user = row;
    }
  } catch {
    // Supabase env vars may not be set — fall through.
  }

  // 2. Fall back to custom JWT session
  if (!user) {
    const cookieStore = await cookies();
    const token = cookieStore.get("leish_session")?.value;
    const payload = token ? await verifySessionToken(token) : null;

    if (payload) {
      user = (await getDb()
        .prepare("SELECT * FROM users WHERE id = ?")
        .get<UserRow>(payload.sub)) ?? null;
    }
  }

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  if (user.role !== "admin") {
    redirect("/?error=forbidden");
  }

  return <AdminShell user={{ name: user.name, email: user.email }}>{children}</AdminShell>;
}
