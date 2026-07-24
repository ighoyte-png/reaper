import type { Client, Project, ProjectFavorite } from "@/lib/types";
import { projectLabelWithClient } from "@/lib/domain/sorting";

/** Favorites for this profile, ordered, with missing projects dropped. */
export function orderedFavoriteProjects(
  favorites: ProjectFavorite[],
  projects: Project[],
  profileId: string | null | undefined,
): Project[] {
  if (!profileId) return [];
  const byId = new Map(projects.map((p) => [p.id, p]));
  return [...favorites]
    .filter((f) => f.profile_id === profileId)
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
    )
    .map((f) => byId.get(f.project_id))
    .filter((p): p is Project => Boolean(p));
}

export function isProjectFavorited(
  favorites: ProjectFavorite[],
  profileId: string | null | undefined,
  projectId: string,
): boolean {
  if (!profileId) return false;
  return favorites.some(
    (f) => f.profile_id === profileId && f.project_id === projectId,
  );
}

export function favoriteProjectLabel(
  project: Project,
  clients: Client[],
): string {
  return projectLabelWithClient(project, clients);
}
