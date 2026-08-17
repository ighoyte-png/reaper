"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/data/store";
import {
  burnFromRpcRow,
  monthlyYearBarsFromRpcRows,
} from "@/lib/data/rpc-map";
import {
  budgetBurn,
  calendarYearBars,
  type MonthBurnBar,
} from "@/lib/domain/budget";
import type { BudgetBurn } from "@/lib/types";
import type { MonthlyRetainerYearBarRow } from "@/lib/supabase/api";

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
      const expensesForProject = state.project_contractor_expenses.filter(
        (e) => e.project_id === p.id,
      );
      const clientBurn = () =>
        budgetBurn(
          p,
          state.assignments,
          state.people,
          false,
          new Date(),
          membersForProject,
          expensesForProject,
          state.organization_settings,
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
    state.project_contractor_expenses,
    state.organization_settings,
    dataStatus.projects,
  ]);

  return { burns, ready };
}

/**
 * Monthly-retainer Jan–Dec bars via RPC. Client calendarYearBars only for
 * projects already loaded (assignments present).
 */
export function useMonthlyRetainerYearBarsMap(year: number): {
  barsByProject: Map<string, MonthBurnBar[]>;
  ready: boolean;
} {
  const { mode, state, dataStatus, fetchMonthlyRetainerYearBarsRpc } =
    useData();
  const [rpcRows, setRpcRows] = useState<
    MonthlyRetainerYearBarRow[] | null | undefined
  >(mode === "demo" ? null : undefined);
  const [ready, setReady] = useState(mode === "demo");
  const orgId = state.organization.id;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (mode === "demo") {
        setRpcRows(null);
        setReady(true);
        return;
      }
      setRpcRows(undefined);
      setReady(false);
      const rows = await fetchMonthlyRetainerYearBarsRpc(year);
      if (cancelled) return;
      setRpcRows(rows);
      setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, orgId, year, fetchMonthlyRetainerYearBarsRpc]);

  const barsByProject = useMemo(() => {
    const map = new Map<string, MonthBurnBar[]>();
    const monthly = state.projects.filter(
      (p) =>
        !p.sandbox_mode &&
        (p.budget_mode === "hours" || p.budget_mode === "amount") &&
        p.budget_monthly_reset,
    );

    for (const p of monthly) {
      const membersForProject = state.project_members.filter(
        (m) => m.project_id === p.id,
      );
      const expensesForProject = state.project_contractor_expenses.filter(
        (e) => e.project_id === p.id,
      );
      const projectReady = dataStatus.projects[p.id] === "ready";
      if (projectReady || mode === "demo") {
        map.set(
          p.id,
          calendarYearBars(
            p,
            state.assignments,
            state.people,
            year,
            new Date(),
            membersForProject,
            expensesForProject,
            state.organization_settings,
          ),
        );
        continue;
      }
      if (rpcRows) {
        map.set(p.id, monthlyYearBarsFromRpcRows(p, year, rpcRows));
      }
    }
    return map;
  }, [
    rpcRows,
    mode,
    year,
    state.projects,
    state.assignments,
    state.people,
    state.project_members,
    state.project_contractor_expenses,
    dataStatus.projects,
  ]);

  return { barsByProject, ready };
}
