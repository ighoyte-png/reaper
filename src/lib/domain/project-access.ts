import type { Assignment, ProjectMember, Task } from "@/lib/types";

/** Person ids on a project via roster, schedule, or task assignment. */
export function projectTeamPersonIds(
  projectId: string,
  projectMembers: ProjectMember[],
  assignments: Assignment[],
  tasks: Task[],
): Set<string> {
  const ids = new Set<string>();
  for (const m of projectMembers) {
    if (m.project_id === projectId) ids.add(m.person_id);
  }
  for (const a of assignments) {
    if (a.project_id === projectId) ids.add(a.person_id);
  }
  for (const t of tasks) {
    if (t.project_id === projectId && t.assignee_person_id) {
      ids.add(t.assignee_person_id);
    }
  }
  return ids;
}

/** Project ids a person appears on via roster, schedule, or task assignment. */
export function projectIdsForPerson(
  personId: string,
  assignments: Assignment[],
  tasks: Task[],
  projectMembers: ProjectMember[] = [],
): Set<string> {
  const ids = new Set<string>();
  for (const m of projectMembers) {
    if (m.person_id === personId) ids.add(m.project_id);
  }
  for (const a of assignments) {
    if (a.person_id === personId) ids.add(a.project_id);
  }
  for (const t of tasks) {
    if (t.assignee_person_id === personId) ids.add(t.project_id);
  }
  return ids;
}
