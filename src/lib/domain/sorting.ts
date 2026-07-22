import type { Client, Project, ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export function clientNameOf(
  project: Project,
  clients: Client[] | Map<string, Client>,
): string {
  if (!project.client_id) return "";
  if (clients instanceof Map) {
    return clients.get(project.client_id)?.name ?? "";
  }
  return clients.find((c) => c.id === project.client_id)?.name ?? "";
}

/** Schedule/UI color comes from the client; fallback for no-client projects. */
export function projectDisplayColor(
  project: Pick<Project, "color" | "client_id">,
  clients: Client[] | Map<string, Client> | { id: string; color: string }[],
): string {
  if (!project.client_id) return project.color || "#64748B";
  if (clients instanceof Map) {
    return clients.get(project.client_id)?.color ?? project.color ?? "#64748B";
  }
  return (
    clients.find((c) => c.id === project.client_id)?.color ??
    project.color ??
    "#64748B"
  );
}

export function projectStatusLabel(status: ProjectStatus | string): string {
  return String(status).replace("_", " ");
}

/** Color-coded lifecycle pill classes for project status tags. */
export function projectStatusClass(status: ProjectStatus | string): string {
  switch (status) {
    case "active":
      return "bg-[var(--accent)]/15 text-[var(--accent)]";
    case "on_hold":
      return "bg-[var(--status-near)]/15 text-[var(--status-near)]";
    case "completed":
      return "bg-[var(--status-healthy)]/15 text-[var(--status-healthy)]";
    case "archived":
      return "bg-[var(--bg-elevated)] text-[var(--text-muted)]";
    default:
      return "bg-[var(--bg-elevated)] text-[var(--text-muted)]";
  }
}

export function projectStatusPillClass(status: ProjectStatus | string): string {
  return cn(
    "rounded px-1.5 py-0.5 text-[11px] capitalize tracking-wide",
    projectStatusClass(status),
  );
}

/** Sort projects: client name A–Z, then project title A–Z (no-client last). */
export function sortProjectsByClientThenName(
  projects: Project[],
  clients: Client[],
): Project[] {
  const byId = new Map(clients.map((c) => [c.id, c]));
  return [...projects].sort((a, b) => {
    const ca = clientNameOf(a, byId);
    const cb = clientNameOf(b, byId);
    const aBlank = !ca;
    const bBlank = !cb;
    if (aBlank !== bBlank) return aBlank ? 1 : -1;
    const byClient = ca.localeCompare(cb, undefined, { sensitivity: "base" });
    if (byClient !== 0) return byClient;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function sortClientsByName(clients: Client[]): Client[] {
  return [...clients].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function sortPeopleByName<T extends { name: string }>(people: T[]): T[] {
  return [...people].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

export function projectLabelWithClient(
  project: Project,
  clients: Client[] | Map<string, Client>,
): string {
  const client = clientNameOf(project, clients);
  return client ? `${client} - ${project.name}` : project.name;
}
