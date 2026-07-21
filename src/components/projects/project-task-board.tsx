"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  MessageSquare,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { Field, Modal, inputClass, DateInput } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { PersonAvatar } from "@/components/people/person-avatar";
import {
  RichNotesHtml,
  SimpleRichTextEditor,
} from "@/components/ui/simple-rich-text";
import { useData } from "@/lib/data/store";
import { useViewAsOptional } from "@/lib/view-as";
import { notesHasContent } from "@/lib/notes-html";
import { extractMentionPersonIds } from "@/lib/mentions";
import { cn } from "@/lib/cn";
import { projectTeamPersonIds } from "@/lib/domain/project-access";
import {
  filterTasksForViewer,
  parentTasks,
  sortTaskLists,
  taskStatusLabel,
  tasksForList,
} from "@/lib/domain/tasks";
import { sortPeopleByName } from "@/lib/domain/sorting";
import { format, parseISO, startOfDay } from "date-fns";
import type {
  Person,
  Profile,
  Task,
  TaskComment,
  TaskList,
  TaskStatus,
} from "@/lib/types";

type Props = {
  projectId: string;
  /** When true, no create/reorder/edit — status toggle still allowed for own tasks. */
  readOnly?: boolean;
  /** Compact for sidebar. */
  compact?: boolean;
  /** Show list/card toggle (Phase 8). */
  allowCardView?: boolean;
  /** When false, hide row/list selection checkboxes and bulk bar. */
  allowSelect?: boolean;
  /** Deep-link: expand this task (and optionally open comments). */
  focusTaskId?: string | null;
  openComments?: boolean;
};

function todayKey() {
  return format(startOfDay(new Date()), "yyyy-MM-dd");
}

function InitialsAvatar({ person }: { person: Person }) {
  return (
    <PersonAvatar
      avatarUrl={person.avatar_url}
      name={person.name}
      size="xs"
      fallback="initials"
      className="ring-1 ring-[var(--border)]"
    />
  );
}

/** Shared read-only-ish context threaded through row/list/comment sub-components. */
type BoardCtx = {
  people: Person[];
  profiles: Profile[];
  comments: TaskComment[];
  profileId: string | null;
  canManage: boolean;
  myPersonId: string | null;
  manageLists: boolean;
  allowSelect: boolean;
  listsEditMode: boolean;
  compact: boolean;
  /** Status changes only — no edit modal or comments (e.g. schedule sidebar). */
  readOnly: boolean;
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  setParentsSelected: (ids: string[], on: boolean) => void;
  cycleStatus: (task: Task) => void;
  setEditing: (task: Task) => void;
  addSubtask: (listId: string, parentId: string) => void;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  childrenMap: Map<string, Task[]>;
  addComment: (taskId: string, html: string, mentionedPersonIds: string[]) => void;
  deleteComment: (id: string) => void;
  /** Project team available for @mentions. */
  mentionPeople: Person[];
};

type TaskDragData = { type: "task"; listId: string; parentId: string | null };
type ListDragData = { type: "list" };
type ListDropData = { type: "list-drop"; listId: string };

const INDENT_DRAG_PX = 36;

function sortByOrder(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title),
  );
}

export function ProjectTaskBoard({
  projectId,
  readOnly = false,
  compact = false,
  allowCardView = false,
  allowSelect: allowSelectProp,
  focusTaskId = null,
  openComments = false,
}: Props) {
  const {
    state,
    canManage,
    myPerson,
    profile,
    isPublicShare,
    upsertTask,
    upsertTaskList,
    upsertTaskComment,
    deleteTaskComment,
    deleteTask,
    deleteTaskList,
    newId,
  } = useData();
  const viewAs = useViewAsOptional();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDraft, setBulkDraft] = useState<{
    status?: TaskStatus;
    /** undefined = unchanged; null = unassigned */
    assigneeId?: string | null;
    /** undefined = unchanged */
    dueDate?: string;
  }>({});
  const [editing, setEditing] = useState<Task | null>(null);
  const [view, setView] = useState<"list" | "card">("list");
  const [collapsedLists, setCollapsedLists] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [listsEditMode, setListsEditMode] = useState(false);

  const manageLists = canManage && !readOnly && !isPublicShare;
  const allowSelect =
    allowSelectProp !== undefined
      ? allowSelectProp
      : !isPublicShare && (canManage || !readOnly);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allLists = useMemo(
    () =>
      sortTaskLists(state.task_lists.filter((l) => l.project_id === projectId)),
    [state.task_lists, projectId],
  );

  const viewerCanManage = viewAs?.viewAsPersonId ? false : canManage;
  const viewerPersonId = viewAs?.viewAsPersonId
    ? viewAs.viewAsPersonId
    : myPerson?.id ?? null;

  const visibleTasks = useMemo(() => {
    const projectTasks = state.tasks.filter((t) => t.project_id === projectId);
    // Public share / client-facing project views have no person — show every task.
    if (isPublicShare) return projectTasks;
    return filterTasksForViewer(projectTasks, viewerCanManage, viewerPersonId);
  }, [
    state.tasks,
    projectId,
    isPublicShare,
    viewerCanManage,
    viewerPersonId,
  ]);

  const childrenMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of visibleTasks) {
      if (!t.parent_id) continue;
      const arr = map.get(t.parent_id) ?? [];
      arr.push(t);
      map.set(t.parent_id, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
    }
    return map;
  }, [visibleTasks]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setParentsSelected(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkDraft({});
  }

  useEffect(() => {
    if (selected.size === 0) setBulkDraft({});
  }, [selected.size]);

  const bulkHasChanges =
    bulkDraft.status !== undefined ||
    bulkDraft.assigneeId !== undefined ||
    bulkDraft.dueDate !== undefined;

  function applyBulkEdits() {
    if (!bulkHasChanges || selected.size === 0) return;
    for (const id of selected) {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) continue;
      let next = { ...task };
      let changed = false;
      if (bulkDraft.status !== undefined) {
        if (canManage || task.assignee_person_id === myPerson?.id) {
          next = { ...next, status: bulkDraft.status };
          changed = true;
        }
      }
      if (canManage && bulkDraft.assigneeId !== undefined) {
        next = { ...next, assignee_person_id: bulkDraft.assigneeId };
        changed = true;
      }
      if (canManage && bulkDraft.dueDate !== undefined) {
        next = { ...next, due_date: bulkDraft.dueDate || null };
        changed = true;
      }
      if (changed) upsertTask(next);
    }
    clearSelection();
  }

  function addList() {
    if (!manageLists) return;
    const list: TaskList = {
      id: newId("tlist"),
      organization_id: state.organization.id,
      project_id: projectId,
      milestone_id: null,
      name: "New list",
      color: null,
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

  function cycleStatus(task: Task) {
    const canEdit = canManage || task.assignee_person_id === myPerson?.id;
    if (!canEdit) return;
    const next =
      task.status === "upcoming"
        ? "active"
        : task.status === "active"
          ? "complete"
          : "upcoming";
    upsertTask({ ...task, status: next });
  }

  function addComment(
    taskId: string,
    html: string,
    mentionedPersonIds: string[],
  ) {
    if (!profile) return;
    upsertTaskComment({
      id: newId("tcom"),
      organization_id: state.organization.id,
      task_id: taskId,
      author_profile_id: profile.id,
      body: html,
      created_at: new Date().toISOString(),
      mentioned_person_ids: [...new Set(mentionedPersonIds)],
    });
  }

  const mentionPeople = useMemo(() => {
    const ids = projectTeamPersonIds(
      projectId,
      state.project_members,
      state.assignments,
      state.tasks,
    );
    return state.people
      .filter((p) => ids.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [
    state.assignments,
    state.project_members,
    state.tasks,
    state.people,
    projectId,
  ]);

  useEffect(() => {
    if (!focusTaskId || !openComments) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(focusTaskId);
      return next;
    });
    const t = window.setTimeout(() => {
      document
        .getElementById(`task-row-${focusTaskId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [focusTaskId, openComments]);

  function moveTaskToColumn(taskId: string, destStatus: TaskStatus, destIndex: number) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const sourceStatus = task.status;
    const destSiblings = parentTasks(visibleTasks)
      .filter((t) => t.status === destStatus && t.id !== taskId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const ordered = [...destSiblings];
    ordered.splice(Math.min(destIndex, ordered.length), 0, task);
    ordered.forEach((t, i) => {
      if (t.id === taskId) {
        if (t.status !== destStatus || t.sort_order !== i) {
          upsertTask({ ...t, status: destStatus, sort_order: i });
        }
      } else if (t.sort_order !== i) {
        upsertTask({ ...t, sort_order: i });
      }
    });
    if (sourceStatus !== destStatus) {
      const sourceSiblings = parentTasks(visibleTasks)
        .filter((t) => t.status === sourceStatus && t.id !== taskId)
        .sort((a, b) => a.sort_order - b.sort_order);
      sourceSiblings.forEach((t, i) => {
        if (t.sort_order !== i) upsertTask({ ...t, sort_order: i });
      });
    }
  }

  function handleListDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    if (!manageLists || !over) return;

    const activeData = active.data.current as
      | ListDragData
      | TaskDragData
      | undefined;
    const overData = over.data.current as
      | ListDragData
      | TaskDragData
      | ListDropData
      | undefined;
    if (!activeData) return;

    if (activeData.type === "list" && overData?.type === "list") {
      if (active.id === over.id) return;
      const oldIndex = allLists.findIndex((l) => l.id === active.id);
      const newIndex = allLists.findIndex((l) => l.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(allLists, oldIndex, newIndex);
      reordered.forEach((l, i) => {
        if (l.sort_order !== i) upsertTaskList({ ...l, sort_order: i });
      });
      return;
    }

    if (activeData.type !== "task") return;

    const projectTasks = state.tasks.filter((t) => t.project_id === projectId);
    const task = projectTasks.find((t) => t.id === active.id);
    if (!task) return;

    const childTasks = sortByOrder(
      projectTasks.filter((t) => t.parent_id === task.id),
    );

    const primarilyHorizontal =
      Math.abs(delta.x) >= INDENT_DRAG_PX &&
      Math.abs(delta.x) >= Math.abs(delta.y) * 0.75;

    if (primarilyHorizontal) {
      if (delta.x > 0) {
        // Indent: nest under the previous top-level sibling (max depth 1).
        if (task.parent_id || childTasks.length > 0) return;
        const parents = sortByOrder(
          projectTasks.filter(
            (t) => t.list_id === task.list_id && !t.parent_id,
          ),
        );
        const idx = parents.findIndex((p) => p.id === task.id);
        if (idx <= 0) return;
        const newParent = parents[idx - 1]!;
        const existingKids = sortByOrder(
          projectTasks.filter((t) => t.parent_id === newParent.id),
        );
        upsertTask({
          ...task,
          parent_id: newParent.id,
          sort_order: existingKids.length,
        });
        parents
          .filter((p) => p.id !== task.id)
          .forEach((p, i) => {
            if (p.sort_order !== i) upsertTask({ ...p, sort_order: i });
          });
      } else {
        // Outdent: promote subtask to a normal top-level task.
        if (!task.parent_id) return;
        const parent = projectTasks.find((t) => t.id === task.parent_id);
        if (!parent) return;
        const parents = sortByOrder(
          projectTasks.filter(
            (t) => t.list_id === task.list_id && !t.parent_id,
          ),
        );
        const parentIdx = parents.findIndex((p) => p.id === parent.id);
        const insertAt = parentIdx < 0 ? parents.length : parentIdx + 1;
        const nextParents = [...parents];
        nextParents.splice(insertAt, 0, task);
        nextParents.forEach((p, i) => {
          upsertTask({
            ...p,
            list_id: task.list_id,
            parent_id: null,
            sort_order: i,
          });
        });
        sortByOrder(
          projectTasks.filter(
            (t) => t.parent_id === parent.id && t.id !== task.id,
          ),
        ).forEach((t, i) => {
          if (t.sort_order !== i) upsertTask({ ...t, sort_order: i });
        });
      }
      return;
    }

    if (active.id === over.id || !overData) return;

    let destListId: string;
    let destParentId: string | null;
    let insertIndex: number;

    if (overData.type === "list-drop") {
      destListId = overData.listId;
      destParentId = null;
      insertIndex = projectTasks.filter(
        (t) =>
          t.list_id === destListId && !t.parent_id && t.id !== task.id,
      ).length;
    } else if (overData.type === "task") {
      const overTask = projectTasks.find((t) => t.id === over.id);
      if (!overTask) return;
      destListId = overTask.list_id;
      destParentId = overTask.parent_id;
      const destSiblings = sortByOrder(
        projectTasks.filter(
          (t) =>
            t.list_id === destListId &&
            t.parent_id === destParentId &&
            t.id !== task.id,
        ),
      );
      const overIdx = destSiblings.findIndex((t) => t.id === overTask.id);
      insertIndex = overIdx < 0 ? destSiblings.length : overIdx;
    } else {
      return;
    }

    if (destParentId === task.id) return;
    if (destParentId && childTasks.length > 0) return;
    if (
      destParentId &&
      projectTasks.some(
        (t) => t.id === destParentId && t.parent_id === task.id,
      )
    ) {
      return;
    }

    const oldListId = task.list_id;
    const oldParentId = task.parent_id;

    if (oldListId === destListId && oldParentId === destParentId) {
      const scope = sortByOrder(
        projectTasks.filter(
          (t) => t.list_id === destListId && t.parent_id === destParentId,
        ),
      );
      const oldIndex = scope.findIndex((t) => t.id === task.id);
      const newIndex = scope.findIndex((t) => t.id === over.id);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const reordered = arrayMove(scope, oldIndex, newIndex);
      reordered.forEach((t, i) => {
        if (t.sort_order !== i) upsertTask({ ...t, sort_order: i });
      });
      return;
    }

    const destSiblings = sortByOrder(
      projectTasks.filter(
        (t) =>
          t.list_id === destListId &&
          t.parent_id === destParentId &&
          t.id !== task.id,
      ),
    );
    const target = Math.max(0, Math.min(insertIndex, destSiblings.length));
    const nextDest = [...destSiblings];
    nextDest.splice(target, 0, task);
    nextDest.forEach((t, i) => {
      upsertTask({
        ...t,
        list_id: destListId,
        parent_id: destParentId,
        sort_order: i,
      });
    });

    for (const child of childTasks) {
      if (child.list_id !== destListId) {
        upsertTask({ ...child, list_id: destListId });
      }
    }

    sortByOrder(
      projectTasks.filter(
        (t) =>
          t.list_id === oldListId &&
          t.parent_id === oldParentId &&
          t.id !== task.id,
      ),
    ).forEach((t, i) => {
      if (t.sort_order !== i) upsertTask({ ...t, sort_order: i });
    });
  }

  const ctx: BoardCtx = {
    people: state.people,
    profiles: state.profiles,
    comments: state.task_comments,
    profileId: profile?.id ?? null,
    canManage,
    myPersonId: myPerson?.id ?? null,
    manageLists,
    allowSelect,
    listsEditMode,
    compact,
    readOnly: readOnly || isPublicShare,
    selected,
    toggleSelect,
    setParentsSelected,
    cycleStatus,
    setEditing,
    addSubtask: (listId, parentId) => addTask(listId, parentId),
    expanded,
    toggleExpand,
    childrenMap,
    addComment,
    deleteComment: deleteTaskComment,
    mentionPeople,
  };

  if (view === "card" && allowCardView) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn("text-sm font-semibold", compact && "text-xs")}>
            Tasks
          </h3>
          <ViewToggle
            view={view}
            setView={setView}
            allowCardView={allowCardView}
          />
        </div>
        <KanbanBoard
          tasks={parentTasks(visibleTasks)}
          manageLists={manageLists}
          onEdit={readOnly || isPublicShare ? undefined : setEditing}
          onMove={moveTaskToColumn}
        />
        {editing && !readOnly && !isPublicShare ? (
          <TaskEditModal
            task={editing}
            readOnly={!(canManage || editing.assignee_person_id === myPerson?.id)}
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
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--row-hover)]"
              onClick={addList}
            >
              <Plus size={12} /> List
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border hover:bg-[var(--row-hover)] hover:text-[var(--accent)]",
                listsEditMode
                  ? "border-[var(--accent)] bg-[var(--row-hover)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--text-muted)]",
              )}
              onClick={() => setListsEditMode((v) => !v)}
              aria-label={listsEditMode ? "Done editing lists" : "Edit lists"}
              aria-pressed={listsEditMode}
              title={listsEditMode ? "Done editing lists" : "Edit lists"}
            >
              <Pencil size={14} />
            </button>
          </div>
        ) : null}
      </div>

      {selected.size > 0 ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-end gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] py-2 pl-3 pr-1.5 text-xs shadow-sm sm:pl-4 sm:pr-1.5">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-[var(--text-muted)]">
              Status
            </span>
            <select
              className={cn(
                inputClass,
                "mt-0 h-7 w-auto min-w-[7.5rem] py-0 text-xs",
              )}
              value={bulkDraft.status ?? ""}
              onChange={(e) => {
                const value = e.target.value as TaskStatus | "";
                setBulkDraft((prev) => ({
                  ...prev,
                  status: value || undefined,
                }));
              }}
              aria-label="Set status for selected tasks"
            >
              <option value="">Choose…</option>
              <option value="upcoming">{taskStatusLabel("upcoming")}</option>
              <option value="active">{taskStatusLabel("active")}</option>
              <option value="complete">{taskStatusLabel("complete")}</option>
            </select>
          </label>
          {canManage ? (
            <>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium text-[var(--text-muted)]">
                  Assign
                </span>
                <select
                  className={cn(
                    inputClass,
                    "mt-0 h-7 w-auto max-w-[10rem] py-0 text-xs",
                  )}
                  value={
                    bulkDraft.assigneeId === undefined
                      ? ""
                      : bulkDraft.assigneeId === null
                        ? "__none__"
                        : bulkDraft.assigneeId
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    setBulkDraft((prev) => ({
                      ...prev,
                      assigneeId:
                        value === ""
                          ? undefined
                          : value === "__none__"
                            ? null
                            : value,
                    }));
                  }}
                  aria-label="Assign selected tasks"
                >
                  <option value="">Choose…</option>
                  <option value="__none__">Unassigned</option>
                  {sortPeopleByName(state.people).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium text-[var(--text-muted)]">
                  Due
                </span>
                <DateInput
                  className={cn(inputClass, "mt-0 h-7 py-0 text-xs")}
                  value={bulkDraft.dueDate ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBulkDraft((prev) => ({
                      ...prev,
                      dueDate: value || undefined,
                    }));
                  }}
                />
              </label>
            </>
          ) : null}
          <div className="ml-auto flex shrink-0 flex-col items-end gap-0">
            <span className="mb-1 text-[10px] text-[var(--text-muted)]">
              {selected.size} selected
            </span>
            <div className="flex items-center gap-1.5">
              {bulkHasChanges ? (
                <button
                  type="button"
                  className="box-border h-9 cursor-pointer rounded-md bg-[var(--accent)] px-2.5 text-xs font-medium text-[var(--accent-fg)] hover:opacity-90"
                  onClick={applyBulkEdits}
                >
                  Apply
                </button>
              ) : null}
              <button
                type="button"
                className="box-border h-9 cursor-pointer rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--row-hover)]"
                onClick={clearSelection}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {allLists.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {manageLists
            ? "No task lists yet — add a list to get started."
            : "No tasks assigned to you on this project."}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleListDragEnd}
        >
          <SortableContext
            items={allLists.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
            disabled={!manageLists}
          >
            {allLists.map((list) => {
              const listTasks = tasksForList(visibleTasks, list.id);
              const parents = parentTasks(listTasks);
              const collapsed = collapsedLists.has(list.id);
              const milestone = list.milestone_id
                ? state.milestones.find((m) => m.id === list.milestone_id)
                : null;
              return (
                <ListSection
                  key={list.id}
                  list={list}
                  parents={parents}
                  ctx={ctx}
                  collapsed={collapsed}
                  onToggleCollapse={() =>
                    setCollapsedLists((prev) => {
                      const next = new Set(prev);
                      if (next.has(list.id)) next.delete(list.id);
                      else next.add(list.id);
                      return next;
                    })
                  }
                  milestoneName={milestone?.name ?? null}
                  onNameChange={(name) => upsertTaskList({ ...list, name })}
                  onAddTask={() => addTask(list.id)}
                  onDelete={() => {
                    if (confirm(`Delete list "${list.name}" and its tasks?`)) {
                      for (const t of listTasks) deleteTask(t.id);
                      deleteTaskList(list.id);
                    }
                  }}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      )}

      {editing && !readOnly && !isPublicShare ? (
        <TaskEditModal
          task={editing}
          readOnly={!(canManage || editing.assignee_person_id === myPerson?.id)}
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

function ListSection({
  list,
  parents,
  ctx,
  collapsed,
  onToggleCollapse,
  milestoneName,
  onNameChange,
  onAddTask,
  onDelete,
}: {
  list: TaskList;
  parents: Task[];
  ctx: BoardCtx;
  collapsed: boolean;
  onToggleCollapse: () => void;
  milestoneName: string | null;
  onNameChange: (name: string) => void;
  onAddTask: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: list.id,
      data: { type: "list" } satisfies ListDragData,
      disabled: !ctx.manageLists,
    });

  const selectableIds = parents.flatMap((p) => [
    p.id,
    ...(ctx.childrenMap.get(p.id) ?? []).map((c) => c.id),
  ]);
  const selectedCount = selectableIds.filter((id) =>
    ctx.selected.has(id),
  ).length;
  const allSelected =
    selectableIds.length > 0 && selectedCount === selectableIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <section
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="mb-3 overflow-hidden rounded-md border border-[var(--divider)]"
    >
      {/* Measure only the header so tall lists don't block drops at the top. */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-wrap items-center gap-2 border-b border-[var(--divider)] px-2 py-1.5",
          !list.color && "bg-[var(--bg-elevated)]/50",
        )}
        style={list.color ? { backgroundColor: list.color } : undefined}
      >
        {ctx.manageLists ? (
          <button
            type="button"
            className="cursor-grab touch-none text-[var(--text-muted)]"
            aria-label="Drag list to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <button
          type="button"
          className="cursor-pointer text-[var(--text-muted)]"
          onClick={onToggleCollapse}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        {ctx.manageLists ? (
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium outline-none"
            value={list.name}
            onChange={(e) => onNameChange(e.target.value)}
          />
        ) : (
          <span className="min-w-0 flex-1 text-sm font-medium">{list.name}</span>
        )}
        {milestoneName ? (
          <span className="text-[10px] text-[var(--text-muted)]">
            {milestoneName}
          </span>
        ) : null}
        {ctx.allowSelect && selectableIds.length > 0 ? (
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            inputRef={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={() =>
              ctx.setParentsSelected(selectableIds, !allSelected)
            }
            aria-label={`Select all tasks in ${list.name}`}
            title="Select all"
          />
        ) : null}
        {ctx.manageLists && ctx.listsEditMode ? (
          <button
            type="button"
            className="inline-flex cursor-pointer rounded p-1 text-[var(--status-over)] hover:bg-[var(--row-hover)]"
            onClick={onDelete}
            aria-label={`Delete list ${list.name}`}
            title="Delete list"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
      {!collapsed ? (
        <>
          {parents.length === 0 ? (
            <ListTaskDropZone listId={list.id} disabled={!ctx.manageLists}>
              <div className="h-2" aria-hidden />
            </ListTaskDropZone>
          ) : (
            <SortableContext
              items={parents.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
              disabled={!ctx.manageLists}
            >
              {parents.map((t) => (
                <TaskRow key={t.id} task={t} depth={0} ctx={ctx} />
              ))}
            </SortableContext>
          )}
          {ctx.manageLists ? (
            <ListTaskDropZone listId={list.id} disabled={false}>
              <div className="px-2 py-1.5 text-left">
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                  onClick={onAddTask}
                >
                  <Plus size={12} /> Add task
                </button>
              </div>
            </ListTaskDropZone>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ListTaskDropZone({
  listId,
  disabled,
  children,
}: {
  listId: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `list-drop:${listId}`,
    data: { type: "list-drop", listId } satisfies ListDropData,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(isOver && "bg-[var(--accent)]/10")}
    >
      {children}
    </div>
  );
}

function TaskRow({
  task,
  depth,
  ctx,
}: {
  task: Task;
  depth: number;
  ctx: BoardCtx;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: {
        type: "task",
        listId: task.list_id,
        parentId: task.parent_id,
      } satisfies TaskDragData,
      disabled: !ctx.manageLists,
    });

  const assignee = ctx.people.find((p) => p.id === task.assignee_person_id);
  const taskComments = ctx.comments.filter((c) => c.task_id === task.id);
  const hasNotes = notesHasContent(task.notes);
  const overdue =
    task.due_date && task.status !== "complete" && task.due_date < todayKey();
  const kids = depth === 0 ? ctx.childrenMap.get(task.id) ?? [] : [];
  const isExpanded = ctx.expanded.has(task.id);
  const isSelected = ctx.selected.has(task.id);
  const canEditStatus = ctx.canManage || task.assignee_person_id === ctx.myPersonId;

  return (
    <div
      id={`task-row-${task.id}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      {/* Measure only the row so parents with subtasks don't block top drops. */}
      <div
        ref={setNodeRef}
        className={cn(
          "group flex items-center gap-1.5 border-b border-[var(--divider)] px-2 py-1.5 text-sm",
          task.status === "complete" && "text-[var(--task-complete-fg)]",
          isSelected && "bg-[var(--accent)]/10",
        )}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {ctx.manageLists ? (
          <button
            type="button"
            className="cursor-grab touch-none p-0.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100"
            aria-label="Drag to reorder, nest, or move to another list"
            title="Drag vertically to reorder or move lists. Drag right to nest, left to un-nest."
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <button
          type="button"
          className={cn(
            "h-2.5 w-2.5 shrink-0 cursor-pointer rounded-sm",
            task.status === "complete"
              ? "bg-[var(--task-complete-fg)]"
              : task.status === "active"
                ? "bg-[var(--task-active-fg)]"
                : "bg-[var(--task-upcoming-fg)]",
            !canEditStatus && "cursor-not-allowed opacity-60",
          )}
          title={taskStatusLabel(task.status)}
          aria-label={`Status: ${taskStatusLabel(task.status)}. Click to change.`}
          onClick={() => ctx.cycleStatus(task)}
        />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {ctx.readOnly ? (
            <span
              className={cn(
                "min-w-0 truncate",
                task.status === "complete" && "line-through",
              )}
            >
              {task.title}
            </span>
          ) : (
            <button
              type="button"
              className={cn(
                "min-w-0 cursor-pointer truncate text-left hover:underline",
                task.status === "complete" && "line-through",
              )}
              onClick={() => ctx.setEditing(task)}
            >
              {task.title}
            </button>
          )}
          {!ctx.compact && assignee ? <InitialsAvatar person={assignee} /> : null}
          {hasNotes ? (
            <StickyNote size={12} className="shrink-0 text-[var(--text-muted)]" />
          ) : null}
          {task.due_date ? (
            <span
              className={cn(
                "shrink-0 text-xs",
                overdue
                  ? "font-medium text-[var(--status-over)]"
                  : "text-[var(--text-muted)]",
              )}
            >
              {format(parseISO(task.due_date), "MMM d, yyyy")}
            </span>
          ) : null}
          {!ctx.readOnly ? (
            <button
              type="button"
              className={cn(
                "inline-flex shrink-0 cursor-pointer items-center gap-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]",
                taskComments.length === 0 && "opacity-0 group-hover:opacity-100",
              )}
              title="Comments"
              aria-label="Toggle comments"
              onClick={() => ctx.toggleExpand(task.id)}
            >
              <MessageSquare size={16} />
              {taskComments.length > 0 ? taskComments.length : null}
              {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
          ) : null}
        </div>
        {ctx.manageLists && depth === 0 ? (
          <button
            type="button"
            className="inline-flex cursor-pointer rounded p-0.5 text-[var(--text-muted)] opacity-0 hover:bg-[var(--row-hover)] hover:text-[var(--text)] group-hover:opacity-100"
            onClick={() => ctx.addSubtask(task.list_id, task.id)}
            aria-label="Add subtask"
            title="Add subtask"
          >
            <Plus size={14} />
          </button>
        ) : null}
        {ctx.allowSelect ? (
          <Checkbox
            checked={isSelected}
            onChange={() => ctx.toggleSelect(task.id)}
            aria-label={`Select ${task.title}`}
          />
        ) : null}
      </div>
      {!ctx.readOnly && isExpanded ? (
        <CommentThread task={task} depth={depth} comments={taskComments} ctx={ctx} />
      ) : null}
      {depth === 0 && kids.length > 0 ? (
        <SortableContext
          items={kids.map((k) => k.id)}
          strategy={verticalListSortingStrategy}
          disabled={!ctx.manageLists}
        >
          {kids.map((k) => (
            <TaskRow key={k.id} task={k} depth={depth + 1} ctx={ctx} />
          ))}
        </SortableContext>
      ) : null}
    </div>
  );
}

function CommentThread({
  task,
  depth,
  comments,
  ctx,
}: {
  task: Task;
  depth: number;
  comments: TaskComment[];
  ctx: BoardCtx;
}) {
  const [draft, setDraft] = useState("");
  const sorted = [...comments].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div
      className="space-y-2 border-b border-[var(--divider)] bg-[var(--bg-elevated)]/30 px-2 py-2"
      style={{ paddingLeft: 28 + depth * 16 }}
    >
      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">No comments yet</p>
      ) : (
        sorted.map((c) => {
          const author = ctx.profiles.find((p) => p.id === c.author_profile_id);
          return (
            <div
              key={c.id}
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-sm"
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                <span>{author?.full_name ?? "Someone"}</span>
                <span>{c.created_at.slice(0, 10)}</span>
              </div>
              <RichNotesHtml html={c.body} />
              {ctx.canManage || c.author_profile_id === ctx.profileId ? (
                <button
                  type="button"
                  className="mt-1 cursor-pointer text-xs text-[var(--status-over)]"
                  onClick={() => ctx.deleteComment(c.id)}
                >
                  Delete
                </button>
              ) : null}
            </div>
          );
        })
      )}
      {ctx.profileId ? (
        <div className="space-y-2">
          <SimpleRichTextEditor
            value={draft}
            onChange={setDraft}
            placeholder="Add a comment… Use @ to mention"
            mentionPeople={ctx.mentionPeople}
          />
          <button
            type="button"
            className="h-7 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-xs font-medium text-[var(--accent-fg)] hover:opacity-90"
            onClick={() => {
              if (!notesHasContent(draft)) return;
              ctx.addComment(
                task.id,
                draft,
                extractMentionPersonIds(draft),
              );
              setDraft("");
            }}
          >
            Add comment
          </button>
        </div>
      ) : null}
    </div>
  );
}

type CardDragData = { type: "card"; status: TaskStatus };
type ColumnDragData = { type: "column"; status: TaskStatus };

function statusCardTone(status: TaskStatus) {
  switch (status) {
    case "complete":
      return {
        bar: "bg-[var(--task-complete-fg)]",
        shell:
          "border-[var(--task-complete-fg)]/35 bg-[var(--task-complete-bg)]",
      };
    case "active":
      return {
        bar: "bg-[var(--task-active-fg)]",
        shell: "border-[var(--task-active-fg)]/35 bg-[var(--task-active-bg)]",
      };
    default:
      return {
        bar: "bg-[var(--task-upcoming-fg)]",
        shell:
          "border-[var(--task-upcoming-fg)]/35 bg-[var(--task-upcoming-bg)]",
      };
  }
}

function KanbanBoard({
  tasks,
  manageLists,
  onEdit,
  onMove,
}: {
  tasks: Task[];
  manageLists: boolean;
  onEdit?: (task: Task) => void;
  onMove: (taskId: string, destStatus: TaskStatus, destIndex: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const columns: TaskStatus[] = ["upcoming", "active", "complete"];
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = activeId
    ? (tasks.find((t) => t.id === activeId) ?? null)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!manageLists || !over) return;
    const activeData = active.data.current as CardDragData | undefined;
    if (!activeData) return;
    const overData = over.data.current as
      | CardDragData
      | ColumnDragData
      | undefined;
    const destStatus = overData?.status ?? activeData.status;
    const destSiblings = tasks
      .filter((t) => t.status === destStatus && t.id !== active.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    let index = destSiblings.length;
    if (overData?.type === "card") {
      const overIndex = destSiblings.findIndex((t) => t.id === over.id);
      if (overIndex >= 0) index = overIndex;
    }
    onMove(String(active.id), destStatus, index);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid gap-3 md:grid-cols-3">
        {columns.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasks
              .filter((t) => t.status === status)
              .sort((a, b) => a.sort_order - b.sort_order)}
            manageLists={manageLists}
            onEdit={onEdit}
            activeId={activeId}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <KanbanCardFace task={activeTask} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  tasks,
  manageLists,
  onEdit,
  activeId,
}: {
  status: TaskStatus;
  tasks: Task[];
  manageLists: boolean;
  onEdit?: (task: Task) => void;
  activeId: string | null;
}) {
  const { setNodeRef } = useDroppable({
    id: `col-${status}`,
    data: { type: "column", status } satisfies ColumnDragData,
  });
  const tone = statusCardTone(status);

  return (
    <div
      ref={setNodeRef}
      className="min-h-24 rounded-md border border-[var(--divider)] bg-[var(--bg-elevated)]/40 p-2"
    >
      <h4
        className={cn(
          "mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold",
          status === "complete"
            ? "text-[var(--task-complete-fg)]"
            : status === "active"
              ? "text-[var(--task-active-fg)]"
              : "text-[var(--task-upcoming-fg)]",
        )}
      >
        <span className={cn("h-2 w-2 rounded-sm", tone.bar)} aria-hidden />
        {taskStatusLabel(status)}
      </h4>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
        disabled={!manageLists}
      >
        {tasks.length === 0 ? (
          <div className="min-h-8" aria-hidden />
        ) : (
          tasks.map((t) => (
            <KanbanCard
              key={t.id}
              task={t}
              manageLists={manageLists}
              onEdit={onEdit}
              isOverlaySource={activeId === t.id}
            />
          ))
        )}
      </SortableContext>
    </div>
  );
}

function KanbanCardFace({
  task,
  dragging = false,
  onEdit,
}: {
  task: Task;
  dragging?: boolean;
  onEdit?: (task: Task) => void;
}) {
  const tone = statusCardTone(task.status);
  const title = (
    <span
      className={cn(
        "block w-full text-left",
        task.status === "complete" &&
          "text-[var(--task-complete-fg)] line-through",
      )}
    >
      {task.title}
    </span>
  );

  return (
    <div
      className={cn(
        "relative mb-1.5 overflow-hidden rounded-md border p-2 pl-3 text-sm shadow-sm",
        tone.shell,
        dragging && "mb-0 cursor-grabbing shadow-lg ring-1 ring-[var(--border)]",
      )}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1", tone.bar)}
        aria-hidden
      />
      {onEdit ? (
        <button
          type="button"
          className="block w-full cursor-pointer text-left"
          onClick={() => onEdit(task)}
        >
          {title}
        </button>
      ) : (
        title
      )}
      {task.due_date ? (
        <div className="mt-1 text-[10px] text-[var(--text-muted)]">
          {format(parseISO(task.due_date), "MMM d, yyyy")}
        </div>
      ) : null}
    </div>
  );
}

function KanbanCard({
  task,
  manageLists,
  onEdit,
  isOverlaySource,
}: {
  task: Task;
  manageLists: boolean;
  onEdit?: (task: Task) => void;
  isOverlaySource: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "card", status: task.status } satisfies CardDragData,
      disabled: !manageLists,
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging || isOverlaySource ? 0.35 : 1,
      }}
      className={cn(manageLists && "cursor-grab touch-none")}
      {...attributes}
      {...listeners}
    >
      <KanbanCardFace task={task} onEdit={onEdit} />
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
  const { canManage, myPerson, upsertTask, deleteTask, state } = useData();
  const [draft, setDraft] = useState(task);

  const canSave = canManage || (!readOnly && draft.assignee_person_id === myPerson?.id);

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
            <DateInput
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
            <DateInput
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
            <div className="text-sm text-[var(--text-muted)]">No notes</div>
          )}
        </Field>

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
