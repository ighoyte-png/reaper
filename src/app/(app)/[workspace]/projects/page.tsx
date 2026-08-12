"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { format, startOfDay } from "date-fns";
import { Search } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { FavoritesSidebar } from "@/components/nav/favorites-sidebar";
import { ProjectForm } from "@/components/projects/project-form";
import { applyProjectManagerScheduleTime } from "@/components/projects/apply-pm-schedule";
import { PmSchedulePromptModal } from "@/components/projects/pm-schedule-prompt-modal";
import {
  ProjectManagerFilterBar,
  useProjectManagerFilter,
} from "@/components/projects/project-manager-filter-bar";
import { ProjectManagerPerson, SandboxTag } from "@/components/projects/project-manager-person";
import { SandboxIcon } from "@/components/projects/sandbox-icon";
import { ProgressBar } from "@/components/projects/progress-bar";
import { BurnBar } from "@/components/ui/burn-bar";
import { CardGridPlaceholders } from "@/components/ui/card-grid-placeholders";
import { ListCardsViewToggle } from "@/components/ui/list-cards-view-toggle";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { EmptyState, Modal, inputClass } from "@/components/ui/form";
import { Button, buttonClass } from "@/components/ui/button";
import { ApplyTemplateDialog } from "@/components/templates/apply-template-dialog";
import type { TemplateApplyOptions } from "@/lib/domain/project-templates";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { useViewAs } from "@/lib/view-as";
import {
  useLiveUserViewPrefs,
  writeUserViewPrefs,
} from "@/lib/user-view-prefs";
import { budgetBurn, budgetHealth } from "@/lib/domain/budget";
import { useProjectBurnsMap } from "@/lib/hooks/use-aggregates";
import { projectIdsForPerson, projectHasSandboxWipeRisk } from "@/lib/domain/project-access";
import {
  buildProjectMembersPayload,
  contractorTermsFromProjectMembers,
} from "@/lib/domain/contractor";
import { projectDateProgress } from "@/lib/domain/progress";
import {
  findPmProjectAssignments,
  projectTimelineDatesChanged,
  resolvePmScheduleIntent,
} from "@/lib/domain/project-manager-schedule";
import { ProjectStatusTag } from "@/components/projects/project-status-tag";
import {
  sortClientsByName,
  sortProjectsByClientThenName,
} from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { Client, Project, ProjectStatus } from "@/lib/types";
import type { ContractorTerms } from "@/lib/domain/contractor";

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
    sandbox_mode: false,
  };
}

type ClientFilter = "all" | "none" | string;
type StatusFilter = ProjectStatus | "all";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "on_hold", label: "On Hold" },
  { id: "completed", label: "Completed" },
  { id: "archived", label: "Archived" },
  { id: "all", label: "Show All" },
];

const PROJECT_FILTER_DEFAULTS: {
  q: string;
  client: string;
  status: string;
  pm: string;
} = {
  q: "",
  client: "all",
  status: "active",
  pm: "all",
};

const VALID_STATUS = new Set<string>(STATUS_TABS.map((t) => t.id));

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsPageContent />
    </Suspense>
  );
}

function ProjectsPageContent() {
  const {
    state,
    profile,
    upsertProject,
    setProjectMembers,
    applyProjectTemplate,
    upsertAssignment,
    deleteAssignment,
    ensureScheduleRange,
    clearProjectSandboxTrackedData,
    newId,
    isPublicShare,
    myPerson,
  } = useData();
  const { burns, ready: burnsReady } = useProjectBurnsMap();
  const { effectiveCanManage, effectivePersonId, showingAsManager } =
    useViewAs();
  const canManage = effectiveCanManage;
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const { push } = useToast();
  const viewPrefs = useLiveUserViewPrefs(profile?.id);
  const directoryLayout = viewPrefs.directoryLayout;
  const [editing, setEditing] = useState<Omit<Project, "organization_id"> | null>(
    null,
  );
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [contractorTerms, setContractorTerms] = useState<
    Record<string, ContractorTerms>
  >({});
  const [createTemplateId, setCreateTemplateId] = useState("");
  const [pendingCreateApply, setPendingCreateApply] = useState(false);
  const [pmDailyHours, setPmDailyHours] = useState<number | null>(null);
  const [pmBaselineDates, setPmBaselineDates] = useState<{
    start_date: string | null;
    end_date: string | null;
  } | null>(null);
  const [pmPrompt, setPmPrompt] = useState<{
    kind: "overwrite" | "align";
    hours: number;
    project: Omit<Project, "organization_id">;
    members: string[];
    templateToApply: string;
  } | null>(null);

  function openNewProject(partial?: Partial<Omit<Project, "organization_id">>) {
    setMemberIds([]);
    setContractorTerms({});
    setCreateTemplateId("");
    setPmDailyHours(null);
    setPmBaselineDates(null);
    setEditing({ ...emptyProject(newId("proj")), ...partial });
  }

  function closeProjectForm() {
    setEditing(null);
    setMemberIds([]);
    setContractorTerms({});
    setCreateTemplateId("");
    setPendingCreateApply(false);
    setPmDailyHours(null);
    setPmBaselineDates(null);
  }

  const { filters, setFilter, setFilters } = useUrlFilters(
    PROJECT_FILTER_DEFAULTS,
    { debounceMs: { q: 250 } },
  );
  const query = filters.q;
  const clientFilter = filters.client as ClientFilter;
  const statusFilter = (
    VALID_STATUS.has(filters.status) ? filters.status : "active"
  ) as StatusFilter;

  const scopePersonId = effectivePersonId ?? myPerson?.id ?? null;

  const visibleProjects = useMemo(() => {
    // Public org share is org-wide unless Viewing As a person.
    if (showingAsManager || (isPublicShare && !scopePersonId)) {
      return state.projects;
    }
    if (!scopePersonId) return [];
    const ids = projectIdsForPerson(
      scopePersonId,
      state.assignments,
      state.tasks,
      state.project_members,
      state.projects,
    );
    return state.projects.filter((p) => ids.has(p.id));
  }, [
    showingAsManager,
    isPublicShare,
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

  // From all visible projects (not status-scoped) so the filter stays
  // available when a status tab has no PM-assigned projects. Hidden unless ≥2.
  const { showManagers, managerTabs, managerFilter, setManagerFilter } =
    useProjectManagerFilter(visibleProjects, state.people, {
      value: filters.pm,
      onChange: (next) => setFilter("pm", next),
    });

  // Drop invalid client / status from the URL once data is available.
  useEffect(() => {
    const patch: Partial<typeof PROJECT_FILTER_DEFAULTS> = {};
    if (
      clientFilter !== "all" &&
      clientFilter !== "none" &&
      !state.clients.some((c) => c.id === clientFilter)
    ) {
      patch.client = "all";
    }
    if (!VALID_STATUS.has(filters.status)) {
      patch.status = "active";
    }
    if (Object.keys(patch).length) setFilters(patch);
  }, [clientFilter, filters.status, state.clients, setFilters]);

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

  async function applyPmSchedule(
    project: Omit<Project, "organization_id">,
    hours: number,
  ) {
    if (!project.manager_person_id || !project.start_date || !project.end_date) {
      return;
    }
    const result = await applyProjectManagerScheduleTime({
      organizationId: state.organization.id,
      projectId: project.id,
      managerPersonId: project.manager_person_id,
      startDate: project.start_date,
      endDate: project.end_date,
      hoursPerDay: hours,
      assignments: state.assignments,
      leaveDays: state.leave_days,
      newId,
      upsertAssignment,
      deleteAssignment,
      ensureScheduleRange,
    });
    if (!result.created && result.reason) {
      push(result.reason, "warning");
    } else if (result.leaveTrimmed) {
      push("Trimmed around time off to avoid overlap", "warning");
    }
  }

  async function saveProject(
    project: Omit<Project, "organization_id">,
    members: string[],
    terms: Record<string, ContractorTerms>,
    templateToApply: string,
    templateOptions?: TemplateApplyOptions,
    pmAction: "auto" | "apply" | "skip" = "auto",
    pmHoursOverride?: number,
  ) {
    try {
      const prior = state.projects.find((p) => p.id === project.id);
      let toSave = { ...project };
      if (toSave.sandbox_mode) {
        toSave = {
          ...toSave,
          manager_person_id: null,
        };
        if (!prior?.sandbox_mode) {
          const wiped = await clearProjectSandboxTrackedData(toSave.id);
          toSave = { ...toSave, ...wiped };
        }
      }

      await upsertProject({
        ...toSave,
        budget_hours:
          toSave.budget_mode === "hours" ? toSave.budget_hours : null,
        budget_amount:
          toSave.budget_mode === "amount" ? toSave.budget_amount : null,
        budget_monthly_reset:
          toSave.budget_mode === "hours"
            ? toSave.budget_monthly_reset
            : false,
      });
      await setProjectMembers(
        toSave.id,
        buildProjectMembersPayload(members, terms, state.people),
      );
      if (templateToApply && templateOptions) {
        await applyProjectTemplate(
          toSave.id,
          templateToApply,
          templateOptions,
        );
      }

      if (toSave.sandbox_mode) {
        closeProjectForm();
        push(
          templateToApply ? "Project created from template" : "Project saved",
        );
        return;
      }

      const managerId = toSave.manager_person_id;
      const existing = managerId
        ? findPmProjectAssignments(state.assignments, managerId, toSave.id)
        : [];
      const hoursForIntent =
        pmHoursOverride ??
        (pmDailyHours != null && pmDailyHours > 0 ? pmDailyHours : null);
      const intent =
        pmAction === "skip"
          ? ({ kind: "none" } as const)
          : pmAction === "apply" && hoursForIntent != null
            ? ({ kind: "create", hours: hoursForIntent } as const)
            : resolvePmScheduleIntent({
                pmDailyHours: hoursForIntent,
                managerPersonId: managerId,
                startDate: toSave.start_date,
                endDate: toSave.end_date,
                existing,
                datesChanged: projectTimelineDatesChanged(
                  pmBaselineDates,
                  toSave,
                ),
              });

      if (intent.kind === "need_dates") {
        push(
          "Set start and completion dates to book project manager schedule time",
          "warning",
        );
      } else if (intent.kind === "overwrite" || intent.kind === "align") {
        setPmPrompt({
          kind: intent.kind,
          hours: intent.hours,
          project: toSave,
          members,
          templateToApply: "",
        });
        closeProjectForm();
        push(
          templateToApply ? "Project created from template" : "Project saved",
        );
        return;
      } else if (intent.kind === "create") {
        await applyPmSchedule(toSave, intent.hours);
      }

      closeProjectForm();
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
                onClick={() => openNewProject()}
              >
                Add Project
              </Button>
            </div>
          ) : undefined
        }
      />
      {visibleProjects.length === 0 ? (
        <div className="py-3 sm:py-5">
          {canManage ? (
            <EmptyState
              title="No projects yet"
              cta="Create Your First Project"
              onClick={() => openNewProject()}
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
        <div className="flex flex-col md:flex-row md:gap-5">
          <aside className="sticky top-3 mt-3 hidden w-64 shrink-0 flex-col self-start overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] sm:top-5 sm:mt-5 md:flex">
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
                label="All clients"
                count={projects.length}
              />
              {sidebarClients.map((client) => (
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
                  label="No client"
                  count={clientCounts.get("none") ?? 0}
                />
              ) : null}
            </nav>
          </aside>

          <div className="min-w-0 py-3 sm:py-5 md:flex-1">
            <ProjectManagerFilterBar
              className="mb-4"
              managerTabs={managerTabs}
              managerFilter={managerFilter}
              onSelect={setManagerFilter}
            />

            <div className="mb-4 flex flex-wrap items-center gap-1">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter("status", tab.id)}
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

            <div className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden">
              <MobileClientChip
                active={clientFilter === "all"}
                onClick={() => setFilter("client", "all")}
                label="All"
              />
              {sidebarClients.map((c) => (
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
                    <div
                      className={
                        directoryLayout === "list"
                          ? "overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]"
                          : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                      }
                    >
                      {groupProjects.map((project) =>
                        directoryLayout === "list" ? (
                          <ProjectListRow
                            key={project.id}
                            project={project}
                            href={projectHref(project)}
                            showManager={showManagers}
                            burn={burns.get(project.id)}
                            loading={!burnsReady && !project.sandbox_mode}
                          />
                        ) : (
                          <ProjectCard
                            key={project.id}
                            project={project}
                            href={projectHref(project)}
                            showManager={showManagers}
                            burn={burns.get(project.id)}
                            loading={!burnsReady && !project.sandbox_mode}
                          />
                        ),
                      )}
                      {directoryLayout === "cards" ? (
                        <CardGridPlaceholders
                          count={groupProjects.length}
                          onAdd={
                            canManage
                              ? () =>
                                  openNewProject({
                                    client_id: client?.id ?? null,
                                  })
                              : undefined
                          }
                        />
                      ) : null}
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
          className="max-w-3xl"
          onClose={closeProjectForm}
        >
          <ProjectForm
            project={editing}
            clients={state.clients}
            people={state.people}
            pods={state.pods}
            podMembers={state.pod_members}
            memberIds={memberIds}
            onMemberIdsChange={setMemberIds}
            contractorTerms={contractorTerms}
            onContractorTermsChange={setContractorTerms}
            onChange={setEditing}
            pmDailyHours={pmDailyHours}
            onPmDailyHoursChange={setPmDailyHours}
            sandboxWipeRisk={
              Boolean(editing) &&
              state.projects.some((p) => p.id === editing.id) &&
              !editing.sandbox_mode &&
              projectHasSandboxWipeRisk(
                editing,
                state.milestones,
              )
            }
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
              await saveProject(editing, memberIds, contractorTerms, "");
            }}
            onCancel={closeProjectForm}
          />
        </Modal>
      )}

      {pendingCreateApply && editing && createTemplateId ? (
        <ApplyTemplateDialog
          templateId={createTemplateId}
          projectName={editing.name}
          onCancel={() => setPendingCreateApply(false)}
          onConfirm={async (options) => {
            const templateToApply = createTemplateId;
            setPendingCreateApply(false);
            await saveProject(
              editing,
              memberIds,
              contractorTerms,
              templateToApply,
              options,
            );
          }}
        />
      ) : null}

      {pmPrompt ? (
        <PmSchedulePromptModal
          kind={pmPrompt.kind}
          onSkip={() => setPmPrompt(null)}
          onConfirm={async () => {
            const pending = pmPrompt;
            setPmPrompt(null);
            await applyPmSchedule(pending.project, pending.hours);
            push("Project manager schedule updated");
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

function ProjectListRow({
  project,
  href,
  showManager,
  burn: burnProp,
  loading = false,
}: {
  project: Project;
  href: string;
  showManager?: boolean;
  burn?: ReturnType<typeof budgetBurn>;
  loading?: boolean;
}) {
  const { state } = useData();
  const isSandbox = Boolean(project.sandbox_mode);
  const burn =
    burnProp ?? budgetBurn(project, state.assignments, state.people);
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
        "flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0 hover:bg-[var(--row-hover)]",
        project.status === "archived" && "opacity-60",
      )}
      aria-busy={loading || undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold leading-tight">
            {project.name}
          </span>
          {isSandbox ? <SandboxTag /> : null}
          <ProjectStatusTag status={project.status} />
          {!isSandbox && project.budget_monthly_reset ? (
            <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              Monthly
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
          {overallPct != null ? <span>{overallPct}% progress</span> : null}
          {!isSandbox ? (
            loading ? (
              <span
                aria-hidden
                className="inline-block h-3 w-12 animate-pulse rounded bg-[var(--bg-elevated)]"
              />
            ) : (
              <span>{burn.totalHours}h</span>
            )
          ) : null}
          {manager ? <span className="truncate">{manager.name}</span> : null}
        </div>
      </div>
    </Link>
  );
}

function ProjectCard({
  project,
  href,
  showManager,
  burn: burnProp,
  loading = false,
}: {
  project: Project;
  href: string;
  showManager?: boolean;
  burn?: ReturnType<typeof budgetBurn>;
  loading?: boolean;
}) {
  const { state } = useData();
  const isSandbox = Boolean(project.sandbox_mode);
  const burn =
    burnProp ?? budgetBurn(project, state.assignments, state.people);
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
      aria-busy={loading || undefined}
    >
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
          {project.name}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {isSandbox ? <SandboxTag /> : null}
          <ProjectStatusTag status={project.status} />
          {!isSandbox && project.budget_monthly_reset ? (
            <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              Monthly
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-auto space-y-3">
        {isSandbox ? (
          <div className="flex justify-center px-2 py-1">
            <SandboxIcon className="w-full max-w-[9rem]" />
          </div>
        ) : loading ? (
          <div className="space-y-3" aria-hidden>
            {overallPct != null ? (
              <div className="h-8 animate-pulse rounded bg-[var(--bg-elevated)]" />
            ) : null}
            <div className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-[var(--bg-elevated)]" />
              <div className="h-3.5 w-full animate-pulse rounded-full bg-[var(--bg-elevated)]" />
            </div>
          </div>
        ) : (
          <>
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
          </>
        )}
        {manager ? (
          <div className="border-t border-[var(--border)] pt-3">
            <ProjectManagerPerson person={manager} showTag />
          </div>
        ) : null}
      </div>
    </Link>
  );
}
