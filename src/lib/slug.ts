/** Reserved client URL segment for projects with no client. */
export const UNCATEGORIZED_CLIENT_SLUG = "uncategorized";

/** Lowercase hyphenated slug from a display name. */
export function slugify(input: string): string {
  const raw = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || "item";
}

/**
 * Pick a unique slug from a base name given existing sibling slugs.
 * Appends -2, -3, … on collision. Optionally keep `preferred` if free.
 */
export function uniqueSlug(
  name: string,
  existing: Iterable<string>,
  options?: { preferred?: string | null; exclude?: string | null },
): string {
  const taken = new Set(
    [...existing].filter((s) => s && s !== options?.exclude),
  );
  const preferred = options?.preferred?.trim();
  if (preferred && !taken.has(preferred) && preferred !== UNCATEGORIZED_CLIENT_SLUG) {
    return preferred;
  }
  let base = slugify(name);
  if (base === UNCATEGORIZED_CLIENT_SLUG) base = "item";
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function clientSlugForProject(
  project: { client_id: string | null },
  clients: { id: string; slug: string }[],
): string {
  if (!project.client_id) return UNCATEGORIZED_CLIENT_SLUG;
  return (
    clients.find((c) => c.id === project.client_id)?.slug ??
    UNCATEGORIZED_CLIENT_SLUG
  );
}
