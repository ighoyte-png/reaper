"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { format, startOfDay } from "date-fns";
import { Search } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { ProgressBar } from "@/components/projects/progress-bar";
import { BurnBar } from "@/components/ui/burn-bar";
import { EmptyState, Modal, inputClass } from "@/components/ui/form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { budgetBurn, budgetHealth } from "@/lib/domain/budget";
import { projectDateProgress } from "@/lib/domain/progress";
import {
  sortClientsByName,
  sortProjectsByClientThenName,
} from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { Client, Project } from "@/lib/types";

function emptyProject(id: string): Omit<Project, "organization_id"> {
  return {
    id,
    client_id: null,
    name: "",
    status: "active",
    priority: 3,
    color: "#3498DB",
    start_date: null,
    end_date: null,
    budget_hours: 80,
    budget_amount: null,
    budget_mode: "hours",
    budget_monthly_reset: false,
    notes: "",
  };
}

type ClientFilter = "all" | "none" | string;

export default function ProjectsPage() {
  const { state, upsertProject, newId, canManage } = useData();
  const appHref = useAppHref();
  const { push } = useToast();
  const [editing, setEditing] = useState<Omit<Project, "organization_id"> | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState<ClientFilter>("all");

  const projects = sortProjectsByClientThenName(state.projects, state.clients);
  const clients = sortClientsByName(state.clients);
  // Archived clients keep their projects visible in the grouped list, but
  // don't clutter the sidebar's quick-filter navigation by default.
  const sidebarClients = useMemo(
    () => clients.filter((c) => (c.status ?? "active") !== "archived"),
    [clients],
  );

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
  }, [projects, query, state.clients, clientFilter]);

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
      <PageHeader
        title="Projects"
        actions={
          canManage ? (
            <button
              type="button"
              className="h-8 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
              onClick={() => setEditing(emptyProject(newId("proj")))}
            >
              Add project
            </button>
          ) : undefined
        }
      />
      {state.projects.length === 0 ? (
        <div className="p-5">
          {canManage ? (
            <EmptyState
              title="No projects yet"
              cta="Create your first project"
              onClick={() => setEditing(emptyProject(newId("proj")))}
            />
          ) : (
            <p className="py-16 text-center text-sm text-[var(--text-muted)]">
              No projects yet
            </p>
          )}
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
              {sidebarClients.map((client) => (
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
              {sidebarClients.map((c) => (
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
                        <ProjectCard
                          key={project.id}
                          project={project}
                          href={appHref(`/projects/${project.id}`)}
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

      {canManage && editing && (
        <Modal
          title={editing.name ? "Edit project" : "Add project"}
          onClose={() => setEditing(null)}
        >
          <ProjectForm
            project={editing}
            clients={state.clients}
            onChange={setEditing}
            onSave={async () => {
              if (!editing.name.trim()) return;
              if (!editing.client_id) {
                push("Choose a client for this project", "warning");
                return;
              }
              if (
                editing.budget_mode === "hours" &&
                !(editing.budget_hours && editing.budget_hours > 0)
              ) {
                return;
              }
              if (
                editing.budget_mode === "amount" &&
                (editing.budget_amount == null || editing.budget_amount < 0)
              ) {
                return;
              }
              try {
                await upsertProject({
                  ...editing,
                  budget_hours:
                    editing.budget_mode === "hours"
                      ? editing.budget_hours
                      : null,
                  budget_amount:
                    editing.budget_mode === "amount"
                      ? editing.budget_amount
                      : null,
                  budget_monthly_reset:
                    editing.budget_mode === "hours"
                      ? editing.budget_monthly_reset
                      : false,
                });
                setEditing(null);
                push("Project saved");
              } catch (err) {
                push(
                  err instanceof Error ? err.message : "Could not save project",
                  "warning",
                );
              }
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
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

function ProjectCard({
  project,
  href,
}: {
  project: Project;
  href: string;
}) {
  const { state } = useData();
  const burn = budgetBurn(project, state.assignments, state.people);
  const health = budgetHealth(burn);
  const today = format(startOfDay(new Date()), "yyyy-MM-dd");
  const overallPct = projectDateProgress(project, today);

  return (
    <Link
      href={href}
      className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 transition-colors hover:bg-[var(--row-hover)]"
    >
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
          {project.name}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
            {project.status.replace("_", " ")}
          </span>
          {project.budget_monthly_reset ? (
            <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              Monthly
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-auto space-y-3">
        {overallPct != null ? (
          <ProgressBar pct={overallPct} label="Overall Progress" />
        ) : null}
        <div className="space-y-2">
          <div
            className={cn(
              "text-xs",
              health === "over" && "text-[var(--status-over)]",
              health === "near" && "text-[var(--status-near)]",
              (health === "healthy" || health === "none") &&
                "text-[var(--text-muted)]",
            )}
          >
            Total {burn.totalHours}h
          </div>
          <BurnBar burn={burn} compact />
        </div>
      </div>
    </Link>
  );
}
