import type { Assignment, Task } from "@/lib/types";

/** Project ids a person appears on via schedule or task assignment. */
export function projectIdsForPerson(
  personId: string,
  assignments: Assignment[],
  tasks: Task[],
): Set<string> {
  const ids = new Set<string>();
  for (const a of assignments) {
    if (a.person_id === personId) ids.add(a.project_id);
  }
  for (const t of tasks) {
    if (t.assignee_person_id === personId) ids.add(t.project_id);
  }
  return ids;
}
