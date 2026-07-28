"use client";

import { usePathname } from "next/navigation";
import { useData } from "@/lib/data/store";
import {
  budgetRelativePath,
  normalizeAppPath,
  projectRelativePath,
  stripWorkspacePrefix,
  workspacePath,
} from "@/lib/paths";
import type { Client, Project } from "@/lib/types";

/**
 * Prefix app paths for the public share shell and/or workspace slug.
 * Share: `/share/[token]` + path. Signed-in: `/{workspace}` + path.
 */
export function useAppHref(): (path: string) => string {
  const { shareBasePath, state } = useData();
  const workspaceSlug = state.organization.slug ?? "";
  return (path: string) => {
    const normalized = normalizeAppPath(path);
    if (shareBasePath) return `${shareBasePath}${normalized}`;
    return workspacePath(workspaceSlug, normalized);
  };
}

/** App path with workspace/share prefix stripped (for nav matching). */
export function usePathForNav(): string {
  const pathname = usePathname();
  const { shareBasePath, state } = useData();
  if (shareBasePath) {
    return pathname.startsWith(shareBasePath)
      ? pathname.slice(shareBasePath.length) || "/"
      : pathname;
  }
  return stripWorkspacePrefix(pathname, state.organization.slug);
}

/** Pretty project hub URL (workspace- or share-prefixed). */
export function useProjectHref(): (
  project: Pick<Project, "client_id" | "slug">,
  search?: string,
) => string {
  const appHref = useAppHref();
  const { state } = useData();
  return (project, search) =>
    appHref(projectRelativePath(project, state.clients, search));
}

/** Pretty project budget URL (workspace- or share-prefixed). */
export function useBudgetHref(): (
  project: Pick<Project, "client_id" | "slug">,
) => string {
  const appHref = useAppHref();
  const { state } = useData();
  return (project) => appHref(budgetRelativePath(project, state.clients));
}

/**
 * Favorite project links always go to the project hub (not Tasks/Budgets filters).
 */
export function useFavoriteProjectHref(): (
  project: Pick<Project, "id" | "client_id" | "slug">,
) => string {
  const projectHref = useProjectHref();
  return (project) => projectHref(project);
}

/** Whether a favorite matches the current project hub route. */
export function isFavoriteProjectActive(
  project: Pick<Project, "id" | "client_id" | "slug">,
  pathForNav: string,
  clients: Pick<Client, "id" | "slug">[],
): boolean {
  const rel = projectRelativePath(project, clients);
  return pathForNav === rel || pathForNav.startsWith(`${rel}/`);
}

export function resolveProjectBySlugs(
  clients: Client[],
  projects: Project[],
  clientSlug: string,
  projectSlug: string,
): Project | undefined {
  const isUncategorized = clientSlug === "uncategorized";
  const client = isUncategorized
    ? null
    : clients.find((c) => c.slug === clientSlug);
  if (!isUncategorized && !client) return undefined;
  return projects.find(
    (p) =>
      p.slug === projectSlug &&
      (isUncategorized ? !p.client_id : p.client_id === client!.id),
  );
}
