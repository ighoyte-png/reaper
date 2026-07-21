"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ReportBreadcrumb } from "@/components/nav/breadcrumbs";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { formatHours, formatMoney } from "@/lib/domain/budget";
import { orgForecast, projectForecast } from "@/lib/domain/forecast";
import {
  sortClientsByName,
  sortProjectsByClientThenName,
} from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { Client, Project } from "@/lib/types";

type ClientFilter = "all" | "none" | string;

export default function ForecastReportPage() {
  const { state } = useData();
  const appHref = useAppHref();
  const [clientFilter, setClientFilter] = useState<ClientFilter>("all");
  const [query, setQuery] = useState("");

  const projects = sortProjectsByClientThenName(
    state.projects,
    state.clients,
  );
  const clients = sortClientsByName(state.clients);

  const org = orgForecast(state.projects, state.assignments, state.people);

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
    <PageContainer>
      <PageHeader title={<ReportBreadcrumb current="Financial Forecast" />} />
      {state.projects.length === 0 ? (
        <div className="p-5">
          <p className="text-sm text-[var(--text-muted)]">No projects yet.</p>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row">
          <aside className="sticky top-3 mt-3 hidden max-h-[calc(100dvh-5.5rem)] w-52 shrink-0 flex-col self-start overflow-y-auto border-r border-[var(--border)] bg-[var(--sidebar)] sm:top-5 sm:mt-5 md:flex">
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
            <nav className="space-y-0.5 p-2" aria-label="Clients">
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

          <div className="min-w-0 flex-1 p-3 sm:p-5">
            <div className="mb-5 grid gap-3 sm:grid-cols-4">
              <Stat label="Planned Hours" value={formatHours(org.plannedHours)} />
              <Stat label="Revenue" value={formatMoney(org.revenue)} />
              <Stat label="Cost" value={formatMoney(org.cost)} />
              <Stat
                label="Margin"
                value={`${formatMoney(org.margin)} (${org.marginPct.toFixed(0)}%)`}
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
                    <div className="mb-4 flex items-center gap-2 border-b border-[var(--section-rule)] px-1 pb-2">
                      {client ? (
                        <ProjectColorBar color={client.color} />
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
                        <ForecastCard
                          key={project.id}
                          project={project}
                          clientName={client?.name ?? "No client"}
                          href={appHref(`/reports/budgets/${project.id}`)}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
    </div>
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

function ForecastCard({
  project,
  clientName,
  href,
}: {
  project: Project;
  clientName: string;
  href: string;
}) {
  const { state } = useData();
  const forecast = projectForecast(project, state.assignments, state.people);

  return (
    <Link
      href={href}
      className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 transition-colors hover:bg-[var(--row-hover)]"
    >
      <div className="mb-3 min-w-0">
        <div className="truncate text-sm font-semibold leading-tight">
          {project.name}
        </div>
        <div className="truncate text-xs text-[var(--text-muted)]">
          {clientName}
        </div>
      </div>
      <div className="mt-auto space-y-1.5 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-[var(--text-muted)]">Hours</span>
          <span className="tabular-nums font-medium">
            {formatHours(forecast.plannedHours)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[var(--text-muted)]">Revenue</span>
          <span className="tabular-nums font-medium">
            {formatMoney(forecast.revenue)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-[var(--text-muted)]">Cost</span>
          <span className="tabular-nums font-medium">
            {formatMoney(forecast.cost)}
          </span>
        </div>
        <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-1.5">
          <span className="text-[var(--text-muted)]">Margin</span>
          <span className="tabular-nums font-medium">
            {formatMoney(forecast.margin)} ({forecast.marginPct.toFixed(0)}%)
          </span>
        </div>
      </div>
    </Link>
  );
}
