/** Lightweight className combiner. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Format a price in Malaysian Ringgit. */
export function formatRM(value: number) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/** Public catalog URL — slug when present, otherwise the legacy id. */
export function catalogPath(
  kind: "artists" | "studios",
  entity: { id: string; slug?: string | null },
): string {
  return `/${kind}/${entity.slug || entity.id}`;
}

/** next/image throws on an empty src — admin-created profiles may not have one yet. */
export function catalogImageSrc(
  src: string | undefined | null,
  fallback = "/images/hero.jpg",
): string {
  return src && src.trim().length > 0 ? src : fallback;
}
