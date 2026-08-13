"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, startOfDay } from "date-fns";
import { ChevronDown, ChevronRight, Copy, ExternalLink, Link2, Pencil, Plus, RefreshCw, Star, Unlink } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { ProjectManagerPerson, ContractorTag, SandboxTag } from "@/components/projects/project-manager-person";
import { BudgetCard } from "@/components/budgets/budget-card";
import { ProjectNotebook } from "@/components/projects/project-notebook";
import { ProjectTaskBoard } from "@/components/projects/project-task-board";
import {
  ProjectTasksPie,
  projectTasksPieStats,
} from "@/components/projects/project-tasks-pie";
import { ProgressBar } from "@/components/projects/progress-bar";
import { SortableMilestoneList } from "@/components/projects/sortable-milestone-list";
import { Field, Modal, ConfirmDialog, inputClass, DateInput } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  ApplyTemplateDialog,
  SaveAsTemplateDialog,
} from "@/components/templates/apply-template-dialog";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { ProjectForm } from "@/components/projects/project-form";
import { applyProjectManagerScheduleTime } from "@/components/projects/apply-pm-schedule";
import { PmSchedulePromptModal } from "@/components/projects/pm-schedule-prompt-modal";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useViewAs } from "@/lib/view-as";
import {
  projectDateProgress,
} from "@/lib/domain/progress";
import {
  canEditProject,
  projectHasSandboxWipeRisk,
  projectIdsForPerson,
  projectManagerPerson,
  projectTeamPersonIds,
  showProjectManagerUi,
} from "@/lib/domain/project-access";
import { SandboxIcon } from "@/components/projects/sandbox-icon";
import { isProjectFavorited } from "@/lib/domain/project-favorites";
import { personAvatarColor } from "@/lib/domain/people";
import { isMonthlyRetainerBudget } from "@/lib/domain/budget";
import {
  existingPmDailyHours,
  findPmProjectAssignments,
  projectTimelineDatesChanged,
  resolvePmScheduleIntent,
} from "@/lib/domain/project-manager-schedule";
import { ProjectStatusTag } from "@/components/projects/project-status-tag";
import { projectDisplayColor } from "@/lib/domain/sorting";
import {
  buildProjectMembersPayload,
  contractorTermsFromProjectMembers,
  sortPeopleContractorsLast,
  type ContractorTerms,
} from "@/lib/domain/contractor";
import { reapplyContractorWindowsOnProjectSave } from "@/lib/domain/contractor-window-reapply";
import { useAppHref, resolveProjectBySlugs, useBudgetHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { clientSiteOrigin, publicProjectShareUrl } from "@/lib/share/token";
import { cn } from "@/lib/cn";
import {
  MILESTONE_ESSENTIAL_KINDS,
  MILESTONE_ESSENTIAL_PREFILL_KINDS,
  sortedAssetKindOptions,
  titleCaseWords,
} from "@/lib/domain/assets";
import type { Milestone, Project, ProjectAssetKind } from "@/lib/types";

function formatDisplayDate(dateKey: string | null | undefined): string {
  if (!dateKey) return "No date";
  return format(parseISO(dateKey), "MMM d, yyyy");
}

function overallProgressLabel(
  startDate: string | null,
  endDate: string | null,
): string {
  if (startDate && endDate) {
    return `Overall Progress · ${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;
  }
  if (startDate) return `Overall Progress · from ${formatDisplayDate(startDate)}`;
  if (endDate) return `Overall Progress · through ${formatDisplayDate(endDate)}`;
  return "Overall Progress";
}

const portalActionClass =
  "inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] px-2 text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]";

export default function ProjectDetailPage() {
  const params = useParams<{ clientSlug: string; projectSlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusTaskId = searchParams.get("task");
  const focusMilestoneId = searchParams.get("milestone");
  const appHref = useAppHref();
  const budgetHref = useBudgetHref();
  const projectHref = useProjectHref();
  const {
    state,
    upsertProject,
    setProjectMembers,
    deleteProject,
    upsertMilestone,
    deleteMilestone,
    applyProjectTemplate,
    exportProjectAsTemplate,
    updateProjectShare,
    toggleProjectFavorite,
    upsertAssignment,
    deleteAssignment,
    upsertTaskList,
    ensureScheduleRange,
    clearProjectSandboxTrackedData,
    newId,
    isPublicShare,
    profile,
    myPerson,
    ensureProjectData,
    setActiveRealtimeProjectIds,
    dataStatus,
    upsertProjectContractorExpense,
  } = useData();
  const { effectiveCanManage, effectivePersonId, showingAsManager } =
    useViewAs();
  const canManage = effectiveCanManage;
  const { push } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Omit<Project, "organization_id"> | null>(
    null,
  );
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [contractorTerms, setContractorTerms] = useState<
    Record<string, ContractorTerms>
  >({});
  const [pmDailyHours, setPmDailyHours] = useState<number | null>(null);
  const [pmBaselineDates, setPmBaselineDates] = useState<{
    start_date: string | null;
    end_date: string | null;
  } | null>(null);
  const [pmPrompt, setPmPrompt] = useState<{
    kind: "overwrite" | "align";
    hours: number;
    project: Omit<Project, "organization_id">;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [exportName, setExportName] = useState("");
  const [confirmApplyTemplateId, setConfirmApplyTemplateId] = useState<
    string | null
  >(null);
  const [confirmSaveAsTemplate, setConfirmSaveAsTemplate] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(
    null,
  );
  /** Task list linked while editing a milestone ("" = none). */
  const [editingMilestoneListId, setEditingMilestoneListId] = useState("");
  const [confirmDeleteMilestoneId, setConfirmDeleteMilestoneId] = useState<
    string | null
  >(null);
  const [progressEditMode, setProgressEditMode] = useState(false);
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [ganttViewActive, setGanttViewActive] = useState(false);

  const project = resolveProjectBySlugs(
    state.clients,
    state.projects,
    params.clientSlug,
    params.projectSlug,
  );

  const canEdit = canEditProject(project, {
    canManage,
    myPersonId: myPerson?.id ?? effectivePersonId ?? null,
    projectMembers: state.project_members,
  });
  const isSandbox = Boolean(project?.sandbox_mode);

  useEffect(() => {
    if (!project?.id) return;
    void ensureProjectData(project.id);
    setActiveRealtimeProjectIds([project.id]);
    return () => setActiveRealtimeProjectIds([]);
  }, [project?.id, ensureProjectData, setActiveRealtimeProjectIds]);

  const projectDataReady =
    isPublicShare ||
    !project?.id ||
    dataStatus.projects[project.id] === "ready";
  const projectDataLoading =
    Boolean(project?.id) &&
    !projectDataReady &&
    dataStatus.projects[project.id] !== "error";

  const scopePersonId = effectivePersonId ?? myPerson?.id ?? null;

  const memberCanAccess = useMemo(() => {
    if (!project) return true;
    if (showingAsManager || (isPublicShare && !scopePersonId)) return true;
    if (!scopePersonId) return false;
    return projectIdsForPerson(
      scopePersonId,
      state.assignments,
      state.tasks,
      state.project_members,
      state.projects,
    ).has(project.id);
  }, [
    showingAsManager,
    isPublicShare,
    project,
    scopePersonId,
    state.assignments,
    state.tasks,
    state.project_members,
    state.projects,
  ]);
  const today = format(startOfDay(new Date()), "yyyy-MM-dd");
  const isRetainer = project ? isMonthlyRetainerBudget(project) : false;
  const projectBudgetHref = project
    ? budgetHref(project)
    : appHref("/reports/budgets");

  const team = useMemo(() => {
    if (!project) return [];
    const ids = projectTeamPersonIds(
      project.id,
      state.project_members,
      state.assignments,
      state.tasks,
    );
    return sortPeopleContractorsLast(
      state.people.filter((p) => ids.has(p.id)),
    );
  }, [
    project,
    state.assignments,
    state.project_members,
    state.tasks,
    state.people,
  ]);

  const showManagers = showProjectManagerUi(state.projects);
  const manager = project
    ? projectManagerPerson(project, state.people)
    : null;
  const favorited = Boolean(
    project &&
      profile &&
      isProjectFavorited(state.project_favorites, profile.id, project.id),
  );
  const teamWithoutManager = useMemo(() => {
    if (!manager) return team;
    return team.filter((p) => p.id !== manager.id);
  }, [team, manager]);
  const showTeamBar =
    team.length > 0 || (showManagers && Boolean(manager));

  const pieTasks = useMemo(() => {
    if (!project) return [];
    const activeListIds = new Set(
      state.task_lists
        .filter((l) => l.project_id === project.id && !l.archived)
        .map((l) => l.id),
    );
    const allReal = state.tasks.filter(
      (t) => t.project_id === project.id && !t.is_divider,
    );
    const fromActive = allReal.filter((t) => activeListIds.has(t.list_id));
    return fromActive.length >= 20 ? fromActive : allReal;
  }, [state.task_lists, state.tasks, project?.id]);

  const showTasksPie = pieTasks.length >= 20;

  if (!project) {
    return (
      <PageContainer className="overflow-y-auto">
        <PageHeader
          title="Project"
          onBack={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push(appHref("/projects"));
            }
          }}
        />
        <div className="py-5 text-sm text-[var(--text-muted)]">
          Project not found.{" "}
          <Link href={appHref("/projects")} className="text-[var(--accent)]">
            Back to projects
          </Link>
        </div>
      </PageContainer>
    );
  }

  if (!memberCanAccess) {
    return (
      <PageContainer className="overflow-y-auto">
        <PageHeader
          title="Project"
          onBack={() => router.push(appHref("/projects"))}
        />
        <div className="py-5 text-sm text-[var(--text-muted)]">
          You don&apos;t have access to this project.{" "}
          <Link href={appHref("/projects")} className="text-[var(--accent)]">
            Back to your projects
          </Link>
        </div>
      </PageContainer>
    );
  }

  if (projectDataLoading) {
    return (
      <PageContainer className="overflow-y-auto">
        <PageHeader title={project.name} onBack={() => router.push(appHref("/projects"))} />
        <div className="py-5 text-sm text-[var(--text-muted)]">Loading project…</div>
      </PageContainer>
    );
  }

  const client = state.clients.find((c) => c.id === project.client_id);
  const milestones = state.milestones
    .filter((m) => m.project_id === project.id)
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order ||
        (a.due_date ?? "").localeCompare(b.due_date ?? ""),
    );
  const overallPct = projectDateProgress(project, today) ?? 0;

  const shareResult =
    project.share_enabled && project.share_token
      ? publicProjectShareUrl(clientSiteOrigin(), project.share_token)
      : null;

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(appHref("/projects"));
    }
  }

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader
        title={
          <Link
            href={appHref("/projects")}
            className="font-semibold tracking-tight text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            Projects
          </Link>
        }
        documentTitle={project.name}
        onBack={goBack}
        actions={
          <>
            {canManage && !isSandbox ? (
              <Link
                href={projectBudgetHref}
                className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
              >
                Budget
              </Link>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="h-8 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
                onClick={() => {
                  const { organization_id: _org, ...rest } = project;
                  setDraft({
                    ...rest,
                    budget_monthly_reset: Boolean(rest.budget_monthly_reset),
                  });
                  setMemberIds(
                    state.project_members
                      .filter((m) => m.project_id === project.id)
                      .map((m) => m.person_id),
                  );
                  setContractorTerms(
                    contractorTermsFromProjectMembers(
                      project.id,
                      state.project_members,
                    ),
                  );
                  setPmBaselineDates({
                    start_date: project.start_date,
                    end_date: project.end_date,
                  });
                  setPmDailyHours(
                    project.manager_person_id
                      ? existingPmDailyHours(
                          state.assignments,
                          project.manager_person_id,
                          project.id,
                        )
                      : null,
                  );
                  setEditing(true);
                }}
              >
                Edit
              </button>
            ) : null}
          </>
        }
      />

      <div className="py-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight text-[var(--text)]">
            <ProjectColorBar
              color={projectDisplayColor(project, state.clients)}
              size="lg"
            />
            <span className="truncate">
              {client?.name ? `${client.name} – ${project.name}` : project.name}
            </span>
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            {profile && !isPublicShare ? (
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors",
                  favorited
                    ? "text-[var(--accent)] hover:bg-[var(--row-hover)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
                )}
                aria-pressed={favorited}
                aria-label={
                  favorited ? "Remove from favorites" : "Add to favorites"
                }
                onClick={() => toggleProjectFavorite(project.id)}
              >
                <Star
                  size={18}
                  strokeWidth={1.75}
                  fill={favorited ? "currentColor" : "none"}
                />
              </button>
            ) : null}
            <ProjectStatusTag status={project.status} className="shrink-0" />
            {isSandbox ? <SandboxTag className="shrink-0" /> : null}
          </div>
        </div>
        {project.notes ? (
          <p className="mb-4 text-sm text-[var(--text-muted)]">{project.notes}</p>
        ) : null}

        {showTeamBar ? (
          <section className="mb-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Team</h2>
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              {showManagers && manager ? (
                <>
                  <ProjectManagerPerson person={manager} showTag />
                  {teamWithoutManager.length > 0 ? (
                    <div
                      className="hidden h-8 w-px shrink-0 self-center bg-[var(--border)] sm:block"
                      aria-hidden
                    />
                  ) : null}
                </>
              ) : null}
              <ul className="flex flex-wrap gap-x-4 gap-y-2">
                {(showManagers && manager ? teamWithoutManager : team).map(
                  (p) => (
                    <li
                      key={p.id}
                      className="flex min-w-0 items-start gap-2 text-sm"
                    >
                      <PersonAvatar
                        avatarUrl={p.avatar_url}
                        avatarAttachmentId={p.avatar_attachment_id}
                        name={p.name}
                        size="team"
                        fallback="initials"
                        personId={p.id}
                        color={personAvatarColor(p)}
                      />
                      <div className="flex min-w-0 flex-col gap-2 text-left">
                        <div className="min-w-0">
                          <div className="truncate font-medium leading-tight">
                            {p.name}
                          </div>
                          {p.role_title ? (
                            <div className="truncate text-xs text-[var(--text-muted)]">
                              {p.role_title}
                            </div>
                          ) : null}
                        </div>
                        {!isPublicShare && p.is_contractor ? (
                          <ContractorTag className="self-start" />
                        ) : null}
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Main: tasks (+ sidebar) or full-width Gantt */}
          <div
            className={cn(
              "min-w-0 space-y-4",
              ganttViewActive ? "lg:col-span-3" : "lg:col-span-2",
            )}
          >
            <ProjectTaskBoard
              projectId={project.id}
              allowCardView
              focusTaskId={focusTaskId}
              onGanttActiveChange={setGanttViewActive}
              templatesSlot={
                ganttViewActive
                  ? undefined
                  : canEdit
                    ? (
                  <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-1.5 text-left"
                      onClick={() => setTemplatesExpanded((v) => !v)}
                      aria-expanded={templatesExpanded}
                    >
                      {templatesExpanded ? (
                        <ChevronDown
                          size={14}
                          className="shrink-0 text-[var(--text-muted)]"
                        />
                      ) : (
                        <ChevronRight
                          size={14}
                          className="shrink-0 text-[var(--text-muted)]"
                        />
                      )}
                      <h2 className="text-sm font-semibold">Templates</h2>
                    </button>
                    {templatesExpanded ? (
                      <div className="mt-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            searchable
                            className={`${inputClass} mt-0 h-8 max-w-[200px]`}
                            value={templateId}
                            onChange={setTemplateId}
                            aria-label="Apply template"
                            placeholder="Apply template…"
                            options={[
                              { value: "", label: "Apply template…" },
                              ...state.project_templates.map((t) => ({
                                value: t.id,
                                label: t.name,
                              })),
                            ]}
                          />
                          <button
                            type="button"
                            className="h-8 cursor-pointer rounded-md border border-[var(--border)] px-3 text-xs hover:bg-[var(--row-hover)] disabled:opacity-40"
                            disabled={!templateId}
                            onClick={() => {
                              if (!templateId) return;
                              setConfirmApplyTemplateId(templateId);
                            }}
                          >
                            Apply
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className={`${inputClass} mt-0 h-8 max-w-[200px]`}
                            placeholder="New template name"
                            value={exportName}
                            onChange={(e) => setExportName(e.target.value)}
                            aria-label="Template name"
                          />
                          <button
                            type="button"
                            className="h-8 cursor-pointer rounded-md border border-[var(--border)] px-3 text-xs hover:bg-[var(--row-hover)]"
                            onClick={() => setConfirmSaveAsTemplate(true)}
                          >
                            Save as Template
                          </button>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Apply appends undated milestones and unassigned tasks.
                          Save includes milestones and tasks only (no dates,
                          assignees, or comments).
                        </p>
                      </div>
                    ) : null}
                  </section>
                    )
                  : null
              }
            />
          </div>

          {/* Sidebar (hidden when Gantt active — cards move below) */}
          {!ganttViewActive ? (
          <div className="space-y-4">
            {isSandbox ? (
              <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
                <h2 className="mb-4 text-sm font-semibold">Sandbox</h2>
                <div className="flex justify-center px-4 py-6">
                  <SandboxIcon className="w-1/2 max-w-[11rem]" />
                </div>
                <p className="mt-1 text-center text-xs leading-snug text-[var(--text-muted)]">
                  Off the record — equal team access, no schedule or budget
                  tracking.
                </p>
              </section>
            ) : (
            <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Progress</h2>
                {canEdit ? (
                  <button
                    type="button"
                    className={cn(
                      "inline-flex cursor-pointer rounded p-1.5 hover:bg-[var(--row-hover)] hover:text-[var(--accent)]",
                      progressEditMode
                        ? "bg-[var(--row-hover)] text-[var(--accent)]"
                        : "text-[var(--text-muted)]",
                    )}
                    onClick={() => setProgressEditMode((v) => !v)}
                    aria-label={
                      progressEditMode
                        ? "Done editing progress"
                        : "Edit progress"
                    }
                    aria-pressed={progressEditMode}
                    title={
                      progressEditMode
                        ? "Done editing progress"
                        : "Edit progress"
                    }
                  >
                    <Pencil size={16} />
                  </button>
                ) : null}
              </div>
              <ProgressBar
                pct={overallPct}
                label={overallProgressLabel(
                  project.start_date,
                  project.end_date,
                )}
                size="lg"
              />
              {!isRetainer ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[var(--text-muted)]">
                      Milestones
                    </h3>
                    {canEdit && progressEditMode ? (
                      <button
                        type="button"
                        className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                        onClick={() => {
                          const m: Omit<Milestone, "organization_id"> = {
                            id: newId("ms"),
                            project_id: project.id,
                            name: "New milestone",
                            start_date: null,
                            due_date: today,
                            status: "upcoming",
                            client_approved: false,
                            sort_order: milestones.length,
                            approval_enabled: false,
                            approval_name: "",
                            approval_email: "",
                            essential_kind: null,
                            essential_label: "",
                            essential_url: "",
                            approved_by_name: null,
                            approved_at: null,
                            approved_by_client: false,
                          };
                          upsertMilestone(m);
                        }}
                        aria-label="Add milestone"
                        title="Add milestone"
                      >
                        <Plus size={16} />
                      </button>
                    ) : null}
                  </div>
                  {milestones.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">
                      No milestones yet.
                    </p>
                  ) : (
                    <SortableMilestoneList
                      milestones={milestones}
                      project={project}
                      today={today}
                      canManage={canEdit && progressEditMode}
                      formatDisplayDate={formatDisplayDate}
                      focusMilestoneId={focusMilestoneId}
                      onReorder={(reordered) => {
                        reordered.forEach((m, i) => {
                          if (m.sort_order !== i) {
                            upsertMilestone({ ...m, sort_order: i });
                          }
                        });
                      }}
                      onToggleApproved={(m, approved) =>
                        upsertMilestone({
                          ...m,
                          client_approved: approved,
                          ...(approved
                            ? {}
                            : {
                                approved_by_client: false,
                                approved_by_name: null,
                                approved_at: null,
                              }),
                        })
                      }
                      onEdit={(m) => {
                        const contactName = [
                          client?.contact_first_name,
                          client?.contact_last_name,
                        ]
                          .map((s) => s?.trim())
                          .filter(Boolean)
                          .join(" ");
                        setEditingMilestone({
                          ...m,
                          approval_name: m.approval_name || contactName,
                          approval_email:
                            m.approval_email || client?.contact_email || "",
                        });
                        setEditingMilestoneListId(
                          state.task_lists.find(
                            (l) =>
                              l.project_id === project.id &&
                              l.milestone_id === m.id &&
                              !l.archived,
                          )?.id ?? "",
                        );
                      }}
                    />
                  )}
                </div>
              ) : null}
            </section>
            )}

            <ProjectNotebook
              projectId={project.id}
              canEditOverride={isSandbox ? canEdit : undefined}
            />

            {showTasksPie ? (
              <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
                <h2 className="mb-3 text-sm font-semibold">Project Tasks</h2>
                <ProjectTasksPie stats={projectTasksPieStats(pieTasks, today)} />
              </section>
            ) : null}

            {!isSandbox ? (
            <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
              <h2 className="mb-2 text-sm font-semibold">Budget</h2>
              <BudgetCard
                project={project}
                href={projectBudgetHref}
                showName={false}
              />
              <Link
                href={projectBudgetHref}
                className={buttonClass({
                  variant: "secondary",
                  size: "sm",
                  className: "mt-2",
                })}
              >
                Open this project&apos;s budget
              </Link>
            </section>
            ) : null}

            {!isSandbox && (canEdit || (isPublicShare && shareResult)) ? (
              <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Link2 size={14} className="text-[var(--text-muted)]" />
                  <h2 className="text-sm font-semibold">Client Portal</h2>
                </div>
                {canEdit ? (
                  shareResult ? (
                    <div className="space-y-2">
                      <code className="block truncate rounded bg-[var(--bg-elevated)] px-2 py-1 text-[10px]">
                        {shareResult}
                      </code>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className={portalActionClass}
                          onClick={() => {
                            window.open(
                              shareResult,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                        >
                          <ExternalLink size={11} />
                          Open
                        </button>
                        <button
                          type="button"
                          className={portalActionClass}
                          onClick={async () => {
                            await navigator.clipboard.writeText(shareResult);
                            push("Portal link copied");
                          }}
                        >
                          <Copy size={11} />
                          Copy
                        </button>
                        <button
                          type="button"
                          className={portalActionClass}
                          onClick={() => {
                            updateProjectShare(project.id, "rotate");
                            push("Portal link rotated");
                          }}
                        >
                          <RefreshCw size={11} />
                          Rotate
                        </button>
                        <button
                          type="button"
                          className={portalActionClass}
                          onClick={() => {
                            updateProjectShare(project.id, "disable");
                            push("Portal disabled");
                          }}
                        >
                          <Unlink size={11} />
                          Disable
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={portalActionClass}
                      onClick={() => {
                        updateProjectShare(project.id, "enable");
                        push("Client portal enabled");
                      }}
                    >
                      <Link2 size={11} />
                      Enable public link
                    </button>
                  )
                ) : shareResult ? (
                  <div className="space-y-2">
                    <code className="block truncate rounded bg-[var(--bg-elevated)] px-2 py-1 text-[10px]">
                      {shareResult}
                    </code>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className={portalActionClass}
                        onClick={() => {
                          window.open(
                            shareResult,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }}
                      >
                        <ExternalLink size={11} />
                        Open
                      </button>
                      <button
                        type="button"
                        className={portalActionClass}
                        onClick={async () => {
                          await navigator.clipboard.writeText(shareResult);
                          push("Portal link copied");
                        }}
                      >
                        <Copy size={11} />
                        Copy
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
          ) : null}
        </div>

        {ganttViewActive ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {isSandbox ? (
              <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
                <h2 className="mb-4 text-sm font-semibold">Sandbox</h2>
                <div className="flex justify-center px-4 py-6">
                  <SandboxIcon className="w-1/2 max-w-[11rem]" />
                </div>
                <p className="mt-1 text-center text-xs leading-snug text-[var(--text-muted)]">
                  Off the record — equal team access, no schedule or budget
                  tracking.
                </p>
              </section>
            ) : (
            <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Progress</h2>
                {canEdit ? (
                  <button
                    type="button"
                    className={cn(
                      "inline-flex cursor-pointer rounded p-1.5 hover:bg-[var(--row-hover)] hover:text-[var(--accent)]",
                      progressEditMode
                        ? "bg-[var(--row-hover)] text-[var(--accent)]"
                        : "text-[var(--text-muted)]",
                    )}
                    onClick={() => setProgressEditMode((v) => !v)}
                    aria-label={
                      progressEditMode
                        ? "Done editing progress"
                        : "Edit progress"
                    }
                    aria-pressed={progressEditMode}
                    title={
                      progressEditMode
                        ? "Done editing progress"
                        : "Edit progress"
                    }
                  >
                    <Pencil size={16} />
                  </button>
                ) : null}
              </div>
              <ProgressBar
                pct={overallPct}
                label={overallProgressLabel(
                  project.start_date,
                  project.end_date,
                )}
                size="lg"
              />
              {!isRetainer ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[var(--text-muted)]">
                      Milestones
                    </h3>
                    {canEdit && progressEditMode ? (
                      <button
                        type="button"
                        className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                        onClick={() => {
                          const m: Omit<Milestone, "organization_id"> = {
                            id: newId("ms"),
                            project_id: project.id,
                            name: "New milestone",
                            start_date: null,
                            due_date: today,
                            status: "upcoming",
                            client_approved: false,
                            sort_order: milestones.length,
                            approval_enabled: false,
                            approval_name: "",
                            approval_email: "",
                            essential_kind: null,
                            essential_label: "",
                            essential_url: "",
                            approved_by_name: null,
                            approved_at: null,
                            approved_by_client: false,
                          };
                          upsertMilestone(m);
                        }}
                        aria-label="Add milestone"
                        title="Add milestone"
                      >
                        <Plus size={16} />
                      </button>
                    ) : null}
                  </div>
                  {milestones.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">
                      No milestones yet.
                    </p>
                  ) : (
                    <SortableMilestoneList
                      milestones={milestones}
                      project={project}
                      today={today}
                      canManage={canEdit && progressEditMode}
                      formatDisplayDate={formatDisplayDate}
                      focusMilestoneId={focusMilestoneId}
                      onReorder={(reordered) => {
                        reordered.forEach((m, i) => {
                          if (m.sort_order !== i) {
                            upsertMilestone({ ...m, sort_order: i });
                          }
                        });
                      }}
                      onToggleApproved={(m, approved) =>
                        upsertMilestone({
                          ...m,
                          client_approved: approved,
                          ...(approved
                            ? {}
                            : {
                                approved_by_client: false,
                                approved_by_name: null,
                                approved_at: null,
                              }),
                        })
                      }
                      onEdit={(m) => {
                        const contactName = [
                          client?.contact_first_name,
                          client?.contact_last_name,
                        ]
                          .map((s) => s?.trim())
                          .filter(Boolean)
                          .join(" ");
                        setEditingMilestone({
                          ...m,
                          approval_name: m.approval_name || contactName,
                          approval_email:
                            m.approval_email || client?.contact_email || "",
                        });
                        setEditingMilestoneListId(
                          state.task_lists.find(
                            (l) =>
                              l.project_id === project.id &&
                              l.milestone_id === m.id &&
                              !l.archived,
                          )?.id ?? "",
                        );
                      }}
                    />
                  )}
                </div>
              ) : null}
            </section>
            )}

            {isSandbox ? (
              <ProjectNotebook
                projectId={project.id}
                canEditOverride={canEdit}
              />
            ) : (
            <div className="space-y-4">
              <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
                  <h2 className="mb-2 text-sm font-semibold">Budget</h2>
                  <BudgetCard
                    project={project}
                    href={projectBudgetHref}
                    showName={false}
                  />
                  <Link
                    href={projectBudgetHref}
                    className={buttonClass({
                      variant: "secondary",
                      size: "sm",
                      className: "mt-2",
                    })}
                  >
                    Open this project&apos;s budget
                  </Link>
                </section>

              {canEdit || (isPublicShare && shareResult) ? (
                <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Link2 size={14} className="text-[var(--text-muted)]" />
                    <h2 className="text-sm font-semibold">Client Portal</h2>
                  </div>
                  {canEdit ? (
                    shareResult ? (
                      <div className="space-y-2">
                        <code className="block truncate rounded bg-[var(--bg-elevated)] px-2 py-1 text-[10px]">
                          {shareResult}
                        </code>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            className={portalActionClass}
                            onClick={() => {
                              window.open(
                                shareResult,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }}
                          >
                            <ExternalLink size={11} />
                            Open
                          </button>
                          <button
                            type="button"
                            className={portalActionClass}
                            onClick={async () => {
                              await navigator.clipboard.writeText(shareResult);
                              push("Portal link copied");
                            }}
                          >
                            <Copy size={11} />
                            Copy
                          </button>
                          <button
                            type="button"
                            className={portalActionClass}
                            onClick={() => {
                              updateProjectShare(project.id, "rotate");
                              push("Portal link rotated");
                            }}
                          >
                            <RefreshCw size={11} />
                            Rotate
                          </button>
                          <button
                            type="button"
                            className={portalActionClass}
                            onClick={() => {
                              updateProjectShare(project.id, "disable");
                              push("Portal disabled");
                            }}
                          >
                            <Unlink size={11} />
                            Disable
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={portalActionClass}
                        onClick={() => {
                          updateProjectShare(project.id, "enable");
                          push("Client portal enabled");
                        }}
                      >
                        <Link2 size={11} />
                        Enable public link
                      </button>
                    )
                  ) : shareResult ? (
                    <div className="space-y-2">
                      <code className="block truncate rounded bg-[var(--bg-elevated)] px-2 py-1 text-[10px]">
                        {shareResult}
                      </code>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className={portalActionClass}
                          onClick={() => {
                            window.open(
                              shareResult,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                        >
                          <ExternalLink size={11} />
                          Open
                        </button>
                        <button
                          type="button"
                          className={portalActionClass}
                          onClick={async () => {
                            await navigator.clipboard.writeText(shareResult);
                            push("Portal link copied");
                          }}
                        >
                          <Copy size={11} />
                          Copy
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
            )}

            {isSandbox ? (
              <div aria-hidden />
            ) : (
              <div className="space-y-4">
                <ProjectNotebook projectId={project.id} />
              </div>
            )}
          </div>
        ) : null}
      </div>

      {canEdit && editing && draft && (
        <Modal
          title="Edit project"
          className="max-w-3xl"
          onClose={() => {
            setEditing(false);
            setDraft(null);
            setMemberIds([]);
            setContractorTerms({});
            setPmDailyHours(null);
            setPmBaselineDates(null);
          }}
        >
          <ProjectForm
            project={draft}
            clients={state.clients}
            people={state.people}
            pods={state.pods}
            podMembers={state.pod_members}
            memberIds={memberIds}
            onMemberIdsChange={setMemberIds}
            contractorTerms={contractorTerms}
            onContractorTermsChange={setContractorTerms}
            onChange={setDraft}
            pmDailyHours={pmDailyHours}
            onPmDailyHoursChange={setPmDailyHours}
            sandboxWipeRisk={
              Boolean(draft) &&
              !draft.sandbox_mode &&
              projectHasSandboxWipeRisk(
                draft,
                state.milestones,
              )
            }
            onSave={async () => {
              if (!draft.name.trim()) return;
              if (!draft.client_id) {
                push("Choose a client for this project", "warning");
                return;
              }
              try {
                const prior = state.projects.find((p) => p.id === draft.id);
                let toSave = { ...draft };
                if (toSave.sandbox_mode) {
                  toSave = { ...toSave, manager_person_id: null };
                  if (!prior?.sandbox_mode) {
                    const wiped = await clearProjectSandboxTrackedData(
                      toSave.id,
                    );
                    toSave = { ...toSave, ...wiped };
                  }
                }

                const saved = await upsertProject({
                  ...toSave,
                  budget_hours:
                    toSave.budget_mode === "hours"
                      ? toSave.budget_hours
                      : null,
                  budget_amount:
                    toSave.budget_mode === "amount"
                      ? toSave.budget_amount
                      : null,
                  budget_monthly_reset:
                    toSave.budget_mode === "hours" ||
                    toSave.budget_mode === "amount"
                      ? Boolean(toSave.budget_monthly_reset)
                      : false,
                });
                const memberPayload = buildProjectMembersPayload(
                  memberIds,
                  contractorTerms,
                  state.people,
                );
                await setProjectMembers(toSave.id, memberPayload);
                const applyToast = await reapplyContractorWindowsOnProjectSave({
                  project: toSave,
                  members: memberPayload,
                  expenses: state.project_contractor_expenses,
                  newId,
                  upsertExpense: upsertProjectContractorExpense,
                });

                const closeEdit = () => {
                  setEditing(false);
                  setDraft(null);
                  setMemberIds([]);
                  setContractorTerms({});
                  setPmDailyHours(null);
                  setPmBaselineDates(null);
                };

                if (toSave.sandbox_mode) {
                  closeEdit();
                  push("Project saved");
                  if (applyToast) push(applyToast);
                  router.replace(projectHref(saved));
                  return;
                }

                const managerId = toSave.manager_person_id;
                const existing = managerId
                  ? findPmProjectAssignments(
                      state.assignments,
                      managerId,
                      toSave.id,
                    )
                  : [];
                const hoursForIntent =
                  pmDailyHours != null && pmDailyHours > 0
                    ? pmDailyHours
                    : null;
                const intent = resolvePmScheduleIntent({
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

                const applyPm = async (hours: number) => {
                  if (
                    !toSave.manager_person_id ||
                    !toSave.start_date ||
                    !toSave.end_date
                  ) {
                    return;
                  }
                  const result = await applyProjectManagerScheduleTime({
                    organizationId: state.organization.id,
                    projectId: toSave.id,
                    managerPersonId: toSave.manager_person_id,
                    startDate: toSave.start_date,
                    endDate: toSave.end_date,
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
                    push(
                      "Trimmed around time off to avoid overlap",
                      "warning",
                    );
                  }
                };

                if (intent.kind === "need_dates") {
                  push(
                    "Set start and completion dates to book project manager schedule time",
                    "warning",
                  );
                  closeEdit();
                  push("Project saved");
                  if (applyToast) push(applyToast);
                  router.replace(projectHref(saved));
                  return;
                }
                if (intent.kind === "overwrite" || intent.kind === "align") {
                  closeEdit();
                  setPmPrompt({
                    kind: intent.kind,
                    hours: intent.hours,
                    project: toSave,
                  });
                  push("Project saved");
                  if (applyToast) push(applyToast);
                  router.replace(projectHref(saved));
                  return;
                }
                if (intent.kind === "create") {
                  await applyPm(intent.hours);
                }
                closeEdit();
                push("Project saved");
                if (applyToast) push(applyToast);
                router.replace(projectHref(saved));
              } catch (err) {
                push(
                  err instanceof Error ? err.message : "Could not save project",
                  "warning",
                );
              }
            }}
            onCancel={() => {
              setEditing(false);
              setDraft(null);
              setMemberIds([]);
              setContractorTerms({});
              setPmDailyHours(null);
              setPmBaselineDates(null);
            }}
            onDelete={() => setConfirmDelete(true)}
          />
        </Modal>
      )}

      {pmPrompt ? (
        <PmSchedulePromptModal
          kind={pmPrompt.kind}
          onSkip={() => setPmPrompt(null)}
          onConfirm={async () => {
            const pending = pmPrompt;
            setPmPrompt(null);
            if (
              !pending.project.manager_person_id ||
              !pending.project.start_date ||
              !pending.project.end_date
            ) {
              return;
            }
            const result = await applyProjectManagerScheduleTime({
              organizationId: state.organization.id,
              projectId: pending.project.id,
              managerPersonId: pending.project.manager_person_id,
              startDate: pending.project.start_date,
              endDate: pending.project.end_date,
              hoursPerDay: pending.hours,
              assignments: state.assignments,
              leaveDays: state.leave_days,
              newId,
              upsertAssignment,
              deleteAssignment,
              ensureScheduleRange,
            });
            if (!result.created && result.reason) {
              push(result.reason, "warning");
            } else {
              push("Project manager schedule updated");
              if (result.leaveTrimmed) {
                push(
                  "Trimmed around time off to avoid overlap",
                  "warning",
                );
              }
            }
          }}
        />
      ) : null}

      {canEdit && editingMilestone && (
        <Modal
          title="Edit milestone"
          onClose={() => {
            setConfirmDeleteMilestoneId(null);
            setEditingMilestone(null);
            setEditingMilestoneListId("");
          }}
        >
          <div className="grid gap-3">
            {editingMilestone.approved_by_client ? (
              <>
                <Field label="Name">
                  <input
                    className={inputClass}
                    value={editingMilestone.name}
                    readOnly
                    disabled
                  />
                </Field>
                <p className="text-sm text-[var(--text-muted)]">
                  This milestone was approved by the client and is locked.
                  You can delete it, but dates, essentials, and approval
                  settings cannot be changed.
                </p>
              </>
            ) : (
              <>
                <Field label="Name">
                  <input
                    className={inputClass}
                    value={editingMilestone.name}
                    onChange={(e) =>
                      setEditingMilestone({
                        ...editingMilestone,
                        name: e.target.value,
                      })
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Date">
                    <DateInput
                      className={inputClass}
                      value={editingMilestone.start_date ?? ""}
                      onChange={(e) =>
                        setEditingMilestone({
                          ...editingMilestone,
                          start_date: e.target.value || null,
                        })
                      }
                    />
                  </Field>
                  <Field label="Due Date">
                    <DateInput
                      className={inputClass}
                      value={editingMilestone.due_date ?? ""}
                      onChange={(e) =>
                        setEditingMilestone({
                          ...editingMilestone,
                          due_date: e.target.value || null,
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="Task list">
                  <Select
                    value={editingMilestoneListId}
                    onChange={setEditingMilestoneListId}
                    placeholder="None"
                    options={[
                      { value: "", label: "None" },
                      ...state.task_lists
                        .filter(
                          (l) =>
                            l.project_id === project.id && !l.archived,
                        )
                        .sort(
                          (a, b) =>
                            a.sort_order - b.sort_order ||
                            a.name.localeCompare(b.name),
                        )
                        .map((l) => ({
                          value: l.id,
                          label: l.name,
                        })),
                    ]}
                  />
                </Field>
                <div className="space-y-2 rounded-md border border-[var(--border)] p-3">
                  <h3 className="text-sm font-semibold">
                    Client Approval is Ready
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Field label="Type">
                      <Select
                        value={editingMilestone.essential_kind ?? ""}
                        onChange={(v) => {
                          const nextKind = (v || null) as ProjectAssetKind | null;
                          let nextLabel = editingMilestone.essential_label;
                          let nextUrl = editingMilestone.essential_url;
                          if (
                            nextKind &&
                            MILESTONE_ESSENTIAL_PREFILL_KINDS.has(nextKind)
                          ) {
                            const match = state.project_assets.find(
                              (a) =>
                                a.project_id === project.id &&
                                a.kind === nextKind &&
                                !a.body.trim() &&
                                Boolean(a.url.trim()),
                            );
                            if (match) {
                              nextLabel = match.label;
                              nextUrl = match.url;
                            }
                          }
                          setEditingMilestone({
                            ...editingMilestone,
                            essential_kind: nextKind,
                            essential_label: nextLabel,
                            essential_url: nextUrl,
                          });
                        }}
                        options={[
                          { value: "", label: "Select type…" },
                          ...sortedAssetKindOptions(MILESTONE_ESSENTIAL_KINDS),
                        ]}
                      />
                    </Field>
                    <Field label="Label">
                      <input
                        className={inputClass}
                        value={editingMilestone.essential_label}
                        onChange={(e) =>
                          setEditingMilestone({
                            ...editingMilestone,
                            essential_label: e.target.value,
                          })
                        }
                        placeholder="Optional"
                      />
                    </Field>
                    <Field label="URL">
                      <input
                        className={inputClass}
                        value={editingMilestone.essential_url}
                        onChange={(e) =>
                          setEditingMilestone({
                            ...editingMilestone,
                            essential_url: e.target.value,
                          })
                        }
                        placeholder="https://"
                      />
                    </Field>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Client Name">
                      <input
                        className={inputClass}
                        value={editingMilestone.approval_name}
                        onChange={(e) =>
                          setEditingMilestone({
                            ...editingMilestone,
                            approval_name: e.target.value,
                          })
                        }
                        placeholder="Client contact name"
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        className={inputClass}
                        type="email"
                        value={editingMilestone.approval_email}
                        onChange={(e) =>
                          setEditingMilestone({
                            ...editingMilestone,
                            approval_email: e.target.value,
                          })
                        }
                        placeholder="client@example.com"
                      />
                    </Field>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editingMilestone.approval_enabled}
                      onChange={(e) =>
                        setEditingMilestone({
                          ...editingMilestone,
                          approval_enabled: e.target.checked,
                        })
                      }
                    />
                    Enable Milestone Approval
                  </label>
                </div>
              </>
            )}
            <div className="flex justify-between pt-2">
              <button
                type="button"
                className="cursor-pointer text-sm text-[var(--status-over)]"
                onClick={() =>
                  setConfirmDeleteMilestoneId(editingMilestone.id)
                }
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
                  onClick={() => {
                    setConfirmDeleteMilestoneId(null);
                    setEditingMilestone(null);
                    setEditingMilestoneListId("");
                  }}
                >
                  Cancel
                </button>
                {!editingMilestone.approved_by_client ? (
                  <button
                    type="button"
                    className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
                    onClick={() => {
                      if (editingMilestone.approval_enabled) {
                        const name = editingMilestone.approval_name.trim();
                        const email = editingMilestone.approval_email.trim();
                        if (!name || !email) {
                          push(
                            "Client name and email are required to enable milestone approval",
                          );
                          return;
                        }
                      }
                      upsertMilestone({
                        ...editingMilestone,
                        approval_name: editingMilestone.approval_name.trim(),
                        approval_email: editingMilestone.approval_email.trim(),
                        essential_label: titleCaseWords(
                          editingMilestone.essential_label.trim(),
                        ),
                        essential_url: editingMilestone.essential_url.trim(),
                        essential_kind:
                          editingMilestone.essential_kind &&
                          editingMilestone.essential_url.trim()
                            ? editingMilestone.essential_kind
                            : editingMilestone.essential_kind,
                      });
                      if (project) {
                        for (const list of state.task_lists) {
                          if (
                            list.project_id !== project.id ||
                            list.milestone_id !== editingMilestone.id
                          ) {
                            continue;
                          }
                          if (list.id === editingMilestoneListId) continue;
                          upsertTaskList({ ...list, milestone_id: null });
                        }
                        if (editingMilestoneListId) {
                          const target = state.task_lists.find(
                            (l) => l.id === editingMilestoneListId,
                          );
                          if (
                            target &&
                            target.milestone_id !== editingMilestone.id
                          ) {
                            upsertTaskList({
                              ...target,
                              milestone_id: editingMilestone.id,
                            });
                          }
                        }
                      }
                      setConfirmDeleteMilestoneId(null);
                      setEditingMilestone(null);
                      setEditingMilestoneListId("");
                      push("Milestone saved");
                    }}
                  >
                    Save
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {confirmDeleteMilestoneId ? (
        <ConfirmDialog
          title="Delete milestone?"
          message={`Delete “${
            editingMilestone?.id === confirmDeleteMilestoneId
              ? editingMilestone.name
              : "this milestone"
          }”? Linked task lists will keep their tasks but lose this milestone link.`}
          confirmLabel="Delete"
          onCancel={() => setConfirmDeleteMilestoneId(null)}
          onConfirm={() => {
            deleteMilestone(confirmDeleteMilestoneId);
            setConfirmDeleteMilestoneId(null);
            setEditingMilestone(null);
            setEditingMilestoneListId("");
            push("Milestone deleted");
          }}
        />
      ) : null}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete project?"
          message={`Delete ${project.name}? All assignments and milestones on this project will be removed. This can’t be undone.`}
          confirmLabel="Delete project"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            deleteProject(project.id);
            setConfirmDelete(false);
            setEditing(false);
            push("Project deleted");
            router.push(appHref("/projects"));
          }}
        />
      )}

      {confirmApplyTemplateId ? (
        <ApplyTemplateDialog
          templateId={confirmApplyTemplateId}
          projectName={project.name}
          onCancel={() => setConfirmApplyTemplateId(null)}
          onConfirm={async (options) => {
            await applyProjectTemplate(
              project.id,
              confirmApplyTemplateId,
              options,
            );
            setConfirmApplyTemplateId(null);
            setTemplateId("");
            push(
              options.includeDates
                ? "Template applied"
                : "Template applied — set dates as needed",
            );
          }}
        />
      ) : null}

      {confirmSaveAsTemplate ? (
        <SaveAsTemplateDialog
          defaultName={exportName.trim() || `${project.name} Template`}
          onCancel={() => setConfirmSaveAsTemplate(false)}
          onConfirm={async (name, options) => {
            await exportProjectAsTemplate(project.id, name, options);
            setConfirmSaveAsTemplate(false);
            setExportName("");
            push("Saved as template");
          }}
        />
      ) : null}
    </PageContainer>
  );
}
