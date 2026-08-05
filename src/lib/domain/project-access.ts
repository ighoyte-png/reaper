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

/** Project ids a person appears on via roster, schedule, task assignment, or PM. */
export function projectIdsForPerson(
  personId: string,
  assignments: Assignment[],
  tasks: Task[],
  projectMembers: ProjectMember[] = [],
  projects: Project[] = [],
): Set<string> {
  const ids = new Set<string>();
  for (const m of projectMembers) {
    if (m.person_id === personId) ids.add(m.project_id);
  }
  for (const p of projects) {
    if (p.manager_person_id === personId) ids.add(p.id);
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

/** Explicit Team roster person ids (project_members), plus project manager when set. */
export function projectRosterPersonIds(
  projectId: string,
  projectMembers: ProjectMember[],
  managerPersonId?: string | null,
): Set<string> {
  const ids = new Set<string>();
  for (const m of projectMembers) {
    if (m.project_id === projectId) ids.add(m.person_id);
  }
  if (managerPersonId) ids.add(managerPersonId);
  return ids;
}

/** People selectable as task assignees for a project (roster only). */
export function projectAssigneePeople(
  projectId: string,
  people: Person[],
  projectMembers: ProjectMember[],
  opts?: {
    managerPersonId?: string | null;
    /** Keep current assignee visible even if removed from roster. */
    includePersonId?: string | null;
  },
): Person[] {
  const ids = projectRosterPersonIds(
    projectId,
    projectMembers,
    opts?.managerPersonId,
  );
  if (opts?.includePersonId) ids.add(opts.includePersonId);
  return people
    .filter((p) => ids.has(p.id))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

/** Org managers, the project's PM, or any roster member on a sandbox project. */
export function canEditProject(
  project: Project | null | undefined,
  opts: {
    canManage: boolean;
    myPersonId: string | null | undefined;
    /** Required for sandbox roster PM powers. */
    projectMembers?: ProjectMember[];
  },
): boolean {
  if (!project) return false;
  if (opts.canManage) return true;
  if (!opts.myPersonId) return false;
  if (project.manager_person_id === opts.myPersonId) return true;
  if (project.sandbox_mode && opts.projectMembers) {
    return opts.projectMembers.some(
      (m) => m.project_id === project.id && m.person_id === opts.myPersonId,
    );
  }
  return false;
}

export function isSandboxProject(
  project: Pick<Project, "sandbox_mode"> | null | undefined,
): boolean {
  return Boolean(project?.sandbox_mode);
}

export function nonSandboxProjects<T extends Pick<Project, "sandbox_mode">>(
  projects: T[],
): T[] {
  return projects.filter((p) => !p.sandbox_mode);
}

/** True when enabling sandbox would wipe schedule/budget/timeline/milestone data. */
export function projectHasSandboxWipeRisk(
  project: Pick<
    Project,
    | "id"
    | "start_date"
    | "end_date"
    | "budget_mode"
    | "budget_hours"
    | "budget_amount"
    | "manager_person_id"
  >,
  assignments: Pick<Assignment, "project_id">[],
  milestones: { project_id: string }[],
): boolean {
  if (assignments.some((a) => a.project_id === project.id)) return true;
  if (milestones.some((m) => m.project_id === project.id)) return true;
  if (project.start_date || project.end_date) return true;
  if (project.manager_person_id) return true;
  if (project.budget_mode !== "none") return true;
  if ((project.budget_hours ?? 0) > 0) return true;
  if (project.budget_amount != null) return true;
  return false;
}
