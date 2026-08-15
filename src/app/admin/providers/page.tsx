import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";

async function approveProviderAction(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("providers").update({ is_active: true }).eq("id", id);

  if (error) {
    throw new Error(`Failed to approve provider: ${error.message}`);
  }

  revalidatePath("/admin/providers");
  revalidatePath("/admin");
  revalidatePath("/artists");
}

async function rejectProviderAction(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("providers").delete().eq("id", id);

  if (error) {
    throw new Error(`Failed to reject provider: ${error.message}`);
  }

  revalidatePath("/admin/providers");
  revalidatePath("/admin");
}

export default async function AdminProvidersPage() {
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("providers")
    .select(
      "id, slug, display_name, bio, state, district, specialties, default_deposit_percent, created_at",
    )
    .eq("is_active", false)
    .order("created_at", { ascending: true });

  const { data: approved } = await supabase
    .from("providers")
    .select("id, slug, display_name, state, district, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <main className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <Link href="/admin" className="hover:text-rose-600">
              Admin
            </Link>
            <span>/</span>
            <span className="text-stone-900 font-medium dark:text-stone-200">Providers</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
            Provider Management
          </h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Review and approve pending makeup artist applications.
          </p>
        </div>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            Pending Approval
          </h2>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            {pending?.length ?? 0}
          </span>
        </div>

        {pending && pending.length > 0 ? (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white shadow-sm dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
            {pending.map((p) => (
              <li
                key={p.id}
                className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg text-stone-900 dark:text-stone-100">
                      {p.display_name}
                    </h3>
                    <span className="rounded bg-stone-100 px-2 py-0.5 text-xs font-mono text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      /{p.slug}
                    </span>
                  </div>
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    {p.district ? `${p.district}, ` : ""}
                    {p.state || "Location not specified"}
                    {" · "}
                    <span className="font-medium text-stone-700 dark:text-stone-300">
                      Deposit: {p.default_deposit_percent}%
                    </span>
                  </p>
                  {p.bio && (
                    <p className="text-sm text-stone-600 line-clamp-2 dark:text-stone-400">
                      {p.bio}
                    </p>
                  )}
                  {p.specialties && p.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {p.specialties.map((s: string) => (
                        <span
                          key={s}
                          className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-stone-400">
                    Applied:{" "}
                    {new Date(p.created_at).toLocaleDateString("en-MY", { dateStyle: "medium" })}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <form action={rejectProviderAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 hover:text-red-600 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-red-400 transition-colors"
                    >
                      Reject
                    </button>
                  </form>
                  <form action={approveProviderAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 shadow-sm transition-colors"
                    >
                      Approve Provider
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-12 text-center dark:border-stone-800 dark:bg-stone-900">
            <svg
              className="mx-auto h-12 w-12 text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="mt-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
              No pending applications
            </h3>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              You&apos;re completely caught up. All MUA applications have been processed.
            </p>
          </div>
        )}
      </section>

      {approved && approved.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-stone-900 mb-4 dark:text-stone-100">
            Recently Approved Providers
          </h2>
          <div className="rounded-xl border border-stone-200 bg-white overflow-hidden shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase text-stone-500 dark:border-stone-800 dark:bg-stone-800/50 dark:text-stone-400">
                <tr>
                  <th className="px-6 py-3">Artist</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3">Slug</th>
                  <th className="px-6 py-3">Approved Date</th>
                  <th className="px-6 py-3 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {approved.map((a) => (
                  <tr key={a.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                    <td className="px-6 py-4 font-medium text-stone-900 dark:text-stone-100">
                      {a.display_name}
                    </td>
                    <td className="px-6 py-4 text-stone-500 dark:text-stone-400">
                      {a.district ? `${a.district}, ` : ""}
                      {a.state || "—"}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-stone-500">{a.slug}</td>
                    <td className="px-6 py-4 text-stone-500 dark:text-stone-400">
                      {new Date(a.created_at).toLocaleDateString("en-MY", { dateStyle: "short" })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/artists/${a.slug}`}
                        className="font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
                      >
                        View &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
