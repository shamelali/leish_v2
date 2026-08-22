import { listAllStudios } from "@/server/catalog";
import { StudioCard } from "@/components/StudioCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Browse Studios",
  description: "Discover premium beauty studios across Malaysia.",
};

export default async function StudiosPage() {
  const studios = await listAllStudios();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium text-rose-600 dark:text-rose-500">Beauty studios</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        Browse Studios
      </h1>
      <p className="mt-2 max-w-2xl text-stone-500 dark:text-stone-400">
        Discover premium beauty studios across Malaysia.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {studios.map((studio) => (
          <StudioCard key={studio.id} studio={studio} />
        ))}
      </div>

      {studios.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-16 text-center dark:border-stone-700 dark:bg-stone-900">
          <p className="text-lg font-semibold text-stone-900 dark:text-stone-100">No studios yet</p>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            We are currently onboarding studios in KL and Selangor.
          </p>
        </div>
      )}
    </div>
  );
}
