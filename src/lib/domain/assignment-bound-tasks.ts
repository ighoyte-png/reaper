/** Marker so bind-generated assignment notes can be cleared on unbind. */
export const BOUND_TASKS_NOTES_MARKER = "<!--reaper-bound-tasks-->";

export function boundTasksNotesHtml(titles: string[]): string {
  const lines = titles
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => escapeHtml(t));
  if (lines.length === 0) return "";
  return `${BOUND_TASKS_NOTES_MARKER}<p>${lines.join("<br>")}</p>`;
}

export function isBoundTasksNotes(html: string | null | undefined): boolean {
  return Boolean(html?.includes(BOUND_TASKS_NOTES_MARKER));
}

/** Bound tasks whose dates follow the assignment (skip Gantt-enabled lists). */
export function tasksToSyncForAssignmentBind<
  T extends { id: string; list_id: string; is_divider?: boolean },
  L extends { id: string; gantt_enabled?: boolean },
>(tasks: T[], taskLists: L[], boundTaskIds: string[]): T[] {
  const ganttLists = new Set(
    taskLists.filter((l) => l.gantt_enabled).map((l) => l.id),
  );
  const idSet = new Set(boundTaskIds);
  return tasks.filter(
    (t) => idSet.has(t.id) && !t.is_divider && !ganttLists.has(t.list_id),
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
