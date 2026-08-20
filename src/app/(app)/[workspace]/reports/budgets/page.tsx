"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";
import { Search } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ReportBreadcrumb } from "@/components/nav/breadcrumbs";
import { FavoritesSidebar } from "@/components/nav/favorites-sidebar";
import { BudgetCard, BudgetListRow } from "@/components/budgets/budget-card";
import {
  ProjectManagerFilterBar,
  useProjectManagerFilter,
} from "@/components/projects/project-manager-filter-bar";
import { BudgetStatusLine } from "@/components/reports/budget-status-line";
import type { BudgetStatusFilter } from "@/components/reports/budget-status-line";
import { ListCardsViewToggle } from "@/components/ui/list-cards-view-toggle";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import { budgetHealth, formatMoney, listedBudgetAmount } from "@/lib/domain/budget";
import { convertAmount, projectCurrency } from "@/lib/domain/currency";
import { CurrencyChip } from "@/components/ui/currency-chip";
import { useBudgetHref } from "@/lib/hooks/use-app-href";
import {
  useMonthlyRetainerYearBarsMap,
  useProjectBurnsMap,
} from "@/lib/hooks/use-aggregates";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import {
  sortClientsByName,
  sortProjectsByClientThenName,
} from "@/lib/domain/sorting";
import { nonSandboxProjects } from "@/lib/domain/project-access";
import {
  useLiveUserViewPrefs,
  writeUserViewPrefs,
} from "@/lib/user-view-prefs";
import { cn } from "@/lib/cn";
import type { Client, Project } from "@/lib/types";

type ClientFilter = "all" | "none" | string;

const GRID_COLUMNS = 3;

type ClientGroup = { client: Client | null; projects: Project[] };

type PackedRowSegment = { client: Client | null; projects: Project[] };

type PackedRow = { segments: PackedRowSegment[] };

/** Pack ordered client groups into filled rows; repeat client headers when a group wraps. */
function packProjectRows(groups: ClientGroup[], columns = GRID_COLUMNS): PackedRow[] {
  const rows: PackedRow[] = [];
  let currentRow: PackedRow = { segments: [] };
  let slotsUsed = 0;

  const flushRow = () => {
    if (currentRow.segments.length > 0) {
      rows.push(currentRow);
      currentRow = { segments: [] };
      slotsUsed = 0;
    }
  };

  for (const { client, projects } of groups) {
    let index = 0;
    while (index < projects.length) {
      if (slotsUsed >= columns) flushRow();

      const take = Math.min(columns - slotsUsed, projects.length - index);
      const chunk = projects.slice(index, index + take);
      currentRow.segments.push({ client, projects: chunk });
      slotsUsed += take;
      index += take;
    }
  }

  flushRow();
  return rows;
}

function clientGroupKey(client: Client | null): string {
  return client?.id ?? "none";
}

const BUDGET_FILTER_DEFAULTS: {
  q: string;
  client: string;
  pm: string;
  health: string;
} = {
  q: "",
  client: "all",
  pm: "all",
  health: "all",
};

export default function BudgetsReportPage() {
  return (
    <Suspense fallback={null}>
      <BudgetsReportContent />
    </Suspense>
  );
}

function BudgetsReportContent() {
  const { state, profile } = useData();
  const budgetHref = useBudgetHref();
  const { burns, ready: burnsReady } = useProjectBurnsMap();
  const budgetYear = new Date().getFullYear();
  const { barsByProject, ready: barsReady } =
    useMonthlyRetainerYearBarsMap(budgetYear);
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");
  const viewPrefs = useLiveUserViewPrefs(profile?.id);
  const directoryLayout = viewPrefs.directoryLayout;
  const { filters, setFilter, setFilters } = useUrlFilters(
    BUDGET_FILTER_DEFAULTS,
    { debounceMs: { q: 250 } },
  );
  const query = filters.q;
  const clientFilter = filters.client as ClientFilter;

  const activeProjects = useMemo(
    () => nonSandboxProjects(state.projects).filter((p) => p.status === "active"),
    [state.projects],
  );
  const projects = sortProjectsByClientThenName(activeProjects, state.clients);
  const clients = sortClientsByName(state.clients);

  const { managerTabs, managerFilter, setManagerFilter } =
    useProjectManagerFilter(activeProjects, state.people, {
      value: filters.pm,
      onChange: (next) => setFilter("pm", next),
    });

  // Legacy deep link (?project=) → dedicated budget detail page.
  useEffect(() => {
    if (!projectParam) return;
    const project = state.projects.find((p) => p.id === projectParam);
    if (!project) return;
    router.replace(budgetHref(project));
  }, [projectParam, state.projects, router, budgetHref]);

  useEffect(() => {
    if (
      clientFilter !== "all" &&
      clientFilter !== "none" &&
      !state.clients.some((c) => c.id === clientFilter)
    ) {
      setFilters({ client: "all" });
    }
  }, [clientFilter, state.clients, setFilters]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (clientFilter === "none" && project.client_id) return false;
      if (
        clientFilter !== "all" &&
        clientFilter !== "none" &&
        project.client_id !== clientFilter
      ) {
        return false;
      }
      if (
        managerFilter !== "all" &&
        project.manager_person_id !== managerFilter
      ) {
        return false;
      }
      if (!q) return true;
      const client = state.clients.find((c) => c.id === project.client_id);
      const haystack = [
        project.name,
        client?.name ?? "",
        project.status.replace("_", " "),
        project.notes,
        project.budget_monthly_reset ? "monthly retainer" : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [projects, clientFilter, managerFilter, query, state.clients]);

  const dollarTotals = useMemo(() => {
    const settings = state.organization_settings;
    let projectUsd = 0;
    let projectCad = 0;
    let monthlyUsd = 0;
    let monthlyCad = 0;
    for (const project of filtered) {
      const amount = listedBudgetAmount(project, settings);
      if (amount <= 0) continue;
      const from = projectCurrency(project, settings.currency_enabled);
      const usd = convertAmount(
        amount,
        from,
        "usd",
        settings.usd_to_cad_rate,
        settings.currency_enabled,
      );
      const cad = convertAmount(
        amount,
        from,
        "cad",
        settings.usd_to_cad_rate,
        settings.currency_enabled,
      );
      if (project.budget_monthly_reset) {
        monthlyUsd += usd;
        monthlyCad += cad;
      } else {
        projectUsd += usd;
        projectCad += cad;
      }
    }
    return {
      enabled: settings.currency_enabled,
      projectUsd,
      projectCad,
      monthlyUsd,
      monthlyCad,
    };
  }, [filtered, state.organization_settings]);

  const healthFilter = (
    ["all", "tracked", "healthy", "near", "over"].includes(filters.health)
      ? filters.health
      : "all"
  ) as BudgetStatusFilter;

  const budgetStatus = useMemo(() => {
    let tracked = 0;
    let healthy = 0;
    let near = 0;
    let over = 0;
    if (burnsReady) {
      for (const project of filtered) {
        const burn = burns.get(project.id);
        if (!burn || burn.mode === "none") continue;
        tracked += 1;
        const health = budgetHealth(burn, state.organization_settings);
        if (health === "healthy") healthy += 1;
        else if (health === "near") near += 1;
        else if (health === "over") over += 1;
      }
    }
    return {
      all: filtered.length,
      tracked,
      healthy,
      near,
      over,
    };
  }, [filtered, burns, burnsReady, state.organization_settings]);

  const displayProjects = useMemo(() => {
    if (healthFilter === "all") return filtered;
    if (!burnsReady) return filtered;
    return filtered.filter((project) => {
      const burn = burns.get(project.id);
      if (!burn) return false;
      if (healthFilter === "tracked") return burn.mode !== "none";
      if (burn.mode === "none") return false;
      return budgetHealth(burn, state.organization_settings) === healthFilter;
    });
  }, [filtered, healthFilter, burns, burnsReady, state.organization_settings]);

  const groups = useMemo(() => {
    const byClient = new Map<string | null, Project[]>();
    for (const project of displayProjects) {
      const key = project.client_id;
      const list = byClient.get(key) ?? [];
      list.push(project);
      byClient.set(key, list);
    }
    const ordered: ClientGroup[] = [];
    for (const client of clients) {
      const list = byClient.get(client.id);
      if (list?.length) ordered.push({ client, projects: list });
    }
    const noClient = byClient.get(null);
    if (noClient?.length) ordered.push({ client: null, projects: noClient });
    return ordered;
  }, [displayProjects, clients]);

  const packedRows = useMemo(() => packProjectRows(groups), [groups]);

  const clientCounts = useMemo(() => {
    const counts = new Map<string | "none", number>();
    for (const p of projects) {
      const key = p.client_id ?? "none";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [projects]);

  return (
    <PageContainer>
      <PageHeader title={<ReportBreadcrumb current="Budgets" />} />
      {state.projects.length === 0 ? (
        <div className="py-5">
          <p className="text-sm text-[var(--text-muted)]">No projects yet.</p>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row md:gap-5">
          <aside className="sticky top-3 mt-3 hidden max-h-[calc(100dvh-5.5rem)] w-64 shrink-0 flex-col self-start overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] sm:top-5 sm:mt-5 md:flex">
            <div className="shrink-0 border-b border-[var(--border)] p-2">
              <label className="relative block">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setFilter("q", e.target.value)}
                  placeholder="Search…"
                  className={cn(inputClass, "h-8 pl-8 text-sm")}
                  aria-label="Search projects"
                />
              </label>
            </div>
            <FavoritesSidebar />
            <nav className="space-y-0.5 p-2" aria-label="Clients">
              <ClientNavButton
                active={clientFilter === "all"}
                onClick={() => setFilter("client", "all")}
                label="All Clients"
                count={projects.length}
              />
              {clients.map((client) => (
                <ClientNavButton
                  key={client.id}
                  active={clientFilter === client.id}
                  onClick={() => setFilter("client", client.id)}
                  label={client.name}
                  count={clientCounts.get(client.id) ?? 0}
                  color={client.color}
                />
              ))}
              {(clientCounts.get("none") ?? 0) > 0 ? (
                <ClientNavButton
                  active={clientFilter === "none"}
                  onClick={() => setFilter("client", "none")}
                  label="No Client"
                  count={clientCounts.get("none") ?? 0}
                />
              ) : null}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 py-3 sm:py-5">
            <ProjectManagerFilterBar
              className="mb-4"
              title="Project Manager"
              managerTabs={managerTabs}
              managerFilter={managerFilter}
              onSelect={setManagerFilter}
            />

            <div className="mb-4 flex flex-wrap items-center gap-2">
              <BudgetStatusLine
                all={budgetStatus.all}
                tracked={budgetStatus.tracked}
                healthy={budgetStatus.healthy}
                near={budgetStatus.near}
                over={budgetStatus.over}
                active={healthFilter}
                onSelect={(next) => setFilter("health", next)}
                className="min-w-0"
              />
              <ListCardsViewToggle
                className="ml-auto"
                value={directoryLayout}
                onChange={(next) => {
                  if (!profile?.id) return;
                  writeUserViewPrefs(profile.id, {
                    ...viewPrefs,
                    directoryLayout: next,
                  });
                }}
              />
            </div>

            <div className="mb-8 grid gap-3 sm:grid-cols-2">
              <DollarTotalCard
                label="Project Budgets"
                totals={dollarTotals}
                kind="project"
              />
              <DollarTotalCard
                label="Monthly Repeating Budgets"
                totals={dollarTotals}
                kind="monthly"
              />
            </div>

            <label className="relative mb-4 block md:hidden">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setFilter("q", e.target.value)}
                placeholder="Search projects or clients…"
                className={cn(inputClass, "pl-9")}
                aria-label="Search projects"
              />
            </label>

            <div className="mb-4 flex gap-1 overflow-x-auto md:hidden">
              <MobileClientChip
                active={clientFilter === "all"}
                onClick={() => setFilter("client", "all")}
                label="All"
              />
              {clients.map((c) => (
                <MobileClientChip
                  key={c.id}
                  active={clientFilter === c.id}
                  onClick={() => setFilter("client", c.id)}
                  label={c.name}
                  color={c.color}
                />
              ))}
              {(clientCounts.get("none") ?? 0) > 0 ? (
                <MobileClientChip
                  active={clientFilter === "none"}
                  onClick={() => setFilter("client", "none")}
                  label="No Client"
                />
              ) : null}
            </div>

            {groups.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                No projects match
                {query.trim() ? ` “${query.trim()}”` : ""}.
              </p>
            ) : directoryLayout === "list" ? (
              <div className="space-y-6">
                {groups.map(({ client, projects: groupProjects }) => (
                  <section key={clientGroupKey(client)}>
                    <div className="mb-4 flex items-center gap-2 border-b border-[var(--section-rule)] px-1 pb-2">
                      {client ? (
                        <ProjectColorBar color={client.color} />
                      ) : null}
                      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                        {client?.name ?? "No Client"}
                      </h2>
                      <span className="text-xs text-[var(--text-muted)]">
                        {groupProjects.length} project
                        {groupProjects.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]">
                      {groupProjects.map((project) => (
                        <BudgetListRow
                          key={project.id}
                          project={project}
                          href={budgetHref(project)}
                          burns={burns}
                          burnsReady={burnsReady}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {packedRows.map((row, rowIndex) => (
                  <section key={rowIndex}>
                    <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      {row.segments.map((segment, segmentIndex) => (
                        <div
                          key={`${clientGroupKey(segment.client)}-${segmentIndex}`}
                          className="flex min-w-0 items-center gap-2 border-b border-[var(--section-rule)] px-1 pb-2"
                          style={{
                            gridColumn: `span ${Math.min(segment.projects.length, GRID_COLUMNS)}`,
                          }}
                        >
                          {segment.client ? (
                            <ProjectColorBar color={segment.client.color} />
                          ) : null}
                          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                            {segment.client?.name ?? "No Client"}
                          </h2>
                          <span className="shrink-0 text-xs text-[var(--text-muted)]">
                            {segment.projects.length} project
                            {segment.projects.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      {row.segments.flatMap((segment) =>
                        segment.projects.map((project) => (
                          <BudgetCard
                            key={project.id}
                            project={project}
                            href={budgetHref(project)}
                            burns={burns}
                            burnsReady={burnsReady}
                            barsByProject={barsByProject}
                            barsReady={barsReady}
                          />
                        )),
                      )}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function ClientNavButton({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        active
          ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
          : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
      )}
    >
      {color ? (
        <ProjectColorBar color={color} size="sm" />
      ) : (
        <ProjectColorBar color="var(--border)" size="sm" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
        {count}
      </span>
    </button>
  );
}

function DollarTotalCard({
  label,
  totals,
  kind,
}: {
  label: string;
  totals: {
    enabled: boolean;
    projectUsd: number;
    projectCad: number;
    monthlyUsd: number;
    monthlyCad: number;
  };
  kind: "project" | "monthly";
}) {
  const usd = kind === "project" ? totals.projectUsd : totals.monthlyUsd;
  const cad = kind === "project" ? totals.projectCad : totals.monthlyCad;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      {totals.enabled ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            {formatMoney(usd)}
            <CurrencyChip currency="usd" />
          </span>
          <span className="inline-flex items-center gap-1.5">
            {formatMoney(cad)}
            <CurrencyChip currency="cad" />
          </span>
        </div>
      ) : (
        <div className="mt-1.5 text-sm tabular-nums">{formatMoney(usd)}</div>
      )}
    </div>
  );
}

function MobileClientChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs",
        active
          ? "border-[var(--text)] bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
          : "border-[var(--border)] text-[var(--text-muted)]",
      )}
    >
      {color ? <ProjectColorBar color={color} size="sm" /> : null}
      {label}
    </button>
  );
}
