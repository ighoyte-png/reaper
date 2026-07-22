"use client";

import { useData } from "@/lib/data/store";
import {
  budgetRelativePath,
  normalizeAppPath,
  projectRelativePath,
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
