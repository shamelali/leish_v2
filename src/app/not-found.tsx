import { Button } from "@/components/Button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-32 text-center">
      <p className="font-display text-7xl font-semibold text-rose-200 dark:text-rose-900/40">404</p>
      <h1 className="mt-4 font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">Page not found</h1>
      <p className="mt-3 text-stone-500 dark:text-stone-400">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button href="/">Back home</Button>
        <Button href="/artists" variant="outline">Browse artists</Button>
      </div>
    </div>
  );
}
