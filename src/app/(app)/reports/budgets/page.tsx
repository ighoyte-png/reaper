"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ReportBreadcrumb } from "@/components/nav/breadcrumbs";
import { BurnBar } from "@/components/ui/burn-bar";
import { inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import {
  budgetBurn,
  budgetHealth,
  formatHours,
  formatMoney,
} from "@/lib/domain/budget";
import { projectForecast } from "@/lib/domain/forecast";
import {
  sortClientsByName,
  sortProjectsByClientThenName,
} from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { Client, Project } from "@/lib/types";

type ClientFilter = "all" | "none" | string;

export default function BudgetsReportPage() {
  return (
    <Suspense fallback={null}>
      <BudgetsReportContent />
    </Suspense>
  );
}

function BudgetsReportContent() {
  const { state } = useData();
  const appHref = useAppHref();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");
  const [clientFilter, setClientFilter] = useState<ClientFilter>("all");
  const [query, setQuery] = useState("");
  const [highlightProjectId, setHighlightProjectId] = useState<string | null>(
    null,
  );

  const projects = sortProjectsByClientThenName(
    state.projects,
    state.clients,
  );
  const clients = sortClientsByName(state.clients);

  // Deep link from a project's "Budget" link: jump the sidebar filter to
  // that project's client and highlight/scroll to its card.
  useEffect(() => {
    if (!projectParam) return;
    const project = state.projects.find((p) => p.id === projectParam);
    if (!project) return;
    setClientFilter(project.client_id ?? "none");
    setHighlightProjectId(project.id);
  }, [projectParam, state.projects]);

  useEffect(() => {
    if (!highlightProjectId) return;
    const el = document.getElementById(`project-card-${highlightProjectId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setHighlightProjectId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightProjectId]);

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
  }, [projects, clientFilter, query, state.clients]);

  const groups = useMemo(() => {
    const byClient = new Map<string | null, Project[]>();
    for (const project of filtered) {
      const key = project.client_id;
      const list = byClient.get(key) ?? [];
      list.push(project);
      byClient.set(key, list);
    }
    const ordered: { client: Client | null; projects: Project[] }[] = [];
    for (const client of clients) {
      const list = byClient.get(client.id);
      if (list?.length) ordered.push({ client, projects: list });
    }
    const noClient = byClient.get(null);
    if (noClient?.length) ordered.push({ client: null, projects: noClient });
    return ordered;
  }, [filtered, clients]);

  const clientCounts = useMemo(() => {
    const counts = new Map<string | "none", number>();
    for (const p of projects) {
      const key = p.client_id ?? "none";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [projects]);

  return (
    <PageContainer className="overflow-hidden">
      <PageHeader title={<ReportBreadcrumb current="Budgets" />} />
      {state.projects.length === 0 ? (
        <div className="overflow-y-auto p-5">
          <p className="text-sm text-[var(--text-muted)]">No projects yet.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="hidden w-52 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] md:flex">
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
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className={cn(inputClass, "h-8 pl-8 text-sm")}
                  aria-label="Search projects"
                />
              </label>
            </div>
            <nav
              className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2"
              aria-label="Clients"
            >
              <ClientNavButton
                active={clientFilter === "all"}
                onClick={() => setClientFilter("all")}
                label="All clients"
                count={projects.length}
              />
              {clients.map((client) => (
                <ClientNavButton
                  key={client.id}
                  active={clientFilter === client.id}
                  onClick={() => setClientFilter(client.id)}
                  label={client.name}
                  count={clientCounts.get(client.id) ?? 0}
                  color={client.color}
                />
              ))}
              {(clientCounts.get("none") ?? 0) > 0 ? (
                <ClientNavButton
                  active={clientFilter === "none"}
                  onClick={() => setClientFilter("none")}
                  label="No client"
                  count={clientCounts.get("none") ?? 0}
                />
              ) : null}
            </nav>
          </aside>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
            <label className="relative mb-4 block md:hidden">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects or clients…"
                className={cn(inputClass, "pl-9")}
                aria-label="Search projects"
              />
            </label>

            <div className="mb-4 flex gap-1 overflow-x-auto md:hidden">
              <MobileClientChip
                active={clientFilter === "all"}
                onClick={() => setClientFilter("all")}
                label="All"
              />
              {clients.map((c) => (
                <MobileClientChip
                  key={c.id}
                  active={clientFilter === c.id}
                  onClick={() => setClientFilter(c.id)}
                  label={c.name}
                  color={c.color}
                />
              ))}
              {(clientCounts.get("none") ?? 0) > 0 ? (
                <MobileClientChip
                  active={clientFilter === "none"}
                  onClick={() => setClientFilter("none")}
                  label="No client"
                />
              ) : null}
            </div>

            {groups.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                No projects match
                {query.trim() ? ` “${query.trim()}”` : ""}.
              </p>
            ) : (
              <div className="space-y-6">
                {groups.map(({ client, projects: groupProjects }) => (
                  <section key={client?.id ?? "none"}>
                    <div className="mb-4 flex items-center gap-2 border-b border-[var(--border)] px-1 pb-2">
                      {client ? (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: client.color }}
                        />
                      ) : null}
                      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                        {client?.name ?? "No client"}
                      </h2>
                      <span className="text-xs text-[var(--text-muted)]">
                        {groupProjects.length} project
                        {groupProjects.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {groupProjects.map((project) => (
                        <BudgetCard
                          key={project.id}
                          project={project}
                          href={appHref(`/projects/${project.id}`)}
                          highlighted={highlightProjectId === project.id}
                        />
                      ))}
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
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
      ) : (
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--border)]" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
        {count}
      </span>
    </button>
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
      {color ? (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: color }}
        />
      ) : null}
      {label}
    </button>
  );
}

function BudgetCard({
  project,
  href,
  highlighted,
}: {
  project: Project;
  href: string;
  highlighted?: boolean;
}) {
  const { state } = useData();
  const burn = budgetBurn(project, state.assignments, state.people);
  const health = budgetHealth(burn);
  const forecast = projectForecast(
    project,
    state.assignments,
    state.people,
  );

  const summary =
    burn.mode === "none"
      ? formatHours(burn.plannedHours)
      : burn.mode === "amount"
        ? `${formatMoney(burn.plannedAmount)} / ${formatMoney(burn.totalAmount ?? 0)}`
        : `${formatHours(burn.plannedHours)} / ${formatHours(burn.totalHours)}${
            burn.overBy > 0 ? ` · ${formatHours(burn.overBy)} over` : ""
          }`;

  return (
    <Link
      id={`project-card-${project.id}`}
      href={href}
      className={cn(
        "flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 transition-colors hover:bg-[var(--row-hover)]",
        highlighted &&
          "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]",
      )}
    >
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
          {project.name}
        </div>
        <span className="shrink-0 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          {burn.mode === "none"
            ? "No budget"
            : burn.mode === "amount"
              ? "Dollar"
              : project.budget_monthly_reset
                ? "Monthly hours"
                : "Hours"}
        </span>
      </div>
      <div className="mt-auto space-y-3">
        <div>
          <div
            className={cn(
              "mb-1.5 text-xs tabular-nums",
              health === "over" && "text-[var(--status-over)]",
              health === "near" && "text-[var(--status-near)]",
              (health === "healthy" || health === "none") &&
                "text-[var(--text-muted)]",
            )}
          >
            {summary}
          </div>
          <BurnBar burn={burn} compact />
        </div>
        <div className="border-t border-[var(--border)] pt-3">
          <div className="mb-2 text-xs font-semibold text-[var(--text)]">
            Forecast $
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Revenue</dt>
              <dd className="tabular-nums font-medium">
                {formatMoney(forecast.revenue)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Cost</dt>
              <dd className="tabular-nums font-medium">
                {formatMoney(forecast.cost)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Margin</dt>
              <dd className="tabular-nums font-medium">
                {formatMoney(forecast.margin)} ({forecast.marginPct.toFixed(0)}
                %)
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </Link>
  );
}
