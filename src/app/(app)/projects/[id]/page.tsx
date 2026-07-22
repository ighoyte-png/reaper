"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";

/**
 * Temporary UUID → pretty project URL redirect.
 * Param may be `id` (/projects/[id]) or `clientSlug` (share single-segment shim).
 */
export default function ProjectUuidRedirectPage() {
  const params = useParams<{ id?: string; clientSlug?: string }>();
  const projectId = params.id ?? params.clientSlug;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { ready, state } = useData();
  const projectHref = useProjectHref();
  const appHref = useAppHref();

  useEffect(() => {
    if (!ready || !projectId) return;
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) {
      router.replace(appHref("/projects"));
      return;
    }
    const qs = searchParams.toString();
    router.replace(projectHref(project, qs || undefined));
  }, [
    ready,
    projectId,
    projectHref,
    appHref,
    router,
    searchParams,
    state.projects,
  ]);

  return (
    <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
      Redirecting…
    </div>
  );
}
