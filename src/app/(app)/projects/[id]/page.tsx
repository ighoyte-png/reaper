"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { format, parseISO, startOfDay } from "date-fns";
import { ChevronDown, ChevronRight, Copy, Link2, Pencil, Plus } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { BudgetCard } from "@/components/budgets/budget-card";
import { ProjectNotebook } from "@/components/projects/project-notebook";
import { ProjectTaskBoard } from "@/components/projects/project-task-board";
import { ProgressBar } from "@/components/projects/progress-bar";
import { SortableMilestoneList } from "@/components/projects/sortable-milestone-list";
import { Field, Modal, ConfirmDialog, inputClass, DateInput } from "@/components/ui/form";
import { ProjectForm } from "@/components/projects/project-form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import {
  projectDateProgress,
} from "@/lib/domain/progress";
import { projectDisplayColor } from "@/lib/domain/sorting";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { publicProjectShareUrl } from "@/lib/share/token";
import { cn } from "@/lib/cn";
import type { Milestone, MilestoneStatus, Project } from "@/lib/types";

function formatDisplayDate(dateKey: string): string {
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

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const appHref = useAppHref();
  const {
    state,
    upsertProject,
    deleteProject,
    upsertMilestone,
    deleteMilestone,
    applyProjectTemplate,
    exportProjectAsTemplate,
    updateProjectShare,
    newId,
    canManage,
  } = useData();
  const { push } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Omit<Project, "organization_id"> | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [exportName, setExportName] = useState("");
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(
    null,
  );
  const [progressEditMode, setProgressEditMode] = useState(false);
  const [templatesExpanded, setTemplatesExpanded] = useState(false);

  const project = state.projects.find((p) => p.id === params.id);
  const today = format(startOfDay(new Date()), "yyyy-MM-dd");
  const isRetainer = Boolean(project?.budget_monthly_reset);
  const budgetHref = project
    ? appHref(`/reports/budgets/${project.id}`)
    : appHref("/reports/budgets");

  const team = useMemo(() => {
    if (!project) return [];
    const ids = new Set<string>();
    for (const a of state.assignments) {
      if (a.project_id === project.id) ids.add(a.person_id);
    }
    for (const t of state.tasks) {
      if (t.project_id === project.id && t.assignee_person_id)
        ids.add(t.assignee_person_id);
    }
    return state.people.filter((p) => ids.has(p.id));
  }, [project, state.assignments, state.tasks, state.people]);

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
        <div className="p-5 text-sm text-[var(--text-muted)]">
          Project not found.{" "}
          <Link href={appHref("/projects")} className="text-[var(--accent)]">
            Back to projects
          </Link>
        </div>
      </PageContainer>
    );
  }

  const client = state.clients.find((c) => c.id === project.client_id);
  const milestones = state.milestones
    .filter((m) => m.project_id === project.id)
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.due_date.localeCompare(b.due_date),
    );
  const overallPct = projectDateProgress(project, today) ?? 0;

  const shareResult =
    project.share_enabled && project.share_token
      ? publicProjectShareUrl(
          typeof window !== "undefined" ? window.location.origin : "",
          project.share_token,
        )
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
        title={project.name}
        onBack={goBack}
        actions={
          <>
            <Link
              href={budgetHref}
              className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
            >
              Budget
            </Link>
            <Link
              href={appHref("/schedule")}
              className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
            >
              Schedule
            </Link>
            {canManage ? (
              <button
                type="button"
                className="h-8 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
                onClick={() => {
                  const { organization_id: _org, ...rest } = project;
                  setDraft({
                    ...rest,
                    budget_monthly_reset: Boolean(rest.budget_monthly_reset),
                  });
                  setEditing(true);
                }}
              >
                Edit
              </button>
            ) : null}
          </>
        }
      />

      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{
              background: projectDisplayColor(project, state.clients),
            }}
          />
          <span className="text-xs text-[var(--text-muted)]">
            {client?.name ?? "No client"} ·{" "}
            {isRetainer ? "Retainer" : "Project"} ·{" "}
            {project.status.replace("_", " ")}
          </span>
          {project.notes ? (
            <span className="w-full text-sm text-[var(--text-muted)]">
              {project.notes}
            </span>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Main: tasks + templates */}
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <section className="rounded-md border border-[var(--border)] p-4">
              <ProjectTaskBoard projectId={project.id} allowCardView />
            </section>

            {canManage ? (
              <section className="rounded-md border border-[var(--border)] p-4">
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
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      className={`${inputClass} mt-0 h-8 max-w-[200px]`}
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                    >
                      <option value="">Load template…</option>
                      {state.project_templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="h-8 cursor-pointer rounded-md border border-[var(--border)] px-3 text-xs hover:bg-[var(--row-hover)] disabled:opacity-40"
                      disabled={!templateId}
                      onClick={async () => {
                        if (!templateId) return;
                        await applyProjectTemplate(project.id, templateId);
                        setTemplateId("");
                        push("Template applied");
                      }}
                    >
                      Apply
                    </button>
                    <input
                      className={`${inputClass} mt-0 h-8 max-w-[160px]`}
                      placeholder="Template name"
                      value={exportName}
                      onChange={(e) => setExportName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="h-8 cursor-pointer rounded-md border border-[var(--border)] px-3 text-xs hover:bg-[var(--row-hover)]"
                      onClick={async () => {
                        const name =
                          exportName.trim() || `${project.name} template`;
                        await exportProjectAsTemplate(project.id, name);
                        setExportName("");
                        push("Exported as template");
                      }}
                    >
                      Export as template
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          {/* Sidebar: Progress → Assets → Team → Budget → Client portal */}
          <div className="space-y-4">
            <section className="rounded-md border border-[var(--border)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Progress</h2>
                {canManage ? (
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
                    {canManage && progressEditMode ? (
                      <button
                        type="button"
                        className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                        onClick={() => {
                          const m: Omit<Milestone, "organization_id"> = {
                            id: newId("ms"),
                            project_id: project.id,
                            name: "New milestone",
                            due_date: today,
                            status: "upcoming",
                            client_approved: false,
                            sort_order: milestones.length,
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
                      canManage={canManage && progressEditMode}
                      formatDisplayDate={formatDisplayDate}
                      onReorder={(reordered) => {
                        reordered.forEach((m, i) => {
                          if (m.sort_order !== i) {
                            upsertMilestone({ ...m, sort_order: i });
                          }
                        });
                      }}
                      onToggleApproved={(m, approved) =>
                        upsertMilestone({ ...m, client_approved: approved })
                      }
                      onEdit={setEditingMilestone}
                    />
                  )}
                </div>
              ) : null}
            </section>

            <ProjectNotebook projectId={project.id} />

            <section className="rounded-md border border-[var(--border)] p-4">
              <h2 className="mb-3 text-sm font-semibold">Team</h2>
              {team.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No one assigned yet.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {team.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[10px] font-semibold">
                        {p.name
                          .split(" ")
                          .map((x) => x[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                      <span className="min-w-0 truncate">
                        {p.name}
                        {p.role_title ? (
                          <span className="text-[var(--text-muted)]">
                            {" "}
                            · {p.role_title}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-md border border-[var(--border)] p-4">
              <h2 className="mb-2 text-sm font-semibold">Budget</h2>
              <BudgetCard
                project={project}
                href={budgetHref}
                showName={false}
              />
              <Link
                href={budgetHref}
                className="mt-2 inline-block text-sm text-[var(--accent)] hover:underline"
              >
                Open this project&apos;s budget →
              </Link>
            </section>

            <section className="rounded-md border border-[var(--border)] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Link2 size={14} className="text-[var(--text-muted)]" />
                <h2 className="text-sm font-semibold">Client Portal</h2>
              </div>
              {canManage ? (
                shareResult ? (
                  <div className="space-y-2">
                    <code className="block truncate rounded bg-[var(--bg-elevated)] px-2 py-1 text-[10px]">
                      {shareResult}
                    </code>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--row-hover)]"
                        onClick={async () => {
                          await navigator.clipboard.writeText(shareResult);
                          push("Portal link copied");
                        }}
                      >
                        <Copy size={12} /> Copy
                      </button>
                      <button
                        type="button"
                        className="h-7 cursor-pointer rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--row-hover)]"
                        onClick={() => {
                          updateProjectShare(project.id, "rotate");
                          push("Portal link rotated");
                        }}
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        className="h-7 cursor-pointer rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--row-hover)]"
                        onClick={() => {
                          updateProjectShare(project.id, "disable");
                          push("Portal disabled");
                        }}
                      >
                        Disable
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="h-8 cursor-pointer rounded-md border border-[var(--border)] px-3 text-xs hover:bg-[var(--row-hover)]"
                    onClick={() => {
                      updateProjectShare(project.id, "enable");
                      push("Client portal enabled");
                    }}
                  >
                    Enable public link
                  </button>
                )
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  Portal managed by admins.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>

      {canManage && editing && draft && (
        <Modal
          title="Edit project"
          onClose={() => {
            setEditing(false);
            setDraft(null);
          }}
        >
          <ProjectForm
            project={draft}
            clients={state.clients}
            onChange={setDraft}
            onSave={async () => {
              if (!draft.name.trim()) return;
              if (!draft.client_id) {
                push("Choose a client for this project", "warning");
                return;
              }
              try {
                await upsertProject({
                  ...draft,
                  budget_hours:
                    draft.budget_mode === "hours" ? draft.budget_hours : null,
                  budget_amount:
                    draft.budget_mode === "amount" ? draft.budget_amount : null,
                  budget_monthly_reset:
                    draft.budget_mode === "hours"
                      ? Boolean(draft.budget_monthly_reset)
                      : false,
                });
                setEditing(false);
                setDraft(null);
                push("Project saved");
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
            }}
            onDelete={() => setConfirmDelete(true)}
          />
        </Modal>
      )}

      {canManage && editingMilestone && (
        <Modal
          title="Edit milestone"
          onClose={() => setEditingMilestone(null)}
        >
          <div className="grid gap-3">
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
            <Field label="Due date">
              <DateInput
                className={inputClass}
                value={editingMilestone.due_date}
                onChange={(e) =>
                  setEditingMilestone({
                    ...editingMilestone,
                    due_date: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                value={editingMilestone.status}
                onChange={(e) =>
                  setEditingMilestone({
                    ...editingMilestone,
                    status: e.target.value as MilestoneStatus,
                  })
                }
              >
                <option value="upcoming">Upcoming</option>
                <option value="done">Done</option>
                <option value="missed">Missed</option>
              </select>
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editingMilestone.client_approved}
                onChange={(e) =>
                  setEditingMilestone({
                    ...editingMilestone,
                    client_approved: e.target.checked,
                  })
                }
              />
              Client approved
            </label>
            <div className="flex justify-between pt-2">
              <button
                type="button"
                className="cursor-pointer text-sm text-[var(--status-over)]"
                onClick={() => {
                  deleteMilestone(editingMilestone.id);
                  setEditingMilestone(null);
                  push("Milestone deleted");
                }}
              >
                Delete
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-9 rounded-md border border-[var(--border)] px-3 text-sm"
                  onClick={() => setEditingMilestone(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
                  onClick={() => {
                    upsertMilestone(editingMilestone);
                    setEditingMilestone(null);
                    push("Milestone saved");
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

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
    </PageContainer>
  );
}
