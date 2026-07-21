import type { Person } from "@/lib/types";

export type MentionPerson = Pick<Person, "id" | "name">;

/** People matching a Slack-style @query (case-insensitive substring). */
export function filterMentionPeople(
  people: MentionPerson[],
  query: string,
  limit = 8,
): MentionPerson[] {
  const q = query.trim().toLowerCase();
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
  if (!q) return sorted.slice(0, limit);
  return sorted
    .filter((p) => p.name.toLowerCase().includes(q))
    .slice(0, limit);
}

/** Collect person ids from TipTap mention nodes in HTML. */
export function extractMentionPersonIds(html: string): string[] {
  if (!html) return [];
  const ids = new Set<string>();
  const re =
    /data-type=["']mention["'][^>]*data-id=["']([^"']+)["']|data-id=["']([^"']+)["'][^>]*data-type=["']mention["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const id = m[1] || m[2];
    if (id) ids.add(id);
  }
  return [...ids];
}
