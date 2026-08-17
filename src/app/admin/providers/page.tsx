import { createClient } from "@/lib/supabase/server";
import { toggleProviderStatus } from "@/lib/actions/providers";

export default async function AdminProvidersPage() {
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("providers")
    .select("id, display_name, state, district, created_at")
    .eq("is_active", false)
    .order("created_at", { ascending: true });

  return (
    <main>
      <h1 className="text-2xl font-bold">Pending providers</h1>
      <ul className="mt-6 space-y-3">
        {pending?.map(
          (p: { id: string; display_name: string; district: string; state: string }) => (
            <li key={p.id} className="rounded border p-4">
              <span className="font-medium">{p.display_name}</span>
              <span className="ml-2 text-sm text-gray-500">
                {p.district}, {p.state}
              </span>
              <div className="mt-2 flex gap-2">
                <form
                  action={async () => toggleProviderStatus(p.id, true)}
                  method="post"
                  className="flex items-center"
                >
                  <button
                    type="submit"
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                  >
                    Approve
                  </button>
                </form>
                <form
                  action={async () => toggleProviderStatus(p.id, false)}
                  method="post"
                  className="flex items-center"
                >
                  <button
                    type="submit"
                    className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ),
        )}
        {pending?.length === 0 && (
          <p className="text-gray-500">No pending providers you&apos;re caught up.</p>
        )}
      </ul>
    </main>
  );
}
