import { createClient } from "@/lib/supabase/server";

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
        {pending?.map((p) => (
          <li key={p.id} className="rounded border p-4">
            <span className="font-medium">{p.display_name}</span>
            <span className="ml-2 text-sm text-gray-500">
              {p.district}, {p.state}
            </span>
            {/* TODO: wire an approve/reject form action here — update
                is_active via a server action using createClient() (RLS
                already restricts this update to admins). */}
          </li>
        ))}
        {pending?.length === 0 && (
          <p className="text-gray-500">No pending providers — you're caught up.</p>
        )}
      </ul>
    </main>
  );
}
