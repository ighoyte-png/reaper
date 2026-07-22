import {
  UNCATEGORIZED_CLIENT_SLUG,
  clientSlugForProject,
} from "@/lib/slug";
import type { Client, Project } from "@/lib/types";

/** Normalize a path to always start with `/`. */
export function normalizeAppPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Prefix an in-app path with the workspace slug.
 * `workspacePath("northstar", "/dashboard")` → `/northstar/dashboard`
 */
export function workspacePath(workspaceSlug: string, path: string): string {
  const normalized = normalizeAppPath(path);
  if (!workspaceSlug) return normalized;
  return `/${workspaceSlug}${normalized}`;
}

/** Strip `/{workspace}` from a pathname for nav active / route-guard checks. */
export function stripWorkspacePrefix(
  pathname: string,
  workspaceSlug: string,
): string {
  if (!workspaceSlug) return pathname;
  if (pathname === `/${workspaceSlug}`) return "/";
  if (pathname.startsWith(`/${workspaceSlug}/`)) {
    return pathname.slice(workspaceSlug.length + 1) || "/";
  }
  return pathname;
}

/** Project hub path segments (no workspace prefix). */
export function projectRelativePath(
  project: Pick<Project, "client_id" | "slug">,
  clients: Pick<Client, "id" | "slug">[],
  search?: string,
): string {
  const clientSlug = clientSlugForProject(project, clients);
  const base = `/projects/${clientSlug}/${project.slug || "project"}`;
  if (!search) return base;
  const q = search.startsWith("?") ? search.slice(1) : search;
  return q ? `${base}?${q}` : base;
}

/** Budget detail path segments (no workspace prefix). */
export function budgetRelativePath(
  project: Pick<Project, "client_id" | "slug">,
  clients: Pick<Client, "id" | "slug">[],
): string {
  const clientSlug = clientSlugForProject(project, clients);
  return `/reports/budgets/${clientSlug}/${project.slug || "project"}`;
}

export function projectPath(
  workspaceSlug: string,
  project: Pick<Project, "client_id" | "slug">,
  clients: Pick<Client, "id" | "slug">[],
  search?: string,
): string {
  return workspacePath(
    workspaceSlug,
    projectRelativePath(project, clients, search),
  );
}

export function budgetPath(
  workspaceSlug: string,
  project: Pick<Project, "client_id" | "slug">,
  clients: Pick<Client, "id" | "slug">[],
): string {
  return workspacePath(
    workspaceSlug,
    budgetRelativePath(project, clients),
  );
}

export { UNCATEGORIZED_CLIENT_SLUG, clientSlugForProject };
