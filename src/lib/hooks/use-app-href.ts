"use client";

import { usePathname } from "next/navigation";
import { useData } from "@/lib/data/store";
import {
  budgetRelativePath,
  favoriteNavContext,
  normalizeAppPath,
  projectRelativePath,
  stripWorkspacePrefix,
  tasksReportRelativePath,
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
 * Favorite link target depends on where you are:
 * - Tasks report → that project's tasks filter
 * - Budgets report → that project's budget detail
 * - Elsewhere → project hub
 */
export function useFavoriteProjectHref(): (
  project: Pick<Project, "id" | "client_id" | "slug">,
) => string {
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const budgetHref = useBudgetHref();
  const pathForNav = usePathForNav();
  const context = favoriteNavContext(pathForNav);

  return (project) => {
    if (context === "tasks") return appHref(tasksReportRelativePath(project.id));
    if (context === "budget") return budgetHref(project);
    return projectHref(project);
  };
}

/** Whether a favorite matches the current project in the current nav context. */
export function isFavoriteProjectActive(
  project: Pick<Project, "id" | "client_id" | "slug">,
  pathForNav: string,
  clients: Pick<Client, "id" | "slug">[],
  tasksProjectParam: string | null,
): boolean {
  const context = favoriteNavContext(pathForNav);
  if (context === "tasks") {
    return tasksProjectParam === project.id;
  }
  if (context === "budget") {
    const rel = budgetRelativePath(project, clients);
    return pathForNav === rel || pathForNav.startsWith(`${rel}/`);
  }
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
