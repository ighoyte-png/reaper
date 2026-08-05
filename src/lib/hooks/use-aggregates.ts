"use client";

import { useMemo } from "react";
import { useData } from "@/lib/data/store";
import { budgetBurn } from "@/lib/domain/budget";
import type { BudgetBurn } from "@/lib/types";

/** Project burns computed client-side so contractor roster terms apply. */
export function useProjectBurnsMap(): {
  burns: Map<string, BudgetBurn>;
  ready: boolean;
} {
  const { state } = useData();

  const burns = useMemo(() => {
    const map = new Map<string, BudgetBurn>();
    for (const p of state.projects) {
      if (p.sandbox_mode) continue;
      const membersForProject = state.project_members.filter(
        (m) => m.project_id === p.id,
      );
      map.set(
        p.id,
        budgetBurn(
          p,
          state.assignments,
          state.people,
          false,
          new Date(),
          membersForProject,
        ),
      );
    }
    return map;
  }, [
    state.projects,
    state.assignments,
    state.people,
    state.project_members,
  ]);

  return { burns, ready: true };
}
