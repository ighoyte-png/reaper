import { normalizeBudgetMode } from "@/lib/domain/budget";
import {
  projectTeamPersonIds,
  showProjectManagerUi,
} from "@/lib/domain/project-access";
import type {
  AssignmentStatus,
  DemoState,
  Person,
  Recurrence,
} from "@/lib/types";

/** Strip cost/bill rates and emails from a public share payload.
 * Also omits clients/projects marked hide_from_public_share and related rows.
 */
export function sanitizePublicWorkspace(state: DemoState): DemoState {
  const hiddenClientIds = new Set(
    state.clients
      .filter((c) => c.hide_from_public_share)
      .map((c) => c.id),
  );
  const hiddenProjectIds = new Set(
    state.projects
      .filter(
        (p) =>
          p.hide_from_public_share ||
          (p.client_id != null && hiddenClientIds.has(p.client_id)),
      )
      .map((p) => p.id),
  );
  const clients = state.clients.filter((c) => !hiddenClientIds.has(c.id));
  const projects = state.projects.filter((p) => !hiddenProjectIds.has(p.id));
  const assignments = state.assignments.filter(
    (a) => !hiddenProjectIds.has(a.project_id),
  );
  const milestones = state.milestones.filter(
    (m) => !hiddenProjectIds.has(m.project_id),
  );
  const project_assets = state.project_assets.filter(
    (a) => !hiddenProjectIds.has(a.project_id),
  );
  const task_lists = state.task_lists.filter(
    (l) => !hiddenProjectIds.has(l.project_id),
  );
  const tasks = state.tasks.filter((t) => !hiddenProjectIds.has(t.project_id));
  const taskIds = new Set(tasks.map((t) => t.id));
  const task_comments = state.task_comments.filter((c) =>
    taskIds.has(c.task_id),
  );
  const project_members = state.project_members.filter(
    (m) => !hiddenProjectIds.has(m.project_id),
  );
  const bulletins = state.bulletins.filter(
    (b) => !b.project_id || !hiddenProjectIds.has(b.project_id),
  );

  return {
    ...state,
    profiles: [],
    sessionProfileId: null,
    unread_bulletin_ids: [],
    unread_mentions: [],
    clients,
    projects,
    assignments,
    milestones,
    project_assets,
    task_lists,
    tasks,
    task_comments,
    project_members,
    bulletins,
    people: state.people.map(
      (p): Person => ({
        ...p,
        email: "",
        cost_rate: 0,
        bill_rate: 0,
        profile_id: null,
      }),
    ),
  };
}

/** Schedule stubs for client-facing monthly hours chart (no people/rates). */
export interface PortalHoursRetainer {
  budgetHours: number;
  assignments: {
    start_date: string;
    end_date: string;
    hours_per_day: number;
    recurrence: Recurrence;
    recurrence_end_date: string | null;
    recurrence_exceptions: string[];
    status: AssignmentStatus;
  }[];
}

/** Public, read-only per-project client portal payload. */
export interface ProjectPortalPayload {
  organizationName: string;
  project: {
    id: string;
    name: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    notes: string;
  };
  clientName: string | null;
  /** When true (2+ org managers), portal should highlight the project manager. */
  showProjectManagers: boolean;
  manager: {
    name: string;
    email: string;
    title: string;
    avatar_url: string | null;
  } | null;
  /** Team members with contact emails — shown to the client, unlike the org-wide share. */
  team: {
    name: string;
    email: string;
    title: string;
    avatar_url: string | null;
  }[];
  milestones: {
    id: string;
    name: string;
    due_date: string | null;
    status: string;
    client_approved: boolean;
    sort_order: number;
  }[];
  taskLists: { id: string; name: string; milestone_id: string | null }[];
  /** Titles/status only — no assignee, notes, or internal cost data. */
  tasks: {
    id: string;
    list_id: string;
    parent_id: string | null;
    title: string;
    status: string;
  }[];
  assets: {
    id: string;
    kind: string;
    label: string;
    url: string;
    body: string;
    sort_order: number;
  }[];
  /**
   * Hourly retainer (monthly reset) schedule for the budget hours chart.
   * Null for non-retainer / non-hours projects.
   */
  hoursRetainer: PortalHoursRetainer | null;
}

/**
 * Build a heavily-sanitized public payload for a single project's client
 * portal — no rates, emails, assignees, internal notes, or other projects.
 */
export function sanitizeProjectPortal(
  state: DemoState,
  projectId: string,
): ProjectPortalPayload | null {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const client = project.client_id
    ? state.clients.find((c) => c.id === project.client_id)
    : undefined;

  const teamIds = projectTeamPersonIds(
    projectId,
    state.project_members,
    state.assignments,
    state.tasks,
  );
  const showProjectManagers = showProjectManagerUi(state.projects);
  const managerPerson =
    showProjectManagers && project.manager_person_id
      ? state.people.find((p) => p.id === project.manager_person_id)
      : null;
  const manager = managerPerson
    ? {
        name: managerPerson.name,
        email: managerPerson.email,
        title: managerPerson.role_title,
        avatar_url: managerPerson.avatar_url ?? null,
      }
    : null;
  const team = state.people
    .filter((p) => teamIds.has(p.id))
    .map((p) => ({
      name: p.name,
      email: p.email,
      title: p.role_title,
      avatar_url: p.avatar_url ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const budgetMode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  const hoursRetainer: PortalHoursRetainer | null =
    budgetMode === "hours" && project.budget_monthly_reset
      ? {
          budgetHours: project.budget_hours ?? 0,
          assignments: state.assignments
            .filter((a) => a.project_id === projectId)
            .map((a) => ({
              start_date: a.start_date,
              end_date: a.end_date,
              hours_per_day: a.hours_per_day,
              recurrence: a.recurrence,
              recurrence_end_date: a.recurrence_end_date,
              recurrence_exceptions: a.recurrence_exceptions ?? [],
              status: a.status,
            })),
        }
      : null;

  return {
    organizationName: state.organization.name,
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      start_date: project.start_date,
      end_date: project.end_date,
      notes: project.notes,
    },
    clientName: client?.name ?? null,
    showProjectManagers,
    manager,
    team,
    milestones: state.milestones
      .filter((m) => m.project_id === projectId)
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          (a.due_date ?? "").localeCompare(b.due_date ?? ""),
      )
      .map((m) => ({
        id: m.id,
        name: m.name,
        due_date: m.due_date,
        status: m.status,
        client_approved: m.client_approved,
        sort_order: m.sort_order,
      })),
    taskLists: state.task_lists
      .filter((l) => l.project_id === projectId)
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      )
      .map((l) => ({ id: l.id, name: l.name, milestone_id: l.milestone_id })),
    tasks: (() => {
      const listIds = new Set(
        state.task_lists
          .filter((l) => l.project_id === projectId)
          .map((l) => l.id),
      );
      return state.tasks
        .filter((t) => t.project_id === projectId || listIds.has(t.list_id))
        .map((t) => ({
          id: t.id,
          list_id: t.list_id,
          parent_id: t.parent_id,
          title: t.title,
          status: t.status,
        }));
    })(),
    assets: state.project_assets
      .filter((a) => a.project_id === projectId && !a.hide_from_client)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({
        id: a.id,
        kind: a.kind,
        label: a.label,
        url: a.url,
        body: a.body,
        sort_order: a.sort_order,
      })),
    hoursRetainer,
  };
}
