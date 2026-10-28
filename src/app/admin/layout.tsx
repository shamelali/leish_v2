import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/page-auth";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata = {
  title: "Admin",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Supabase (OAuth) then JWT cookie — see src/server/page-auth.ts.
  const user = await getSessionUser();

  if (!user) {
    redirect("/login?redirect=/admin");
  }

  if (user.role !== "admin") {
    redirect("/?error=forbidden");
  }

  return <AdminShell user={{ name: user.name, email: user.email }}>{children}</AdminShell>;
}
