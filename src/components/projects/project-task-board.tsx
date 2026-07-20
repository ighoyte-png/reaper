"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  MessageSquare,
  Plus,
  StickyNote,
} from "lucide-react";
import { Field, Modal, inputClass } from "@/components/ui/form";
import {
  RichNotesHtml,
  SimpleRichTextEditor,
} from "@/components/ui/simple-rich-text";
import { useData } from "@/lib/data/store";
import { notesHasContent } from "@/lib/notes-html";
import { cn } from "@/lib/cn";
import {
  childTasks,
  filterTasksForViewer,
  parentTasks,
  sortTaskLists,
  taskStatusLabel,
  tasksForList,
} from "@/lib/domain/tasks";
import { format, startOfDay } from "date-fns";
import type { Task, TaskList, TaskStatus } from "@/lib/types";

type Props = {
  projectId: string;
  /** When true, no create/reorder/edit — status toggle still allowed for own tasks. */
  readOnly?: boolean;
  /** Compact for sidebar. */
  compact?: boolean;
  /** Show list/card toggle (Phase 8). */
  allowCardView?: boolean;
};

function todayKey() {
  return format(startOfDay(new Date()), "yyyy-MM-dd");
}

export function ProjectTaskBoard({
  projectId,
  readOnly = false,
  compact = false,
  allowCardView = false,
}: Props) {
  const {
    state,
    canManage,
    myPerson,
    upsertTask,
    upsertTaskList,
    deleteTask,
    deleteTaskList,
    newId,
  } = useData();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Task | null>(null);
  const [view, setView] = useState<"list" | "card">("list");
  const [collapsedLists, setCollapsedLists] = useState<Set<string>>(new Set());

  const allLists = useMemo(
    () =>
      sortTaskLists(state.task_lists.filter((l) => l.project_id === projectId)),
    [state.task_lists, projectId],
  );

  const visibleTasks = useMemo(
    () =>
      filterTasksForViewer(
        state.tasks.filter((t) => t.project_id === projectId),
        canManage,
        myPerson?.id ?? null,
      ),
    [state.tasks, projectId, canManage, myPerson?.id],
  );

  const manageLists = canManage && !readOnly;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function bulkStatus(status: TaskStatus) {
    for (const id of selected) {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) continue;
      if (!canManage && task.assignee_person_id !== myPerson?.id) continue;
      upsertTask({ ...task, status });
    }
    setSelected(new Set());
  }

  function bulkDue(due: string) {
    if (!canManage) return;
    for (const id of selected) {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) continue;
      upsertTask({ ...task, due_date: due || null });
    }
    setSelected(new Set());
  }

  function addList() {
    if (!manageLists) return;
    const list: TaskList = {
      id: newId("tlist"),
      organization_id: state.organization.id,
      project_id: projectId,
      milestone_id: null,
      name: "New list",
      sort_order: allLists.length,
    };
    upsertTaskList(list);
  }

  function addTask(listId: string, parentId: string | null = null) {
    if (!manageLists) return;
    const siblings = visibleTasks.filter(
      (t) => t.list_id === listId && t.parent_id === parentId,
    );
    const task: Task = {
      id: newId("task"),
      organization_id: state.organization.id,
      project_id: projectId,
      list_id: listId,
      parent_id: parentId,
      assignee_person_id: myPerson?.id ?? state.people[0]?.id ?? null,
      title: parentId ? "New subtask" : "New task",
      status: "upcoming",
      start_date: null,
      due_date: null,
      notes: "",
      sort_order: siblings.length,
    };
    upsertTask(task);
    setEditing(task);
  }

  function moveTask(task: Task, dir: -1 | 1) {
    if (!manageLists) return;
    const siblings = visibleTasks
      .filter((t) => t.list_id === task.list_id && t.parent_id === task.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex((t) => t.id === task.id);
    const swap = siblings[idx + dir];
    if (!swap) return;
    upsertTask({ ...task, sort_order: swap.sort_order });
    upsertTask({ ...swap, sort_order: task.sort_order });
  }

  function cycleStatus(task: Task) {
    const canEdit =
      canManage || task.assignee_person_id === myPerson?.id;
    if (!canEdit) return;
    const next =
      task.status === "upcoming"
        ? "active"
        : task.status === "active"
          ? "complete"
          : "upcoming";
    upsertTask({ ...task, status: next });
  }

  function renderTaskRow(task: Task, depth: number) {
    const assignee = state.people.find((p) => p.id === task.assignee_person_id);
    const hasNotes = notesHasContent(task.notes);
    const commentCount = state.task_comments.filter(
      (c) => c.task_id === task.id,
    ).length;
    const overdue =
      task.due_date &&
      task.status !== "complete" &&
      task.due_date < todayKey();
    const kids = childTasks(visibleTasks, task.id);

    return (
      <div key={task.id}>
        <div
          className={cn(
            "group flex items-center gap-1.5 border-b border-[var(--border)]/60 px-2 py-1.5 text-sm",
            task.status === "complete" && "text-[var(--text-muted)] opacity-70",
            selected.has(task.id) && "bg-[var(--accent)]/5",
          )}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {manageLists ? (
            <button
              type="button"
              className="cursor-pointer p-0.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100"
              aria-label="Move up"
              onClick={() => moveTask(task, -1)}
            >
              <GripVertical size={14} />
            </button>
          ) : (
            <span className="w-4" />
          )}
          {(canManage || !readOnly) && (
            <input
              type="checkbox"
              className="cursor-pointer"
              checked={selected.has(task.id)}
              onChange={() => toggleSelect(task.id)}
              aria-label={`Select ${task.title}`}
            />
          )}
          <button
            type="button"
            className={cn(
              "inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border",
              task.status === "complete"
                ? "border-[var(--status-healthy)] bg-[var(--status-healthy)]/20 text-[var(--status-healthy)]"
                : task.status === "active"
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-[var(--border)]",
            )}
            title={taskStatusLabel(task.status)}
            onClick={() => cycleStatus(task)}
          >
            {task.status === "complete" ? <Check size={12} /> : null}
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 cursor-pointer truncate text-left hover:underline"
            onClick={() => setEditing(task)}
          >
            {task.title}
          </button>
          {hasNotes ? (
            <StickyNote size={12} className="shrink-0 text-[var(--text-muted)]" />
          ) : null}
          {commentCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--text-muted)]">
              <MessageSquare size={11} />
              {commentCount}
            </span>
          ) : null}
          {!compact && assignee ? (
            <span className="hidden shrink-0 text-xs text-[var(--text-muted)] sm:inline">
              {assignee.name.split(" ")[0]}
            </span>
          ) : null}
          {task.due_date ? (
            <span
              className={cn(
                "shrink-0 text-xs",
                overdue ? "font-medium text-[var(--status-over)]" : "text-[var(--text-muted)]",
              )}
            >
              {task.due_date}
            </span>
          ) : null}
          {manageLists && !depth ? (
            <button
              type="button"
              className="cursor-pointer text-xs text-[var(--text-muted)] opacity-0 hover:text-[var(--text)] group-hover:opacity-100"
              onClick={() => addTask(task.list_id, task.id)}
            >
              + sub
            </button>
          ) : null}
        </div>
        {kids.map((c) => renderTaskRow(c, depth + 1))}
      </div>
    );
  }

  if (view === "card" && allowCardView) {
    const columns: TaskStatus[] = ["upcoming", "active", "complete"];
    return (
      <div className="space-y-3">
        <ViewToggle view={view} setView={setView} allowCardView={allowCardView} />
        <div className="grid gap-3 md:grid-cols-3">
          {columns.map((status) => (
            <div
              key={status}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-2"
            >
              <h4 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {taskStatusLabel(status)}
              </h4>
              {parentTasks(visibleTasks)
                .filter((t) => t.status === status)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="mb-1.5 w-full cursor-pointer rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-left text-sm hover:bg-[var(--row-hover)]"
                    onClick={() => setEditing(t)}
                  >
                    <div
                      className={cn(
                        t.status === "complete" && "text-[var(--text-muted)]",
                      )}
                    >
                      {t.title}
                    </div>
                    {t.due_date ? (
                      <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                        {t.due_date}
                      </div>
                    ) : null}
                  </button>
                ))}
            </div>
          ))}
        </div>
        {editing ? (
          <TaskEditModal
            task={editing}
            readOnly={readOnly && !(canManage || editing.assignee_person_id === myPerson?.id)}
            onClose={() => setEditing(null)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={cn("text-sm font-semibold", compact && "text-xs")}>
          Tasks
        </h3>
        <ViewToggle view={view} setView={setView} allowCardView={allowCardView} />
        {manageLists ? (
          <button
            type="button"
            className="ml-auto inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--row-hover)]"
            onClick={addList}
          >
            <Plus size={12} /> List
          </button>
        ) : null}
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-xs">
          <span>{selected.size} selected</span>
          <button
            type="button"
            className="cursor-pointer rounded border border-[var(--border)] px-2 py-0.5 hover:bg-[var(--row-hover)]"
            onClick={() => bulkStatus("active")}
          >
            Active
          </button>
          <button
            type="button"
            className="cursor-pointer rounded border border-[var(--border)] px-2 py-0.5 hover:bg-[var(--row-hover)]"
            onClick={() => bulkStatus("complete")}
          >
            Complete
          </button>
          {canManage ? (
            <label className="inline-flex items-center gap-1">
              Due
              <input
                type="date"
                className={cn(inputClass, "h-7 py-0 text-xs")}
                onChange={(e) => bulkDue(e.target.value)}
              />
            </label>
          ) : null}
          <button
            type="button"
            className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      ) : null}

      {allLists.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {manageLists
            ? "No task lists yet — add a list to get started."
            : "No tasks assigned to you on this project."}
        </p>
      ) : (
        allLists.map((list) => {
          const listTasks = tasksForList(visibleTasks, list.id);
          const parents = parentTasks(listTasks);
          const collapsed = collapsedLists.has(list.id);
          const milestone = list.milestone_id
            ? state.milestones.find((m) => m.id === list.milestone_id)
            : null;
          return (
            <section
              key={list.id}
              className="overflow-hidden rounded-md border border-[var(--border)]"
            >
              <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)]/50 px-2 py-1.5">
                <button
                  type="button"
                  className="cursor-pointer text-[var(--text-muted)]"
                  onClick={() =>
                    setCollapsedLists((prev) => {
                      const next = new Set(prev);
                      if (next.has(list.id)) next.delete(list.id);
                      else next.add(list.id);
                      return next;
                    })
                  }
                >
                  {collapsed ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </button>
                {manageLists ? (
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium outline-none"
                    value={list.name}
                    onChange={(e) =>
                      upsertTaskList({ ...list, name: e.target.value })
                    }
                  />
                ) : (
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {list.name}
                  </span>
                )}
                {milestone ? (
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {milestone.name}
                  </span>
                ) : null}
                {manageLists ? (
                  <>
                    <button
                      type="button"
                      className="cursor-pointer text-xs text-[var(--accent)] hover:underline"
                      onClick={() => addTask(list.id)}
                    >
                      Add task
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer text-xs text-[var(--status-over)]"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete list “${list.name}” and its tasks?`,
                          )
                        ) {
                          for (const t of listTasks) deleteTask(t.id);
                          deleteTaskList(list.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
              {!collapsed ? (
                parents.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                    Empty list
                  </p>
                ) : (
                  parents.map((t) => renderTaskRow(t, 0))
                )
              ) : null}
            </section>
          );
        })
      )}

      {editing ? (
        <TaskEditModal
          task={editing}
          readOnly={
            readOnly &&
            !(canManage || editing.assignee_person_id === myPerson?.id)
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function ViewToggle({
  view,
  setView,
  allowCardView,
}: {
  view: "list" | "card";
  setView: (v: "list" | "card") => void;
  allowCardView: boolean;
}) {
  if (!allowCardView) return null;
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] text-xs">
      <button
        type="button"
        className={cn(
          "cursor-pointer px-2 py-1",
          view === "list" && "bg-[var(--row-hover)]",
        )}
        onClick={() => setView("list")}
      >
        List
      </button>
      <button
        type="button"
        className={cn(
          "cursor-pointer px-2 py-1",
          view === "card" && "bg-[var(--row-hover)]",
        )}
        onClick={() => setView("card")}
      >
        Cards
      </button>
    </div>
  );
}

function TaskEditModal({
  task,
  readOnly,
  onClose,
}: {
  task: Task;
  readOnly: boolean;
  onClose: () => void;
}) {
  const {
    state,
    canManage,
    myPerson,
    profile,
    upsertTask,
    deleteTask,
    upsertTaskComment,
    deleteTaskComment,
    newId,
  } = useData();
  const [draft, setDraft] = useState(task);
  const [comment, setComment] = useState("");
  const comments = state.task_comments
    .filter((c) => c.task_id === task.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const canSave =
    canManage ||
    (!readOnly && draft.assignee_person_id === myPerson?.id);

  return (
    <Modal title={canManage ? "Edit task" : "Task"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title">
          <input
            className={inputClass}
            value={draft.title}
            disabled={!canManage}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <select
              className={inputClass}
              value={draft.status}
              disabled={!canSave}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  status: e.target.value as TaskStatus,
                })
              }
            >
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="complete">Complete</option>
            </select>
          </Field>
          <Field label="Assignee">
            <select
              className={inputClass}
              value={draft.assignee_person_id ?? ""}
              disabled={!canManage}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  assignee_person_id: e.target.value || null,
                })
              }
            >
              <option value="">Unassigned</option>
              {state.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start">
            <input
              type="date"
              className={inputClass}
              value={draft.start_date ?? ""}
              disabled={!canManage}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  start_date: e.target.value || null,
                })
              }
            />
          </Field>
          <Field label="Due">
            <input
              type="date"
              className={inputClass}
              value={draft.due_date ?? ""}
              disabled={!canManage}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  due_date: e.target.value || null,
                })
              }
            />
          </Field>
        </div>
        <Field label="Notes">
          {canManage ? (
            <SimpleRichTextEditor
              value={draft.notes}
              onChange={(notes) => setDraft({ ...draft, notes })}
            />
                          ) : (
                            <div className="text-sm text-[var(--text-muted)]">
                              No notes
                            </div>
                          )}
        </Field>

        <div className="border-t border-[var(--border)] pt-3">
          <h4 className="mb-2 text-sm font-semibold">Comments</h4>
          <div className="mb-2 max-h-40 space-y-2 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No comments yet</p>
            ) : (
              comments.map((c) => {
                const author = state.profiles.find(
                  (p) => p.id === c.author_profile_id,
                );
                return (
                  <div
                    key={c.id}
                    className="rounded-md border border-[var(--border)] p-2 text-sm"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                      <span>{author?.full_name ?? "Someone"}</span>
                      <span>{c.created_at.slice(0, 10)}</span>
                    </div>
                    <RichNotesHtml html={c.body} />
                    {(canManage || c.author_profile_id === profile?.id) && (
                      <button
                        type="button"
                        className="mt-1 cursor-pointer text-xs text-[var(--status-over)]"
                        onClick={() => deleteTaskComment(c.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {profile ? (
            <div className="space-y-2">
              <SimpleRichTextEditor value={comment} onChange={setComment} />
              <button
                type="button"
                className="h-8 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
                onClick={() => {
                  if (!notesHasContent(comment)) return;
                  upsertTaskComment({
                    id: newId("tcom"),
                    organization_id: state.organization.id,
                    task_id: task.id,
                    author_profile_id: profile.id,
                    body: comment,
                    created_at: new Date().toISOString(),
                  });
                  setComment("");
                }}
              >
                Add comment
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {canManage ? (
            <button
              type="button"
              className="mr-auto h-8 cursor-pointer rounded-md border border-[var(--status-over)]/40 px-3 text-sm text-[var(--status-over)]"
              onClick={() => {
                deleteTask(task.id);
                onClose();
              }}
            >
              Delete task
            </button>
          ) : null}
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm"
            onClick={onClose}
          >
            Close
          </button>
          {canSave ? (
            <button
              type="button"
              className="h-8 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)]"
              onClick={() => {
                upsertTask(draft);
                onClose();
              }}
            >
              Save
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
