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

/**
 * Constrain a `?redirect=` target to a same-origin path.
 *
 * The value comes from the URL, so it is attacker-controlled — `//evil.com` and
 * `https://evil.com` both leave the site once the caller does
 * `router.push(target)` after login. Anything that is not a plain absolute path
 * falls back to the default.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  const target = value?.trim();
  if (!target || !target.startsWith("/")) return fallback;
  // "//host" and "/\\host" are protocol-relative (i.e. off-site) to browsers.
  if (target.startsWith("//") || target.startsWith("/\\")) return fallback;
  // Control characters can smuggle a newline into downstream headers.
  if (/[\u0000-\u001f\u007f]/.test(target)) return fallback;
  return target;
}
