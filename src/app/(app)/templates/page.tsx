"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { EmptyState, Field, inputClass } from "@/components/ui/form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useViewAs } from "@/lib/view-as";
import { cn } from "@/lib/cn";
import type { ProjectTemplate, TemplateTask } from "@/lib/types";

export default function TemplatesPage() {
  const {
    state,
    isPublicShare,
    newId,
    upsertProjectTemplate,
    deleteProjectTemplate,
  } = useData();
  const { effectiveCanManage } = useViewAs();
  const canManage = effectiveCanManage;
  const { push } = useToast();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(
    state.project_templates[0]?.id ?? null,
  );

  useEffect(() => {
    if (!canManage && !isPublicShare) router.replace("/dashboard");
  }, [canManage, isPublicShare, router]);

  if (!canManage && !isPublicShare) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting…
      </div>
    );
  }

  const templates = [...state.project_templates].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const selected = templates.find((t) => t.id === selectedId) ?? null;

  function addTemplate() {
    const template: ProjectTemplate = {
      id: newId("template"),
      organization_id: state.organization.id,
      name: "New template",
      description: "",
    };
    upsertProjectTemplate(template);
    setSelectedId(template.id);
  }

  function removeTemplate(id: string) {
    if (!window.confirm("Delete this template and all its content?")) return;
    deleteProjectTemplate(id);
    if (selectedId === id) setSelectedId(null);
    push("Template deleted");
  }

  return (
    <PageContainer>
      <PageHeader
        title="Templates"
        actions={
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
            onClick={addTemplate}
          >
            Add template
          </button>
        }
      />
      {templates.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="No project templates yet"
            cta="Create your first template"
            onClick={addTemplate}
          />
        </div>
      ) : (
        <div className="flex flex-col md:flex-row">
          <aside className="sticky top-3 mt-3 hidden max-h-[calc(100dvh-5.5rem)] w-56 shrink-0 flex-col self-start overflow-y-auto border-r border-[var(--border)] bg-[var(--sidebar)] sm:top-5 sm:mt-5 md:flex">
            <nav className="space-y-0.5 p-2" aria-label="Templates">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    selectedId === t.id
                      ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 p-3 sm:p-5">
            <div className="mb-4 flex gap-1 overflow-x-auto md:hidden">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs",
                    selectedId === t.id
                      ? "border-[var(--text)] bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
                      : "border-[var(--border)] text-[var(--text-muted)]",
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {!selected ? (
              <p className="py-8 text-center text-sm text-[var(--text-muted)]">
                Select a template.
              </p>
            ) : (
              <TemplateEditor
                template={selected}
                onDelete={() => removeTemplate(selected.id)}
              />
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function TemplateEditor({
  template,
  onDelete,
}: {
  template: ProjectTemplate;
  onDelete: () => void;
}) {
  const {
    state,
    newId,
    upsertProjectTemplate,
    upsertTemplateMilestone,
    deleteTemplateMilestone,
    upsertTemplateTaskList,
    deleteTemplateTaskList,
    upsertTemplateTask,
    deleteTemplateTask,
  } = useData();

  const milestones = state.template_milestones
    .filter((m) => m.template_id === template.id)
    .sort((a, b) => a.sort_order - b.sort_order || a.offset_days - b.offset_days);
  const lists = state.template_task_lists.filter(
    (l) => l.template_id === template.id,
  );
  const tasks = state.template_tasks.filter(
    (t) => t.template_id === template.id,
  );

  const backlogLists = lists
    .filter((l) => !l.template_milestone_id)
    .sort((a, b) => a.sort_order - b.sort_order);

  function addMilestone() {
    upsertTemplateMilestone({
      id: newId("tm"),
      organization_id: state.organization.id,
      template_id: template.id,
      name: "New milestone",
      offset_days: 0,
      sort_order: milestones.length,
    });
  }

  function addTaskList(milestoneId: string | null) {
    const siblings = milestoneId
      ? lists.filter((l) => l.template_milestone_id === milestoneId)
      : backlogLists;
    upsertTemplateTaskList({
      id: newId("ttl"),
      organization_id: state.organization.id,
      template_id: template.id,
      template_milestone_id: milestoneId,
      name: "New list",
      sort_order: siblings.length,
    });
  }

  function addTask(listId: string, parentId: string | null) {
    const siblings = tasks.filter(
      (t) => t.list_id === listId && t.parent_id === parentId,
    );
    upsertTemplateTask({
      id: newId("tt"),
      organization_id: state.organization.id,
      template_id: template.id,
      list_id: listId,
      parent_id: parentId,
      title: parentId ? "New subtask" : "New task",
      notes: "",
      offset_days: null,
      sort_order: siblings.length,
    });
  }

  function removeTaskList(listId: string) {
    if (!window.confirm("Delete this list and its tasks?")) return;
    for (const t of tasks.filter((t) => t.list_id === listId)) {
      deleteTemplateTask(t.id);
    }
    deleteTemplateTaskList(listId);
  }

  function removeMilestone(milestoneId: string) {
    if (
      !window.confirm(
        "Delete this milestone? Its task lists become unassigned.",
      )
    )
      return;
    for (const l of lists.filter(
      (l) => l.template_milestone_id === milestoneId,
    )) {
      upsertTemplateTaskList({ ...l, template_milestone_id: null });
    }
    deleteTemplateMilestone(milestoneId);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Template name">
            <input
              className={inputClass}
              value={template.name}
              onChange={(e) =>
                upsertProjectTemplate({ ...template, name: e.target.value })
              }
            />
          </Field>
          <Field label="Description">
            <input
              className={inputClass}
              value={template.description}
              onChange={(e) =>
                upsertProjectTemplate({
                  ...template,
                  description: e.target.value,
                })
              }
            />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-[var(--status-over)]/40 px-2.5 text-xs text-[var(--status-over)] hover:bg-[var(--status-over)]/5"
            onClick={onDelete}
          >
            <Trash2 size={12} /> Delete template
          </button>
        </div>
      </section>

      <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Milestones</h2>
          <button
            type="button"
            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--row-hover)]"
            onClick={addMilestone}
          >
            <Plus size={12} /> Milestone
          </button>
        </div>
        {milestones.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No milestones — add one, or add task lists directly to the
            backlog below.
          </p>
        ) : (
          <div className="space-y-4">
            {milestones.map((m) => {
              const milestoneLists = lists
                .filter((l) => l.template_milestone_id === m.id)
                .sort((a, b) => a.sort_order - b.sort_order);
              return (
                <div
                  key={m.id}
                  className="rounded-md border border-[var(--border)] p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <input
                      className={cn(inputClass, "mt-0 h-8 max-w-[220px]")}
                      value={m.name}
                      onChange={(e) =>
                        upsertTemplateMilestone({ ...m, name: e.target.value })
                      }
                    />
                    <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                      Offset (days)
                      <input
                        type="number"
                        className={cn(inputClass, "mt-0 h-8 w-20")}
                        value={m.offset_days}
                        onChange={(e) =>
                          upsertTemplateMilestone({
                            ...m,
                            offset_days: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="ml-auto cursor-pointer text-xs text-[var(--accent)] hover:underline"
                      onClick={() => addTaskList(m.id)}
                    >
                      + List
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer text-xs text-[var(--status-over)]"
                      onClick={() => removeMilestone(m.id)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="space-y-3 pl-2">
                    {milestoneLists.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)]">
                        No task lists yet.
                      </p>
                    ) : (
                      milestoneLists.map((l) => (
                        <TaskListEditor
                          key={l.id}
                          listId={l.id}
                          listName={l.name}
                          templateId={template.id}
                          onRenameList={(name) =>
                            upsertTemplateTaskList({ ...l, name })
                          }
                          onDeleteList={() => removeTaskList(l.id)}
                          onAddTask={(parentId) => addTask(l.id, parentId)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Backlog (no milestone)</h2>
          <button
            type="button"
            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--row-hover)]"
            onClick={() => addTaskList(null)}
          >
            <Plus size={12} /> List
          </button>
        </div>
        {backlogLists.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No unassigned task lists.
          </p>
        ) : (
          <div className="space-y-3">
            {backlogLists.map((l) => (
              <TaskListEditor
                key={l.id}
                listId={l.id}
                listName={l.name}
                templateId={template.id}
                onRenameList={(name) =>
                  upsertTemplateTaskList({ ...l, name })
                }
                onDeleteList={() => removeTaskList(l.id)}
                onAddTask={(parentId) => addTask(l.id, parentId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TaskListEditor({
  listId,
  listName,
  templateId,
  onRenameList,
  onDeleteList,
  onAddTask,
}: {
  listId: string;
  listName: string;
  templateId: string;
  onRenameList: (name: string) => void;
  onDeleteList: () => void;
  onAddTask: (parentId: string | null) => void;
}) {
  const { state, upsertTemplateTask, deleteTemplateTask } = useData();
  const tasks = state.template_tasks
    .filter((t) => t.template_id === templateId && t.list_id === listId)
    .sort((a, b) => a.sort_order - b.sort_order);
  const parents = tasks.filter((t) => !t.parent_id);

  function renderTask(task: TemplateTask, depth: number) {
    const children = tasks.filter((t) => t.parent_id === task.id);
    return (
      <div key={task.id}>
        <div
          className="group flex items-center gap-1.5 border-b border-[var(--border)]/60 py-1.5 text-sm"
          style={{ paddingLeft: depth * 16 }}
        >
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
            value={task.title}
            onChange={(e) =>
              upsertTemplateTask({ ...task, title: e.target.value })
            }
          />
          <input
            type="number"
            title="Offset days from project start"
            placeholder="offset"
            className={cn(inputClass, "mt-0 h-7 w-16 text-xs")}
            value={task.offset_days ?? ""}
            onChange={(e) =>
              upsertTemplateTask({
                ...task,
                offset_days:
                  e.target.value === "" ? null : Number(e.target.value) || 0,
              })
            }
          />
          {!depth ? (
            <button
              type="button"
              className="cursor-pointer text-xs text-[var(--text-muted)] opacity-0 hover:text-[var(--text)] group-hover:opacity-100"
              onClick={() => onAddTask(task.id)}
            >
              + sub
            </button>
          ) : null}
          <button
            type="button"
            className="cursor-pointer text-xs text-[var(--status-over)] opacity-0 group-hover:opacity-100"
            onClick={() => deleteTemplateTask(task.id)}
          >
            Remove
          </button>
        </div>
        {children.map((c) => renderTask(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)]/50 px-2 py-1.5">
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium outline-none"
          value={listName}
          onChange={(e) => onRenameList(e.target.value)}
        />
        <button
          type="button"
          className="cursor-pointer text-xs text-[var(--accent)] hover:underline"
          onClick={() => onAddTask(null)}
        >
          Add task
        </button>
        <button
          type="button"
          className="cursor-pointer text-xs text-[var(--status-over)]"
          onClick={onDeleteList}
        >
          Delete list
        </button>
      </div>
      {parents.length === 0 ? (
        <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
          Empty list
        </p>
      ) : (
        <div className="px-2">
          {parents.map((t) => renderTask(t, 0))}
        </div>
      )}
    </div>
  );
}
