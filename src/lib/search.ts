import { notesPlainText } from "@/lib/notes-html";
import type { DemoState } from "@/lib/types";

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
  hit_rank: number;
};

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
    "clients" | "projects" | "tasks" | "task_comments" | "profiles"
  >,
  query: string,
  limit = 40,
): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const per = Math.max(3, Math.floor(limit / 4));
  const clientsById = new Map(state.clients.map((c) => [c.id, c]));
  const projectsById = new Map(state.projects.map((p) => [p.id, p]));
  const tasksById = new Map(state.tasks.map((t) => [t.id, t]));

  const clients: SearchHit[] = [];
  for (const c of state.clients) {
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
      hit_rank:
        (nameHit ? 3 : 0) + (notesHit ? 1 : 0) + (viaClient ? 2 : 0),
    });
  }
  projects.sort((a, b) => b.hit_rank - a.hit_rank || a.title.localeCompare(b.title));

  const tasks: SearchHit[] = [];
  for (const t of state.tasks) {
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
      hit_rank: (titleHit ? 3 : 0) + (notesHit ? 1 : 0),
    });
  }
  tasks.sort((a, b) => b.hit_rank - a.hit_rank || a.title.localeCompare(b.title));

  const comments: SearchHit[] = [];
  for (const c of state.task_comments) {
    const body = notesPlainText(c.body);
    if (!matches(body, q)) continue;
    const task = tasksById.get(c.task_id);
    const project = task ? projectsById.get(task.project_id) : null;
    comments.push({
      kind: "comment",
      id: c.id,
      title: task?.title?.trim() || "Comment",
      subtitle: project?.name ?? "",
      snippet: clip(body),
      project_id: task?.project_id ?? null,
      task_id: c.task_id,
      client_id: project?.client_id ?? null,
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
