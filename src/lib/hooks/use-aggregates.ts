"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/data/store";
import { burnFromRpcRow } from "@/lib/data/rpc-map";
import { budgetBurn } from "@/lib/domain/budget";
import type { BudgetBurn } from "@/lib/types";

/** Project burns via RPC (supabase) with TS fallback after heavy load / demo. */
export function useProjectBurnsMap(): {
  burns: Map<string, BudgetBurn>;
  ready: boolean;
} {
  const {
    mode,
    state,
    fetchProjectBudgetBurnsRpc,
    ensureOrgHeavyData,
  } = useData();
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
        setReady(true);
        return;
      }
      try {
        await ensureOrgHeavyData();
      } catch {
        /* soft-fail */
      }
      if (!cancelled) setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, fetchProjectBudgetBurnsRpc, ensureOrgHeavyData]);

  const burns = useMemo(() => {
    if (rpcBurns) return rpcBurns;
    const map = new Map<string, BudgetBurn>();
    for (const p of state.projects) {
      map.set(p.id, budgetBurn(p, state.assignments, state.people));
    }
    return map;
  }, [rpcBurns, state.projects, state.assignments, state.people]);

  return { burns, ready };
}
