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
      <p className="text-sm font-semibold uppercase tracking-wider text-link">Beauty studios</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink">
        Browse Studios
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Discover premium beauty studios across Malaysia.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {studios.map((studio) => (
          <StudioCard key={studio.id} studio={studio} />
        ))}
      </div>

      {studios.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-line-strong bg-surface p-16 text-center">
          <p className="text-lg font-semibold text-ink">No studios found</p>
          <p className="mt-1 text-sm text-ink-muted">
            New studios join Leish! every week — check back soon.
          </p>
        </div>
      )}
    </div>
  );
}
