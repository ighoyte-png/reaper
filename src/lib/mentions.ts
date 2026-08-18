import type { MentionTarget, MentionUnread, Person } from "@/lib/types";

export type MentionPerson = Pick<Person, "id" | "name">;

/** Stable key for seen/unread tracking across comment, task, and assignment sources. */
export function mentionUnreadKey(
  row: Pick<MentionUnread, "comment_id" | "task_id" | "assignment_id">,
): string {
  if (row.comment_id) return `comment:${row.comment_id}`;
  if (row.task_id) return `task:${row.task_id}`;
  if (row.assignment_id) return `assignment:${row.assignment_id}`;
  return "";
}

export function mentionTargetKey(target: MentionTarget): string {
  return `${target.kind}:${target.id}`;
}

export function mentionUnreadMatchesTarget(
  row: Pick<MentionUnread, "comment_id" | "task_id" | "assignment_id" | "person_id">,
  target: MentionTarget,
  personId?: string,
): boolean {
  if (personId != null && row.person_id !== personId) return false;
  if (target.kind === "comment") return row.comment_id === target.id;
  if (target.kind === "task") return row.task_id === target.id;
  return row.assignment_id === target.id;
}

export function mentionTargetFromUnread(
  row: Pick<MentionUnread, "comment_id" | "task_id" | "assignment_id">,
): MentionTarget | null {
  if (row.comment_id) return { kind: "comment", id: row.comment_id };
  if (row.task_id) return { kind: "task", id: row.task_id };
  if (row.assignment_id) return { kind: "assignment", id: row.assignment_id };
  return null;
}

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

/** People newly tagged in next vs prev (optional self-exclusion). */
export function newlyMentionedPersonIds(
  prevIds: Iterable<string>,
  nextIds: Iterable<string>,
  excludePersonId?: string | null,
): string[] {
  const prev = new Set(
    [...prevIds].filter((id): id is string => Boolean(id)),
  );
  return [...new Set([...nextIds].filter(Boolean))].filter(
    (id) => !prev.has(id) && id !== excludePersonId,
  );
}

/**
 * Inbox rows to insert / delete when mention membership changes.
 * Only newly tagged people get a row — dismissed or already-read
 * mentions are not resurrected on an unrelated save.
 */
export function mentionUnreadSyncPlan(args: {
  currentPersonIds: Iterable<string>;
  existingUnreadPersonIds: Iterable<string>;
  newlyMentionedPersonIds: Iterable<string>;
}): { toAdd: string[]; toRemove: string[] } {
  const current = new Set(
    [...args.currentPersonIds].filter((id): id is string => Boolean(id)),
  );
  const existing = new Set(
    [...args.existingUnreadPersonIds].filter(
      (id): id is string => Boolean(id),
    ),
  );
  const newly = new Set(
    [...args.newlyMentionedPersonIds].filter((id) => current.has(id)),
  );
  return {
    toRemove: [...existing].filter((id) => !current.has(id)),
    toAdd: [...newly].filter((id) => !existing.has(id)),
  };
}
