import { normalizeBudgetMode } from "@/lib/domain/budget";
import {
  projectTeamPersonIds,
  showProjectManagerUi,
} from "@/lib/domain/project-access";
import { sanitizeExternalUrl } from "@/lib/safe-url";
import type {
  AssignmentStatus,
  DemoState,
  Person,
  Recurrence,
} from "@/lib/types";

/**
 * Prospect showcase sanitizer for org-wide public share.
 * Keeps schedule/projects/people/tasks for demos; strips PII, internal notes,
 * leave, restricted bulletins, hidden assets, and templates.
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
  const clients = state.clients
    .filter((c) => !hiddenClientIds.has(c.id))
    .map((c) => ({
      ...c,
      notes: "",
      contact_first_name: "",
      contact_last_name: "",
      contact_email: "",
      contact_phone: "",
      company_website: "",
    }));
  const projects = state.projects
    .filter((p) => !hiddenProjectIds.has(p.id))
    .map((p) => ({
      ...p,
      notes: "",
      share_token: null,
    }));
  const assignments = state.assignments.filter(
    (a) => !hiddenProjectIds.has(a.project_id),
  );
  const milestones = state.milestones.filter(
    (m) => !hiddenProjectIds.has(m.project_id),
  );
  const project_assets = state.project_assets
    .filter(
      (a) => !hiddenProjectIds.has(a.project_id) && !a.hide_from_client,
    )
    .map((a) => ({
      ...a,
      url: sanitizeExternalUrl(a.url) ?? "",
    }));
  const task_lists = state.task_lists.filter(
    (l) => !hiddenProjectIds.has(l.project_id),
  );
  const tasks = state.tasks
    .filter((t) => !hiddenProjectIds.has(t.project_id))
    .map((t) => ({
      ...t,
      notes: "",
    }));
  const project_members = state.project_members.filter(
    (m) => !hiddenProjectIds.has(m.project_id),
  );
  const bulletins = state.bulletins.filter(
    (b) =>
      (!b.project_id || !hiddenProjectIds.has(b.project_id)) &&
      (b.audience ?? "all") === "all",
  );

  return {
    ...state,
    profiles: [],
    sessionProfileId: null,
    unread_bulletin_ids: [],
    dismissed_bulletin_ids: [],
    unread_mentions: [],
    unread_task_threads: [],
    project_favorites: [],
    pods: [],
    pod_members: [],
    leave_days: [],
    project_templates: [],
    template_milestones: [],
    template_task_lists: [],
    template_tasks: [],
    task_comments: [],
    clients,
    projects,
    assignments,
    milestones,
    project_assets,
    task_lists,
    tasks,
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
  /** Team members — names/titles/avatars only (emails stripped; PM email stays on manager). */
  team: {
    name: string;
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
    approval_enabled: boolean;
    approved_by_client: boolean;
    approved_by_name: string | null;
    approved_at: string | null;
    essential_kind: string | null;
    essential_label: string;
    essential_url: string;
  }[];
  taskLists: {
    id: string;
    name: string;
    milestone_id: string | null;
    gantt_enabled: boolean;
    start_date: string | null;
    end_date: string | null;
    sort_order: number;
  }[];
  /** Titles/status only — no assignee, notes, or internal cost data. */
  tasks: {
    id: string;
    list_id: string;
    parent_id: string | null;
    title: string;
    status: string;
    sort_order: number;
    start_date: string | null;
    due_date: string | null;
    is_client_review: boolean;
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
 * portal — no rates, emails on org share style; portal intentionally includes
 * team contact emails for the client relationship.
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

  const visibleLists = state.task_lists.filter(
    (l) => l.project_id === projectId && !l.hide_from_client,
  );
  const visibleListIds = new Set(visibleLists.map((l) => l.id));

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
        approval_enabled: Boolean(m.approval_enabled),
        approved_by_client: Boolean(m.approved_by_client),
        approved_by_name: m.approved_by_client
          ? (m.approved_by_name ?? null)
          : null,
        approved_at: m.approved_by_client ? (m.approved_at ?? null) : null,
        essential_kind: m.essential_kind,
        essential_label: m.essential_label ?? "",
        essential_url: sanitizeExternalUrl(m.essential_url) ?? "",
      })),
    taskLists: visibleLists
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      )
      .map((l) => ({
        id: l.id,
        name: l.name,
        milestone_id: l.milestone_id,
        gantt_enabled: Boolean(l.gantt_enabled),
        start_date: l.start_date ?? null,
        end_date: l.end_date ?? null,
        sort_order: l.sort_order,
      })),
    tasks: state.tasks
      .filter(
        (t) =>
          !t.is_divider &&
          visibleListIds.has(t.list_id) &&
          (t.project_id === projectId || visibleListIds.has(t.list_id)),
      )
      .map((t) => ({
        id: t.id,
        list_id: t.list_id,
        parent_id: t.parent_id,
        title: t.title,
        status: t.status,
        sort_order: t.sort_order,
        start_date: t.start_date ?? null,
        due_date: t.due_date ?? null,
        is_client_review: Boolean(t.is_client_review),
      })),
    assets: state.project_assets
      .filter((a) => a.project_id === projectId && !a.hide_from_client)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({
        id: a.id,
        kind: a.kind,
        label: a.label,
        url: sanitizeExternalUrl(a.url) ?? "",
        body: a.body,
        sort_order: a.sort_order,
      })),
    hoursRetainer,
  };
}
