"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/data/store";
import { burnFromRpcRow } from "@/lib/data/rpc-map";
import { budgetBurn } from "@/lib/domain/budget";
import type { BudgetBurn } from "@/lib/types";

/**
 * Org-wide burns via RPC (no full assignment dump). Prefer precise client
 * `budgetBurn` (contractor roster terms) only for projects already loaded
 * into the store via ensureProjectData.
 */
export function useProjectBurnsMap(): {
  burns: Map<string, BudgetBurn>;
  ready: boolean;
} {
  const { mode, state, dataStatus, fetchProjectBudgetBurnsRpc } = useData();
  /** undefined = loading, null = soft-fail, Map = RPC ok */
  const [rpcBurns, setRpcBurns] = useState<
    Map<string, BudgetBurn> | null | undefined
  >(mode === "demo" ? null : undefined);
  const [ready, setReady] = useState(mode === "demo");
  const orgId = state.organization.id;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (mode === "demo") {
        setRpcBurns(null);
        setReady(true);
        return;
      }
      setRpcBurns(undefined);
      setReady(false);
      const rows = await fetchProjectBudgetBurnsRpc();
      if (cancelled) return;
      if (rows) {
        setRpcBurns(
          new Map(rows.map((r) => [r.project_id, burnFromRpcRow(r)])),
        );
      } else {
        // Soft-fail (incl. public share stub): use client-side burn math.
        setRpcBurns(null);
      }
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, orgId, fetchProjectBudgetBurnsRpc]);

  const burns = useMemo(() => {
    const map = new Map<string, BudgetBurn>();
    const rpcLoading = mode === "supabase" && rpcBurns === undefined;

    for (const p of state.projects) {
      if (p.sandbox_mode) continue;

      const membersForProject = state.project_members.filter(
        (m) => m.project_id === p.id,
      );
      const clientBurn = () =>
        budgetBurn(
          p,
          state.assignments,
          state.people,
          false,
          new Date(),
          membersForProject,
        );

      const projectReady = dataStatus.projects[p.id] === "ready";
      if (projectReady || mode === "demo") {
        map.set(p.id, clientBurn());
        continue;
      }

      if (rpcBurns instanceof Map) {
        map.set(p.id, rpcBurns.get(p.id) ?? clientBurn());
        continue;
      }

      if (rpcLoading) {
        // Avoid publishing zero burns while RPC is in flight.
        continue;
      }

      // Soft-fail: best-effort client math.
      map.set(p.id, clientBurn());
    }
    return map;
  }, [
    rpcBurns,
    mode,
    state.projects,
    state.assignments,
    state.people,
    state.project_members,
    dataStatus.projects,
  ]);

  return { burns, ready };
}
