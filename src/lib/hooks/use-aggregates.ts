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
import type {
  MonthlyRetainerYearBarRow,
  ProjectBudgetBurnRow,
} from "@/lib/supabase/api";

/** Shared in-flight / settled RPC results so N hook mounts = 1 fetch. */
type BurnsCacheEntry =
  | { status: "loading"; promise: Promise<Map<string, BudgetBurn> | null> }
  | { status: "done"; value: Map<string, BudgetBurn> | null };

type YearBarsCacheEntry =
  | { status: "loading"; promise: Promise<MonthlyRetainerYearBarRow[] | null> }
  | { status: "done"; value: MonthlyRetainerYearBarRow[] | null };

const burnsRpcCache = new Map<string, BurnsCacheEntry>();
const yearBarsRpcCache = new Map<string, YearBarsCacheEntry>();

function loadBurnsRpcOnce(
  orgId: string,
  fetch: () => Promise<ProjectBudgetBurnRow[] | null>,
): Promise<Map<string, BudgetBurn> | null> {
  const existing = burnsRpcCache.get(orgId);
  if (existing?.status === "done") {
    return Promise.resolve(existing.value);
  }
  if (existing?.status === "loading") {
    return existing.promise;
  }
  const promise = (async () => {
    const rows = await fetch();
    const value =
      rows == null
        ? null
        : new Map(rows.map((r) => [r.project_id, burnFromRpcRow(r)]));
    burnsRpcCache.set(orgId, { status: "done", value });
    return value;
  })().catch((err) => {
    burnsRpcCache.delete(orgId);
    throw err;
  });
  burnsRpcCache.set(orgId, { status: "loading", promise });
  return promise;
}

function loadYearBarsRpcOnce(
  orgId: string,
  year: number,
  fetch: (year: number) => Promise<MonthlyRetainerYearBarRow[] | null>,
): Promise<MonthlyRetainerYearBarRow[] | null> {
  const key = `${orgId}:${year}`;
  const existing = yearBarsRpcCache.get(key);
  if (existing?.status === "done") {
    return Promise.resolve(existing.value);
  }
  if (existing?.status === "loading") {
    return existing.promise;
  }
  const promise = (async () => {
    const rows = await fetch(year);
    yearBarsRpcCache.set(key, { status: "done", value: rows });
    return rows;
  })().catch((err) => {
    yearBarsRpcCache.delete(key);
    throw err;
  });
  yearBarsRpcCache.set(key, { status: "loading", promise });
  return promise;
}

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
  >(() => {
    if (mode === "demo") return null;
    const cached = burnsRpcCache.get(state.organization.id);
    return cached?.status === "done" ? cached.value : undefined;
  });
  const [ready, setReady] = useState(
    () =>
      mode === "demo" ||
      burnsRpcCache.get(state.organization.id)?.status === "done",
  );
  const orgId = state.organization.id;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (mode === "demo") {
        setRpcBurns(null);
        setReady(true);
        return;
      }
      const cached = burnsRpcCache.get(orgId);
      if (cached?.status === "done") {
        setRpcBurns(cached.value);
        setReady(true);
        return;
      }
      setRpcBurns(undefined);
      setReady(false);
      try {
        const value = await loadBurnsRpcOnce(orgId, fetchProjectBudgetBurnsRpc);
        if (cancelled) return;
        setRpcBurns(value);
        setReady(true);
      } catch {
        if (cancelled) return;
        setRpcBurns(null);
        setReady(true);
      }
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
  const cacheKey = `${state.organization.id}:${year}`;
  const [rpcRows, setRpcRows] = useState<
    MonthlyRetainerYearBarRow[] | null | undefined
  >(() => {
    if (mode === "demo") return null;
    const cached = yearBarsRpcCache.get(cacheKey);
    return cached?.status === "done" ? cached.value : undefined;
  });
  const [ready, setReady] = useState(
    () =>
      mode === "demo" || yearBarsRpcCache.get(cacheKey)?.status === "done",
  );
  const orgId = state.organization.id;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (mode === "demo") {
        setRpcRows(null);
        setReady(true);
        return;
      }
      const key = `${orgId}:${year}`;
      const cached = yearBarsRpcCache.get(key);
      if (cached?.status === "done") {
        setRpcRows(cached.value);
        setReady(true);
        return;
      }
      setRpcRows(undefined);
      setReady(false);
      try {
        const rows = await loadYearBarsRpcOnce(
          orgId,
          year,
          fetchMonthlyRetainerYearBarsRpc,
        );
        if (cancelled) return;
        setRpcRows(rows);
        setReady(true);
      } catch {
        if (cancelled) return;
        setRpcRows(null);
        setReady(true);
      }
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
