import type { Assignment, Person, Project, ProjectMember, Task } from "@/lib/types";

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

/** Distinct assigned project-manager person ids across a project set. */
export function distinctProjectManagerIds(projects: Project[]): string[] {
  const ids = new Set<string>();
  for (const p of projects) {
    if (p.manager_person_id) ids.add(p.manager_person_id);
  }
  return [...ids];
}

/**
 * PM chrome (bars, card footers, portal/schedule callouts) only when
 * two or more distinct managers are assigned across the scoped projects.
 */
export function showProjectManagerUi(projects: Project[]): boolean {
  return distinctProjectManagerIds(projects).length >= 2;
}

export function projectManagerPerson(
  project: Project,
  people: Person[],
): Person | null {
  if (!project.manager_person_id) return null;
  return people.find((p) => p.id === project.manager_person_id) ?? null;
}
