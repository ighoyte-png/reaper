"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Star } from "lucide-react";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import {
  favoriteProjectLabel,
  orderedFavoriteProjects,
} from "@/lib/domain/project-favorites";
import { projectDisplayColor } from "@/lib/domain/sorting";
import {
  isFavoriteProjectActive,
  useFavoriteProjectHref,
  usePathForNav,
} from "@/lib/hooks/use-app-href";

/** Favorites list for client-filter sidebars (Projects / Budgets / Tasks). */
export function FavoritesSidebar({ className }: { className?: string }) {
  return (
    <Suspense fallback={null}>
      <FavoritesSidebarInner className={className} />
    </Suspense>
  );
}

function FavoritesSidebarInner({ className }: { className?: string }) {
  const { state, profile, isPublicShare } = useData();
  const favoriteHref = useFavoriteProjectHref();
  const pathForNav = usePathForNav();
  const searchParams = useSearchParams();
  const tasksProjectParam = searchParams.get("project");

  const favorites = useMemo(
    () =>
      orderedFavoriteProjects(
        state.project_favorites,
        state.projects,
        profile?.id,
      ),
    [state.project_favorites, state.projects, profile?.id],
  );

  if (isPublicShare || !profile || favorites.length === 0) return null;

  return (
    <div className={cn("border-b border-[var(--border)] p-2", className)}>
      <div className="mb-1.5 flex items-center gap-1.5 px-1.5">
        <Star
          size={12}
          strokeWidth={2}
          className="text-[var(--accent)]"
          fill="currentColor"
          aria-hidden
        />
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Favorites
        </h2>
      </div>
      <nav className="space-y-0.5" aria-label="Favorite projects">
        {favorites.map((project) => {
          const label = favoriteProjectLabel(project, state.clients);
          const active = isFavoriteProjectActive(
            project,
            pathForNav,
            state.clients,
            tasksProjectParam,
          );
          return (
            <Link
              key={project.id}
              href={favoriteHref(project)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                active
                  ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
                  : "text-[var(--text)] hover:bg-[var(--row-hover)]",
              )}
              title={label}
            >
              <ProjectColorBar
                color={projectDisplayColor(project, state.clients)}
                size="sm"
              />
              <span className="min-w-0 truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
