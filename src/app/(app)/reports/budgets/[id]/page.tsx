"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useData } from "@/lib/data/store";
import { useAppHref, useBudgetHref } from "@/lib/hooks/use-app-href";

/**
 * Temporary UUID → pretty budget URL redirect.
 * Param may be `id` or `clientSlug` (share single-segment shim).
 */
export default function BudgetUuidRedirectPage() {
  const params = useParams<{ id?: string; clientSlug?: string }>();
  const projectId = params.id ?? params.clientSlug;
  const router = useRouter();
  const { ready, state } = useData();
  const budgetHref = useBudgetHref();
  const appHref = useAppHref();

  useEffect(() => {
    if (!ready || !projectId) return;
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) {
      router.replace(appHref("/reports/budgets"));
      return;
    }
    router.replace(budgetHref(project));
  }, [ready, projectId, budgetHref, appHref, router, state.projects]);

  return (
    <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
      Redirecting…
    </div>
  );
}
