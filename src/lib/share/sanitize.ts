import type { DemoState, Person } from "@/lib/types";

/** Strip cost/bill rates and emails from a public share payload. */
export function sanitizePublicWorkspace(state: DemoState): DemoState {
  return {
    ...state,
    profiles: [],
    sessionProfileId: null,
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
    due_date: string;
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
  }[];
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

  const teamIds = new Set<string>();
  for (const a of state.assignments) {
    if (a.project_id === projectId) teamIds.add(a.person_id);
  }
  for (const t of state.tasks) {
    if (t.project_id === projectId && t.assignee_person_id)
      teamIds.add(t.assignee_person_id);
  }
  const team = state.people
    .filter((p) => teamIds.has(p.id))
    .map((p) => ({
      name: p.name,
      email: p.email,
      title: p.role_title,
      avatar_url: p.avatar_url ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

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
    team,
    milestones: state.milestones
      .filter((m) => m.project_id === projectId)
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.due_date.localeCompare(b.due_date),
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
      .filter((a) => a.project_id === projectId)
      .map((a) => ({
        id: a.id,
        kind: a.kind,
        label: a.label,
        url: a.url,
        body: a.body,
      })),
  };
}
