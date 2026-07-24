"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/data/store";
import { burnFromRpcRow } from "@/lib/data/rpc-map";
import { budgetBurn } from "@/lib/domain/budget";
import type { BudgetBurn } from "@/lib/types";

/** Project burns via RPC (supabase). Soft-fails to empty/demo TS math — never org-heavy. */
export function useProjectBurnsMap(): {
  burns: Map<string, BudgetBurn>;
  ready: boolean;
} {
  const { mode, state, fetchProjectBudgetBurnsRpc } = useData();
  const [rpcBurns, setRpcBurns] = useState<Map<string, BudgetBurn> | null>(
    null,
  );
  const [ready, setReady] = useState(mode === "demo");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (mode === "demo") {
        setReady(true);
        return;
      }
      const rows = await fetchProjectBudgetBurnsRpc();
      if (cancelled) return;
      if (rows) {
        setRpcBurns(
          new Map(rows.map((r) => [r.project_id, burnFromRpcRow(r)])),
        );
      } else {
        setRpcBurns(new Map());
      }
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, fetchProjectBudgetBurnsRpc]);

  const burns = useMemo(() => {
    if (rpcBurns && mode === "supabase") return rpcBurns;
    const map = new Map<string, BudgetBurn>();
    for (const p of state.projects) {
      map.set(p.id, budgetBurn(p, state.assignments, state.people));
    }
    return map;
  }, [rpcBurns, mode, state.projects, state.assignments, state.people]);

  return { burns, ready };
}
