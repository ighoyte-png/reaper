"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
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
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  MessageSquare,
  Plus,
  StickyNote,
  X,
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
  filterTasksForViewer,
  parentTasks,
  sortTaskLists,
  taskStatusLabel,
  tasksForList,
} from "@/lib/domain/tasks";
import { format, startOfDay } from "date-fns";
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
};

const ROW_BG: Record<TaskStatus, string> = {
  upcoming: "var(--task-upcoming-bg)",
  active: "var(--task-active-bg)",
  complete: "var(--task-complete-bg)",
};

function todayKey() {
  return format(startOfDay(new Date()), "yyyy-MM-dd");
}

function initialsFor(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function InitialsAvatar({ person }: { person: Person }) {
  return (
    <span
      title={person.name}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[9px] font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)]"
    >
      {initialsFor(person.name)}
    </span>
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
  compact: boolean;
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  cycleStatus: (task: Task) => void;
  setEditing: (task: Task) => void;
  addSubtask: (listId: string, parentId: string) => void;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  childrenMap: Map<string, Task[]>;
  addComment: (taskId: string, html: string) => void;
  deleteComment: (id: string) => void;
};

type TaskDragData = { type: "task"; listId: string; parentId: string | null };
type ListDragData = { type: "list" };

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
    profile,
    upsertTask,
    upsertTaskList,
    upsertTaskComment,
    deleteTaskComment,
    deleteTask,
    deleteTaskList,
    newId,
  } = useData();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Task | null>(null);
  const [view, setView] = useState<"list" | "card">("list");
  const [collapsedLists, setCollapsedLists] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const manageLists = canManage && !readOnly;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  function toggleExpand(id: string) {
    setExpanded((prev) => {
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

  function setListColor(list: TaskList, color: string | null) {
    if (!manageLists) return;
    upsertTaskList({ ...list, color });
  }

  function addComment(taskId: string, html: string) {
    if (!profile) return;
    upsertTaskComment({
      id: newId("tcom"),
      organization_id: state.organization.id,
      task_id: taskId,
      author_profile_id: profile.id,
      body: html,
      created_at: new Date().toISOString(),
    });
  }

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
    const { active, over } = event;
    if (!manageLists || !over || active.id === over.id) return;
    const activeData = active.data.current as
      | ListDragData
      | TaskDragData
      | undefined;
    const overData = over.data.current as ListDragData | TaskDragData | undefined;
    if (!activeData || !overData) return;

    if (activeData.type === "list" && overData.type === "list") {
      const oldIndex = allLists.findIndex((l) => l.id === active.id);
      const newIndex = allLists.findIndex((l) => l.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(allLists, oldIndex, newIndex);
      reordered.forEach((l, i) => {
        if (l.sort_order !== i) upsertTaskList({ ...l, sort_order: i });
      });
      return;
    }

    if (activeData.type === "task" && overData.type === "task") {
      if (
        activeData.listId !== overData.listId ||
        activeData.parentId !== overData.parentId
      ) {
        return;
      }
      const scope = visibleTasks
        .filter(
          (t) =>
            t.list_id === activeData.listId && t.parent_id === activeData.parentId,
        )
        .sort((a, b) => a.sort_order - b.sort_order);
      const oldIndex = scope.findIndex((t) => t.id === active.id);
      const newIndex = scope.findIndex((t) => t.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(scope, oldIndex, newIndex);
      reordered.forEach((t, i) => {
        if (t.sort_order !== i) upsertTask({ ...t, sort_order: i });
      });
    }
  }

  const ctx: BoardCtx = {
    people: state.people,
    profiles: state.profiles,
    comments: state.task_comments,
    profileId: profile?.id ?? null,
    canManage,
    myPersonId: myPerson?.id ?? null,
    manageLists,
    allowSelect: canManage || !readOnly,
    compact,
    selected,
    toggleSelect,
    cycleStatus,
    setEditing,
    addSubtask: (listId, parentId) => addTask(listId, parentId),
    expanded,
    toggleExpand,
    childrenMap,
    addComment,
    deleteComment: deleteTaskComment,
  };

  if (view === "card" && allowCardView) {
    return (
      <div className="space-y-3">
        <ViewToggle view={view} setView={setView} allowCardView={allowCardView} />
        <KanbanBoard
          tasks={parentTasks(visibleTasks)}
          manageLists={manageLists}
          onEdit={setEditing}
          onMove={moveTaskToColumn}
        />
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
                  onColorChange={(color) => setListColor(list, color)}
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

function ListSection({
  list,
  parents,
  ctx,
  collapsed,
  onToggleCollapse,
  milestoneName,
  onNameChange,
  onColorChange,
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
  onColorChange: (color: string | null) => void;
  onAddTask: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: list.id,
      data: { type: "list" } satisfies ListDragData,
      disabled: !ctx.manageLists,
    });

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="mb-3 overflow-hidden rounded-md border border-[var(--border)]"
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-2 py-1.5",
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
        {ctx.manageLists ? (
          <>
            <input
              type="color"
              title="List color"
              aria-label="List header color"
              value={list.color ?? "#e5e7eb"}
              className="h-6 w-6 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
              onChange={(e) => onColorChange(e.target.value)}
            />
            {list.color ? (
              <button
                type="button"
                title="Clear color"
                aria-label="Clear list color"
                className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]"
                onClick={() => onColorChange(null)}
              >
                <X size={12} />
              </button>
            ) : null}
            <button
              type="button"
              className="cursor-pointer text-xs text-[var(--accent)] hover:underline"
              onClick={onAddTask}
            >
              Add task
            </button>
            <button
              type="button"
              className="cursor-pointer text-xs text-[var(--status-over)]"
              onClick={onDelete}
            >
              Delete
            </button>
          </>
        ) : null}
      </div>
      {!collapsed ? (
        parents.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Empty list</p>
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
        )
      ) : null}
    </section>
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
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <div
        className={cn(
          "group flex items-center gap-1.5 border-b border-[var(--border)]/60 px-2 py-1.5 text-sm",
          task.status === "complete" && "text-[var(--text-muted)] opacity-80",
          isSelected && "ring-1 ring-inset ring-[var(--accent)]/50",
        )}
        style={{ paddingLeft: 8 + depth * 16, backgroundColor: ROW_BG[task.status] }}
      >
        {ctx.manageLists ? (
          <button
            type="button"
            className="cursor-grab touch-none p-0.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>
        ) : (
          <span className="w-4" />
        )}
        {ctx.allowSelect ? (
          <input
            type="checkbox"
            className="cursor-pointer"
            checked={isSelected}
            onChange={() => ctx.toggleSelect(task.id)}
            aria-label={`Select ${task.title}`}
          />
        ) : null}
        <button
          type="button"
          className={cn(
            "inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border",
            task.status === "complete"
              ? "border-[var(--status-healthy)] bg-[var(--status-healthy)]/20 text-[var(--status-healthy)]"
              : task.status === "active"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)]",
            !canEditStatus && "cursor-not-allowed opacity-60",
          )}
          title={taskStatusLabel(task.status)}
          onClick={() => ctx.cycleStatus(task)}
        >
          {task.status === "complete" ? <Check size={12} /> : null}
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer truncate text-left hover:underline"
          onClick={() => ctx.setEditing(task)}
        >
          {task.title}
        </button>
        {!ctx.compact && assignee ? <InitialsAvatar person={assignee} /> : null}
        {hasNotes ? (
          <StickyNote size={12} className="shrink-0 text-[var(--text-muted)]" />
        ) : null}
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
          <MessageSquare size={11} />
          {taskComments.length > 0 ? taskComments.length : null}
          {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>
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
        {ctx.manageLists && depth === 0 ? (
          <button
            type="button"
            className="cursor-pointer text-xs text-[var(--text-muted)] opacity-0 hover:text-[var(--text)] group-hover:opacity-100"
            onClick={() => ctx.addSubtask(task.list_id, task.id)}
          >
            + sub
          </button>
        ) : null}
      </div>
      {isExpanded ? <CommentThread task={task} depth={depth} comments={taskComments} ctx={ctx} /> : null}
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
      className="space-y-2 border-b border-[var(--border)]/60 bg-[var(--bg-elevated)]/30 px-2 py-2"
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
            placeholder="Add a comment…"
          />
          <button
            type="button"
            className="h-7 cursor-pointer rounded-md border border-[var(--border)] px-3 text-xs hover:bg-[var(--row-hover)]"
            onClick={() => {
              if (!notesHasContent(draft)) return;
              ctx.addComment(task.id, draft);
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

function KanbanBoard({
  tasks,
  manageLists,
  onEdit,
  onMove,
}: {
  tasks: Task[];
  manageLists: boolean;
  onEdit: (task: Task) => void;
  onMove: (taskId: string, destStatus: TaskStatus, destIndex: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const columns: TaskStatus[] = ["upcoming", "active", "complete"];

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!manageLists || !over) return;
    const activeData = active.data.current as CardDragData | undefined;
    if (!activeData) return;
    const overData = over.data.current as CardDragData | ColumnDragData | undefined;
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
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
          />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  tasks,
  manageLists,
  onEdit,
}: {
  status: TaskStatus;
  tasks: Task[];
  manageLists: boolean;
  onEdit: (task: Task) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `col-${status}`,
    data: { type: "column", status } satisfies ColumnDragData,
  });

  return (
    <div
      ref={setNodeRef}
      className="min-h-24 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-2"
    >
      <h4 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {taskStatusLabel(status)}
      </h4>
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
        disabled={!manageLists}
      >
        {tasks.length === 0 ? (
          <p className="px-1 py-2 text-xs text-[var(--text-muted)]">No tasks</p>
        ) : (
          tasks.map((t) => (
            <KanbanCard key={t.id} task={t} manageLists={manageLists} onEdit={onEdit} />
          ))
        )}
      </SortableContext>
    </div>
  );
}

function KanbanCard({
  task,
  manageLists,
  onEdit,
}: {
  task: Task;
  manageLists: boolean;
  onEdit: (task: Task) => void;
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
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: ROW_BG[task.status],
      }}
      className={cn(
        "mb-1.5 touch-none rounded-md border border-[var(--border)] p-2 text-sm",
        manageLists && "cursor-grab",
      )}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        className={cn(
          "block w-full cursor-pointer text-left",
          task.status === "complete" && "text-[var(--text-muted)]",
        )}
        onClick={() => onEdit(task)}
      >
        {task.title}
      </button>
      {task.due_date ? (
        <div className="mt-1 text-[10px] text-[var(--text-muted)]">{task.due_date}</div>
      ) : null}
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
