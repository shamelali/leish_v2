import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/server/session";
import { getDb, type UserRow } from "@/server/db";
import { AdminShell } from "@/components/admin/AdminShell";

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

  const user = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get<UserRow>(payload.sub));

  if (!user || user.role !== "admin") {
    redirect("/?error=forbidden");
  }

  return (
    <AdminShell user={{ name: user.name, email: user.email }}>{children}</AdminShell>
  );
}
