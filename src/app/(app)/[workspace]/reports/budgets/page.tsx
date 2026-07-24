"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ReportBreadcrumb } from "@/components/nav/breadcrumbs";
import { FavoritesSidebar } from "@/components/nav/favorites-sidebar";
import { BudgetCard } from "@/components/budgets/budget-card";
import {
  ProjectManagerFilterBar,
  useProjectManagerFilter,
} from "@/components/projects/project-manager-filter-bar";
import { CardGridPlaceholders } from "@/components/ui/card-grid-placeholders";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import { useAppHref, useBudgetHref } from "@/lib/hooks/use-app-href";
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
  const { state, canManage } = useData();
  const appHref = useAppHref();
  const budgetHref = useBudgetHref();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");
  const [clientFilter, setClientFilter] = useState<ClientFilter>("all");
  const [query, setQuery] = useState("");

  const projects = sortProjectsByClientThenName(
    state.projects,
    state.clients,
  );
  const clients = sortClientsByName(state.clients);

  const { managerTabs, managerFilter, setManagerFilter } =
    useProjectManagerFilter(state.projects, state.people);

  // Legacy deep link (?project=) → dedicated budget detail page.
  useEffect(() => {
    if (!projectParam) return;
    const project = state.projects.find((p) => p.id === projectParam);
    if (!project) return;
    router.replace(budgetHref(project));
  }, [projectParam, state.projects, router, budgetHref]);

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
      <PageHeader title={<ReportBreadcrumb current="Budgets" />} />
      {state.projects.length === 0 ? (
        <div className="p-5">
          <p className="text-sm text-[var(--text-muted)]">No projects yet.</p>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row">
          <aside className="sticky top-3 mt-3 ml-3 hidden max-h-[calc(100dvh-5.5rem)] w-64 shrink-0 flex-col self-start overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] sm:top-5 sm:mt-5 sm:ml-5 md:flex">
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
            <FavoritesSidebar />
            <nav className="space-y-0.5 p-2" aria-label="Clients">
              <ClientNavButton
                active={clientFilter === "all"}
                onClick={() => setClientFilter("all")}
                label="All Clients"
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
                  label="No Client"
                  count={clientCounts.get("none") ?? 0}
                />
              ) : null}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 p-3 sm:p-5">
            <ProjectManagerFilterBar
              className="mb-4"
              managerTabs={managerTabs}
              managerFilter={managerFilter}
              onSelect={setManagerFilter}
            />

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
                  label="No Client"
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
                        {client?.name ?? "No Client"}
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
                          href={budgetHref(project)}
                        />
                      ))}
                      <CardGridPlaceholders
                        count={groupProjects.length}
                        onAdd={
                          canManage
                            ? () => router.push(appHref("/projects"))
                            : undefined
                        }
                      />
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
