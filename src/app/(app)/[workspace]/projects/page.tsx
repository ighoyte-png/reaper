"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { format, startOfDay } from "date-fns";
import { Search, X } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { ProjectManagerPerson } from "@/components/projects/project-manager-person";
import { ProgressBar } from "@/components/projects/progress-bar";
import { BurnBar } from "@/components/ui/burn-bar";
import { CardGridPlaceholders } from "@/components/ui/card-grid-placeholders";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { EmptyState, Modal, inputClass } from "@/components/ui/form";
import { Button, buttonClass } from "@/components/ui/button";
import { ApplyTemplateDialog } from "@/components/templates/apply-template-dialog";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { useViewAs } from "@/lib/view-as";
import { budgetBurn, budgetHealth } from "@/lib/domain/budget";
import {
  projectIdsForPerson,
  showProjectManagerUi,
} from "@/lib/domain/project-access";
import { projectDateProgress } from "@/lib/domain/progress";
import {
  projectStatusPillClass,
  sortClientsByName,
  sortProjectsByClientThenName,
} from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { Client, Project, ProjectStatus } from "@/lib/types";

function emptyProject(id: string): Omit<Project, "organization_id"> {
  return {
    id,
    client_id: null,
    name: "",
    slug: "",
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
    manager_person_id: null,
    hide_from_public_share: false,
  };
}

type ClientFilter = "all" | "none" | string;
type StatusFilter = ProjectStatus | "all";
type ManagerFilter = "all" | string;

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "on_hold", label: "On Hold" },
  { id: "completed", label: "Completed" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "Show All" },
];

export default function ProjectsPage() {
  const {
    state,
    upsertProject,
    setProjectMembers,
    applyProjectTemplate,
    newId,
    isPublicShare,
    myPerson,
  } = useData();
  const { effectiveCanManage, effectivePersonId, showingAsManager } =
    useViewAs();
  const canManage = effectiveCanManage;
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const { push } = useToast();
  const [editing, setEditing] = useState<Omit<Project, "organization_id"> | null>(
    null,
  );
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [createTemplateId, setCreateTemplateId] = useState("");
  const [pendingCreateApply, setPendingCreateApply] = useState(false);
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState<ClientFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [managerFilter, setManagerFilter] = useState<ManagerFilter>("all");

  const scopePersonId = effectivePersonId ?? myPerson?.id ?? null;

  const visibleProjects = useMemo(() => {
    if (showingAsManager) return state.projects;
    if (!scopePersonId) return [];
    const ids = projectIdsForPerson(
      scopePersonId,
      state.assignments,
      state.tasks,
      state.project_members,
    );
    return state.projects.filter((p) => ids.has(p.id));
  }, [
    showingAsManager,
    scopePersonId,
    state.projects,
    state.assignments,
    state.tasks,
    state.project_members,
  ]);

  const statusScopedProjects = useMemo(() => {
    if (statusFilter === "all") return visibleProjects;
    return visibleProjects.filter((p) => p.status === statusFilter);
  }, [visibleProjects, statusFilter]);

  const managerTabs = useMemo(() => {
    // Build from all visible projects (not status-scoped) so the filter
    // stays available when a status tab has no PM-assigned projects.
    if (!showProjectManagerUi(visibleProjects)) return [];
    const ids = new Set<string>();
    for (const p of visibleProjects) {
      if (p.manager_person_id) ids.add(p.manager_person_id);
    }
    return state.people
      .filter((person) => ids.has(person.id))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [visibleProjects, state.people]);

  const showManagers = managerTabs.length >= 2;

  useEffect(() => {
    if (managerFilter === "all") return;
    if (!managerTabs.some((person) => person.id === managerFilter)) {
      setManagerFilter("all");
    }
  }, [managerFilter, managerTabs]);

  const projects = sortProjectsByClientThenName(
    statusScopedProjects,
    state.clients,
  );
  const clients = sortClientsByName(state.clients);
  // Archived clients keep their projects visible in the grouped list, but
  // don't clutter the sidebar's quick-filter navigation by default.
  const sidebarClients = useMemo(
    () => clients.filter((c) => (c.status ?? "active") !== "archived"),
    [clients],
  );

  const archivedCount = useMemo(
    () => visibleProjects.filter((p) => p.status === "archived").length,
    [visibleProjects],
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
  }, [projects, query, state.clients, clientFilter, managerFilter]);

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

  async function saveProject(
    project: Omit<Project, "organization_id">,
    members: string[],
    templateToApply: string,
  ) {
    try {
      await upsertProject({
        ...project,
        budget_hours:
          project.budget_mode === "hours" ? project.budget_hours : null,
        budget_amount:
          project.budget_mode === "amount" ? project.budget_amount : null,
        budget_monthly_reset:
          project.budget_mode === "hours"
            ? project.budget_monthly_reset
            : false,
      });
      await setProjectMembers(project.id, members);
      if (templateToApply) {
        await applyProjectTemplate(project.id, templateToApply);
      }
      setEditing(null);
      setMemberIds([]);
      setCreateTemplateId("");
      push(
        templateToApply ? "Project created from template" : "Project saved",
      );
    } catch (err) {
      push(
        err instanceof Error ? err.message : "Could not save project",
        "warning",
      );
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Projects"
        actions={
          canManage ? (
            <div className="flex items-center gap-2">
              <Link
                href={appHref("/templates")}
                className={buttonClass({ variant: "secondary" })}
              >
                Templates
              </Link>
              <Button
                variant="primary"
                onClick={() => {
                  setMemberIds([]);
                  setCreateTemplateId("");
                  setEditing(emptyProject(newId("proj")));
                }}
              >
                Add Project
              </Button>
            </div>
          ) : undefined
        }
      />
      {visibleProjects.length === 0 ? (
        <div className="p-3 sm:p-5">
          {canManage ? (
            <EmptyState
              title="No projects yet"
              cta="Create Your First Project"
              onClick={() => {
                setMemberIds([]);
                setCreateTemplateId("");
                setEditing(emptyProject(newId("proj")));
              }}
            />
          ) : (
            <p className="py-16 text-center text-sm text-[var(--text-muted)]">
              {isPublicShare
                ? "No projects yet"
                : "No projects assigned to you yet"}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col md:flex-row">
          <aside className="sticky top-3 mt-3 ml-3 hidden w-64 shrink-0 flex-col self-start overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] sm:top-5 sm:mt-5 sm:ml-5 md:flex">
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

          <div className="min-w-0 p-3 sm:p-5 md:flex-1">
            {showManagers ? (
              <section
                className="mb-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-4"
                aria-label="Project managers"
              >
                <h2 className="mb-3 text-sm font-semibold">Project Manager</h2>
                <ul className="flex flex-wrap gap-x-4 gap-y-2">
                  {managerTabs.map((person) => {
                    const selected = managerFilter === person.id;
                    return (
                      <li key={person.id}>
                        <div
                          className={cn(
                            "flex items-center gap-1 rounded-md border px-1.5 py-1 transition-colors",
                            selected
                              ? "border-[var(--text)] bg-[var(--bg-elevated)]"
                              : "border-transparent hover:bg-[var(--row-hover)]",
                          )}
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            onClick={() => setManagerFilter(person.id)}
                            className="min-w-0 cursor-pointer text-left"
                          >
                            <ProjectManagerPerson person={person} />
                          </button>
                          {selected ? (
                            <button
                              type="button"
                              className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                              aria-label={`Clear ${person.name} filter`}
                              onClick={() => setManagerFilter("all")}
                            >
                              <X size={14} strokeWidth={2} />
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            <div className="mb-4 flex flex-wrap gap-1">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs transition-colors",
                    statusFilter === tab.id
                      ? "border-[var(--text)] bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)]",
                  )}
                >
                  {tab.label}
                  {tab.id === "archived" && archivedCount > 0
                    ? ` (${archivedCount})`
                    : ""}
                </button>
              ))}
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

            <div className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden">
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
                No{" "}
                {statusFilter === "all"
                  ? "projects"
                  : `${statusFilter.replace("_", " ")} projects`}
                {query.trim() ? ` match “${query.trim()}”` : ""}.
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
                        <ProjectCard
                          key={project.id}
                          project={project}
                          href={projectHref(project)}
                          showManager={showManagers}
                        />
                      ))}
                      <CardGridPlaceholders
                        count={groupProjects.length}
                        onAdd={
                          canManage
                            ? () => {
                                setMemberIds([]);
                                setCreateTemplateId("");
                                setEditing({
                                  ...emptyProject(newId("proj")),
                                  client_id: client?.id ?? null,
                                });
                              }
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

      {canManage && editing && (
        <Modal
          title={
            state.projects.some((p) => p.id === editing.id)
              ? "Edit project"
              : "Add Project"
          }
          onClose={() => {
            setEditing(null);
            setMemberIds([]);
            setCreateTemplateId("");
          }}
        >
          <ProjectForm
            project={editing}
            clients={state.clients}
            people={state.people}
            memberIds={memberIds}
            onMemberIdsChange={setMemberIds}
            onChange={setEditing}
            showTemplateSelect={!state.projects.some((p) => p.id === editing.id)}
            templates={state.project_templates}
            templateId={createTemplateId}
            onTemplateIdChange={setCreateTemplateId}
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
              const isNew = !state.projects.some((p) => p.id === editing.id);
              if (isNew && createTemplateId) {
                setPendingCreateApply(true);
                return;
              }
              await saveProject(editing, memberIds, "");
            }}
            onCancel={() => {
              setEditing(null);
              setMemberIds([]);
              setCreateTemplateId("");
              setPendingCreateApply(false);
            }}
          />
        </Modal>
      )}

      {pendingCreateApply && editing && createTemplateId ? (
        <ApplyTemplateDialog
          templateId={createTemplateId}
          projectName={editing.name}
          onCancel={() => setPendingCreateApply(false)}
          onConfirm={async () => {
            const templateToApply = createTemplateId;
            setPendingCreateApply(false);
            await saveProject(editing, memberIds, templateToApply);
          }}
        />
      ) : null}
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

function ProjectCard({
  project,
  href,
  showManager,
}: {
  project: Project;
  href: string;
  showManager?: boolean;
}) {
  const { state } = useData();
  const burn = budgetBurn(project, state.assignments, state.people);
  const health = budgetHealth(burn);
  const today = format(startOfDay(new Date()), "yyyy-MM-dd");
  const overallPct = projectDateProgress(project, today);
  const manager =
    showManager && project.manager_person_id
      ? state.people.find((p) => p.id === project.manager_person_id)
      : null;

  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 transition-colors hover:bg-[var(--row-hover)]",
        project.status === "archived" && "opacity-60",
      )}
    >
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
          {project.name}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <span className={projectStatusPillClass(project.status)}>
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
        {manager ? (
          <div className="border-t border-[var(--border)] pt-3">
            <ProjectManagerPerson person={manager} showTag />
          </div>
        ) : null}
      </div>
    </Link>
  );
}
