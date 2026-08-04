import { canManage } from "@/lib/auth/roles";
import { projectIdsForPerson } from "@/lib/domain/project-access";
import { notesPlainText } from "@/lib/notes-html";
import type { DemoState, Role, Task, TaskStatus } from "@/lib/types";

export type SearchHitKind = "client" | "project" | "task" | "comment";

export type SearchHit = {
  kind: SearchHitKind;
  id: string;
  title: string;
  subtitle: string;
  snippet: string;
  project_id: string | null;
  task_id: string | null;
  client_id: string | null;
  /** Parent task status for task/comment hits. */
  task_status: TaskStatus | null;
  hit_rank: number;
};

export type SearchAccessContext = {
  canManage?: boolean;
  role?: Role | null;
  personId?: string | null;
};

/** Fill task_status from local task rows when RPC omits it (pre-migration 065). */
export function searchHitTaskIdsMissingStatus(hits: SearchHit[]): string[] {
  const ids = new Set<string>();
  for (const hit of hits) {
    if (hit.task_status) continue;
    if (hit.kind === "task") ids.add(hit.id);
    else if (hit.kind === "comment" && hit.task_id) ids.add(hit.task_id);
  }
  return [...ids];
}

export function enrichSearchHits(
  hits: SearchHit[],
  tasks: readonly Pick<Task, "id" | "status">[],
  extraStatuses?: ReadonlyMap<string, TaskStatus>,
): SearchHit[] {
  const byId = new Map<string, TaskStatus>();
  for (const t of tasks) byId.set(t.id, t.status);
  if (extraStatuses) {
    for (const [id, status] of extraStatuses) byId.set(id, status);
  }
  if (byId.size === 0) return hits;
  let changed = false;
  const out = hits.map((hit) => {
    if (hit.task_status) return hit;
    if (hit.kind !== "task" && hit.kind !== "comment") return hit;
    const taskId = hit.kind === "task" ? hit.id : hit.task_id;
    if (!taskId) return hit;
    const status = byId.get(taskId);
    if (!status) return hit;
    changed = true;
    return { ...hit, task_status: status };
  });
  return changed ? out : hits;
}

function matches(haystack: string, q: string): boolean {
  return haystack.toLowerCase().includes(q);
}

function clip(text: string, n = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

/** In-memory search for demo mode (uses whatever is already in the seed/store). */
export function searchDemoState(
  state: Pick<
    DemoState,
    | "clients"
    | "projects"
    | "tasks"
    | "task_comments"
    | "profiles"
    | "assignments"
    | "project_members"
  >,
  query: string,
  limit = 40,
  access?: SearchAccessContext,
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const manage =
    access?.canManage ??
    (access?.role != null ? canManage(access.role) : true);
  const personId = access?.personId ?? null;
  const visibleProjectIds = manage
    ? null
    : personId
      ? projectIdsForPerson(
          personId,
          state.assignments ?? [],
          state.tasks,
          state.project_members ?? [],
          state.projects,
        )
      : new Set<string>();

  const per = Math.max(3, Math.floor(limit / 4));
  const clientsById = new Map(state.clients.map((c) => [c.id, c]));
  const projectsById = new Map(state.projects.map((p) => [p.id, p]));
  const tasksById = new Map(state.tasks.map((t) => [t.id, t]));

  const visibleClientIds = new Set<string>();
  if (visibleProjectIds) {
    for (const p of state.projects) {
      if (visibleProjectIds.has(p.id) && p.client_id) {
        visibleClientIds.add(p.client_id);
      }
    }
  }

  const clients: SearchHit[] = [];
  for (const c of state.clients) {
    if (visibleProjectIds && !visibleClientIds.has(c.id)) continue;
    const contact = `${c.contact_first_name} ${c.contact_last_name}`.trim();
    const notes = notesPlainText(c.notes);
    const nameHit = matches(c.name, q);
    const emailHit = matches(c.contact_email, q);
    const contactHit = matches(contact, q);
    const notesHit = matches(notes, q);
    if (!nameHit && !emailHit && !contactHit && !notesHit) continue;
    clients.push({
      kind: "client",
      id: c.id,
      title: c.name,
      subtitle: contact,
      snippet: clip(notes),
      project_id: null,
      task_id: null,
      client_id: c.id,
      task_status: null,
      hit_rank:
        (nameHit ? 3 : 0) +
        (emailHit || contactHit ? 2 : 0) +
        (notesHit ? 1 : 0),
    });
  }
  clients.sort((a, b) => b.hit_rank - a.hit_rank || a.title.localeCompare(b.title));
  const matchedClientHits = clients.slice(0, per);
  const matchedClientIds = new Set(
    matchedClientHits.map((c) => c.client_id).filter(Boolean) as string[],
  );

  const projects: SearchHit[] = [];
  const projectLim = Math.min(limit, 40);
  for (const p of state.projects) {
    if (visibleProjectIds && !visibleProjectIds.has(p.id)) continue;
    const notes = notesPlainText(p.notes);
    const nameHit = matches(p.name, q);
    const notesHit = matches(notes, q);
    const viaClient = Boolean(p.client_id && matchedClientIds.has(p.client_id));
    if (!nameHit && !notesHit && !viaClient) continue;
    const client = p.client_id ? clientsById.get(p.client_id) : null;
    projects.push({
      kind: "project",
      id: p.id,
      title: p.name,
      subtitle: client?.name ?? "",
      snippet: clip(notes),
      project_id: p.id,
      task_id: null,
      client_id: p.client_id,
      task_status: null,
      hit_rank:
        (nameHit ? 3 : 0) + (notesHit ? 1 : 0) + (viaClient ? 2 : 0),
    });
  }
  projects.sort((a, b) => b.hit_rank - a.hit_rank || a.title.localeCompare(b.title));

  const tasks: SearchHit[] = [];
  for (const t of state.tasks) {
    if (visibleProjectIds && !visibleProjectIds.has(t.project_id)) continue;
    const notes = notesPlainText(t.notes);
    const titleHit = matches(t.title, q);
    const notesHit = matches(notes, q);
    if (!titleHit && !notesHit) continue;
    const project = projectsById.get(t.project_id);
    tasks.push({
      kind: "task",
      id: t.id,
      title: t.title,
      subtitle: project?.name ?? "",
      snippet: clip(notes),
      project_id: t.project_id,
      task_id: t.id,
      client_id: project?.client_id ?? null,
      task_status: t.status,
      hit_rank: (titleHit ? 3 : 0) + (notesHit ? 1 : 0),
    });
  }
  tasks.sort((a, b) => b.hit_rank - a.hit_rank || a.title.localeCompare(b.title));

  const comments: SearchHit[] = [];
  for (const c of state.task_comments) {
    const task = tasksById.get(c.task_id);
    if (!task) continue;
    if (visibleProjectIds && !visibleProjectIds.has(task.project_id)) continue;
    const body = notesPlainText(c.body);
    if (!matches(body, q)) continue;
    const project = projectsById.get(task.project_id);
    comments.push({
      kind: "comment",
      id: c.id,
      title: task.title?.trim() || "Comment",
      subtitle: project?.name ?? "",
      snippet: clip(body),
      project_id: task.project_id,
      task_id: c.task_id,
      client_id: project?.client_id ?? null,
      task_status: task.status,
      hit_rank: 2,
    });
  }
  comments.sort((a, b) => b.hit_rank - a.hit_rank || a.title.localeCompare(b.title));

  return [
    ...matchedClientHits,
    ...projects.slice(0, projectLim),
    ...tasks.slice(0, per),
    ...comments.slice(0, per),
  ]
    .sort((a, b) => b.hit_rank - a.hit_rank || a.title.localeCompare(b.title))
    .slice(0, limit);
}
