import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/server/session";
import { getDb, type UserRow } from "@/server/db";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const metadata = {
  title: "Admin",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("leish_session")?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (!payload) {
    redirect("/login?redirect=/admin");
  }

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(payload.sub)) as
    | UserRow
    | undefined;

  if (!user || user.role !== "admin") {
    redirect("/?error=forbidden");
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-stone-50 p-6 dark:bg-stone-950">
        {children}
      </main>
    </div>
  );
}
