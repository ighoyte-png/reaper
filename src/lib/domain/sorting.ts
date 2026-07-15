import type { Client, Project } from "@/lib/types";

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

export function projectLabelWithClient(
  project: Project,
  clients: Client[] | Map<string, Client>,
): string {
  const client = clientNameOf(project, clients);
  return client ? `${client} - ${project.name}` : project.name;
}
