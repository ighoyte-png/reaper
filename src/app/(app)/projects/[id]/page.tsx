"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { format, startOfDay } from "date-fns";
import { Copy, Link2 } from "lucide-react";
import { PageHeader } from "@/components/nav/page-header";
import { ProjectNotebook } from "@/components/projects/project-notebook";
import { ProjectTaskBoard } from "@/components/projects/project-task-board";
import { ProgressBar } from "@/components/projects/progress-bar";
import { Field, Modal, ConfirmDialog, inputClass } from "@/components/ui/form";
import { ProjectForm } from "@/components/projects/project-form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import {
  milestoneDateProgress,
  milestoneTaskProgress,
  projectDateProgress,
  projectTaskProgress,
} from "@/lib/domain/progress";
import { projectDisplayColor } from "@/lib/domain/sorting";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { publicProjectShareUrl } from "@/lib/share/token";
import type { Milestone, Project } from "@/lib/types";

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
  const [milestoneForm, setMilestoneForm] = useState<Omit<
    Milestone,
    "organization_id"
  > | null>(null);
  const [templateId, setTemplateId] = useState("");

  const project = state.projects.find((p) => p.id === params.id);
  const today = format(startOfDay(new Date()), "yyyy-MM-dd");
  const isRetainer = Boolean(project?.budget_monthly_reset);

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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
      </div>
    );
  }

  const client = state.clients.find((c) => c.id === project.client_id);
  const milestones = state.milestones
    .filter((m) => m.project_id === project.id)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const datePct = projectDateProgress(project, today);
  const taskPct = projectTaskProgress(state.tasks, project.id);
  const overallPct = datePct ?? taskPct;

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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader
        title={project.name}
        onBack={goBack}
        actions={
          <>
            <Link
              href={appHref("/reports/budgets")}
              className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
            >
              Budgets report
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
      <div className="space-y-4 p-5">
        <section className="rounded-md border border-[var(--border)] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
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
            {project.start_date || project.end_date ? (
              <span className="text-xs text-[var(--text-muted)]">
                {project.start_date ?? "?"} → {project.end_date ?? "?"}
              </span>
            ) : null}
          </div>

          <div className="mb-4 space-y-2">
            <ProgressBar pct={overallPct} label="Overall progress" />
            {!isRetainer &&
              milestones.map((m) => {
                const listIds = state.task_lists
                  .filter((l) => l.milestone_id === m.id)
                  .map((l) => l.id);
                const pct =
                  listIds.length > 0
                    ? milestoneTaskProgress(state.tasks, listIds)
                    : (milestoneDateProgress(m, project, today) ?? 0);
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <ProgressBar
                        pct={pct}
                        label={m.name}
                        approved={m.client_approved}
                      />
                    </div>
                    {canManage ? (
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={m.client_approved}
                          onChange={(e) =>
                            upsertMilestone({
                              ...m,
                              client_approved: e.target.checked,
                            })
                          }
                        />
                        Approved
                      </label>
                    ) : m.client_approved ? (
                      <span className="text-xs text-[var(--status-healthy)]">
                        Approved
                      </span>
                    ) : null}
                  </div>
                );
              })}
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
              <Link2 size={14} className="text-[var(--text-muted)]" />
              <span className="text-xs font-medium">Client portal</span>
              {shareResult ? (
                <>
                  <code className="max-w-[220px] truncate rounded bg-[var(--bg-elevated)] px-2 py-1 text-[10px]">
                    {shareResult}
                  </code>
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
                </>
              ) : (
                <button
                  type="button"
                  className="h-7 cursor-pointer rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--row-hover)]"
                  onClick={() => {
                    updateProjectShare(project.id, "enable");
                    push("Client portal enabled");
                  }}
                >
                  Enable public link
                </button>
              )}
            </div>
          ) : null}

          {project.notes ? (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              {project.notes}
            </p>
          ) : null}
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <section className="rounded-md border border-[var(--border)] p-4">
              {canManage && state.project_templates.length > 0 ? (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <select
                    className={inputClass + " mt-0 h-8 max-w-[220px]"}
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
                    className="h-8 cursor-pointer rounded-md border border-[var(--border)] px-3 text-xs hover:bg-[var(--row-hover)]"
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
                </div>
              ) : null}
              <ProjectTaskBoard
                projectId={project.id}
                allowCardView
              />
            </section>
            <ProjectNotebook projectId={project.id} />
          </div>

          <div className="space-y-4">
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
                          .slice(0, 2)}
                      </span>
                      <span className="min-w-0 truncate">{p.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {!isRetainer ? (
              <section className="rounded-md border border-[var(--border)] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Milestones</h2>
                  {canManage ? (
                    <button
                      type="button"
                      className="cursor-pointer text-xs text-[var(--accent)]"
                      onClick={() =>
                        setMilestoneForm({
                          id: newId("ms"),
                          project_id: project.id,
                          name: "",
                          due_date: new Date().toISOString().slice(0, 10),
                          status: "upcoming",
                          client_approved: false,
                        })
                      }
                    >
                      Add
                    </button>
                  ) : null}
                </div>
                {milestones.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    No milestones yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {milestones.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {m.due_date} · {m.status}
                            {m.client_approved ? " · approved" : ""}
                          </div>
                        </div>
                        {canManage ? (
                          <button
                            type="button"
                            className="cursor-pointer text-xs text-[var(--text-muted)]"
                            onClick={() => {
                              deleteMilestone(m.id);
                              push("Milestone deleted");
                            }}
                          >
                            Remove
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            <section className="rounded-md border border-[var(--border)] p-4">
              <h2 className="mb-2 text-sm font-semibold">Budget</h2>
              <p className="mb-2 text-xs text-[var(--text-muted)]">
                Financial tracking lives in Reports.
              </p>
              <Link
                href={appHref("/reports/budgets")}
                className="text-sm text-[var(--accent)] hover:underline"
              >
                Open Budgets report →
              </Link>
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
              if (
                draft.budget_mode === "hours" &&
                !(draft.budget_hours && draft.budget_hours > 0)
              ) {
                return;
              }
              if (
                draft.budget_mode === "amount" &&
                (draft.budget_amount == null || draft.budget_amount < 0)
              ) {
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

      {confirmDelete && project && (
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

      {canManage && milestoneForm && (
        <Modal title="Add milestone" onClose={() => setMilestoneForm(null)}>
          <div className="grid gap-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={milestoneForm.name}
                onChange={(e) =>
                  setMilestoneForm({ ...milestoneForm, name: e.target.value })
                }
              />
            </Field>
            <Field label="Due date">
              <input
                type="date"
                className={inputClass}
                value={milestoneForm.due_date}
                onChange={(e) =>
                  setMilestoneForm({
                    ...milestoneForm,
                    due_date: e.target.value,
                  })
                }
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="h-9 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm"
                onClick={() => setMilestoneForm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-9 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
                onClick={() => {
                  if (!milestoneForm.name.trim()) return;
                  upsertMilestone(milestoneForm);
                  setMilestoneForm(null);
                  push("Milestone saved");
                }}
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
