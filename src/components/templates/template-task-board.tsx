"use client";

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
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import type { TemplateTask, TemplateTaskList } from "@/lib/types";

const INDENT_DRAG_PX = 28;

type ListDragData = { type: "list" };
type TaskDragData = {
  type: "task";
  listId: string;
  parentId: string | null;
};
type ListDropData = { type: "list-drop"; listId: string };

function sortByOrder<T extends { sort_order: number; id: string }>(items: T[]) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

function notesHasContent(notes: string) {
  return Boolean(notes?.replace(/<[^>]+>/g, "").trim());
}

export function TemplateTaskBoard({ templateId }: { templateId: string }) {
  const {
    state,
    newId,
    upsertTemplateTaskList,
    deleteTemplateTaskList,
    upsertTemplateTask,
    deleteTemplateTask,
  } = useData();

  const allLists = useMemo(
    () =>
      sortByOrder(
        state.template_task_lists.filter((l) => l.template_id === templateId),
      ),
    [state.template_task_lists, templateId],
  );

  const allTasks = useMemo(
    () => state.template_tasks.filter((t) => t.template_id === templateId),
    [state.template_tasks, templateId],
  );

  const milestoneById = useMemo(() => {
    const map = new Map(
      state.template_milestones
        .filter((m) => m.template_id === templateId)
        .map((m) => [m.id, m.name] as const),
    );
    return map;
  }, [state.template_milestones, templateId]);

  const childrenMap = useMemo(() => {
    const map = new Map<string, TemplateTask[]>();
    for (const t of allTasks) {
      if (!t.parent_id) continue;
      const arr = map.get(t.parent_id) ?? [];
      arr.push(t);
      map.set(t.parent_id, arr);
    }
    for (const arr of map.values()) sortByOrder(arr);
    return map;
  }, [allTasks]);

  const [listsEditMode, setListsEditMode] = useState(false);
  const [collapsedLists, setCollapsedLists] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<TemplateTask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function addList() {
    const list: TemplateTaskList = {
      id: newId("ttlist"),
      organization_id: state.organization.id,
      template_id: templateId,
      template_milestone_id: null,
      name: "New List",
      sort_order: allLists.length,
    };
    upsertTemplateTaskList(list);
  }

  function addTask(listId: string, parentId: string | null = null) {
    const siblings = allTasks.filter(
      (t) => t.list_id === listId && t.parent_id === parentId,
    );
    const task: TemplateTask = {
      id: newId("ttask"),
      organization_id: state.organization.id,
      template_id: templateId,
      list_id: listId,
      parent_id: parentId,
      title: parentId ? "New Subtask" : "New Task",
      notes: "",
      offset_days: null,
      sort_order: siblings.length,
    };
    upsertTemplateTask(task);
    setEditingTask(task);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    if (!over) return;

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
        if (l.sort_order !== i) upsertTemplateTaskList({ ...l, sort_order: i });
      });
      return;
    }

    if (activeData.type !== "task") return;
    const task = allTasks.find((t) => t.id === active.id);
    if (!task) return;

    const childTasks = sortByOrder(
      allTasks.filter((t) => t.parent_id === task.id),
    );

    const primarilyHorizontal =
      Math.abs(delta.x) >= INDENT_DRAG_PX &&
      Math.abs(delta.x) >= Math.abs(delta.y) * 0.75;

    if (primarilyHorizontal) {
      if (delta.x > 0) {
        if (task.parent_id || childTasks.length > 0) return;
        const parents = sortByOrder(
          allTasks.filter((t) => t.list_id === task.list_id && !t.parent_id),
        );
        const idx = parents.findIndex((p) => p.id === task.id);
        if (idx <= 0) return;
        const newParent = parents[idx - 1]!;
        const existingKids = sortByOrder(
          allTasks.filter((t) => t.parent_id === newParent.id),
        );
        upsertTemplateTask({
          ...task,
          parent_id: newParent.id,
          sort_order: existingKids.length,
        });
        parents
          .filter((p) => p.id !== task.id)
          .forEach((p, i) => {
            if (p.sort_order !== i) upsertTemplateTask({ ...p, sort_order: i });
          });
      } else {
        if (!task.parent_id) return;
        const parent = allTasks.find((t) => t.id === task.parent_id);
        if (!parent) return;
        const parents = sortByOrder(
          allTasks.filter((t) => t.list_id === task.list_id && !t.parent_id),
        );
        const parentIdx = parents.findIndex((p) => p.id === parent.id);
        const insertAt = parentIdx < 0 ? parents.length : parentIdx + 1;
        const nextParents = [...parents];
        nextParents.splice(insertAt, 0, task);
        nextParents.forEach((p, i) => {
          upsertTemplateTask({
            ...p,
            list_id: task.list_id,
            parent_id: null,
            sort_order: i,
          });
        });
        sortByOrder(
          allTasks.filter((t) => t.parent_id === parent.id && t.id !== task.id),
        ).forEach((t, i) => {
          if (t.sort_order !== i) upsertTemplateTask({ ...t, sort_order: i });
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
      insertIndex = allTasks.filter(
        (t) => t.list_id === destListId && !t.parent_id && t.id !== task.id,
      ).length;
    } else if (overData.type === "task") {
      const overTask = allTasks.find((t) => t.id === over.id);
      if (!overTask) return;
      destListId = overTask.list_id;
      destParentId = overTask.parent_id;
      const destSiblings = sortByOrder(
        allTasks.filter(
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

    const oldListId = task.list_id;
    const oldParentId = task.parent_id;

    if (oldListId === destListId && oldParentId === destParentId) {
      const scope = sortByOrder(
        allTasks.filter(
          (t) => t.list_id === destListId && t.parent_id === destParentId,
        ),
      );
      const oldIndex = scope.findIndex((t) => t.id === task.id);
      if (oldIndex < 0) return;
      const reordered = arrayMove(scope, oldIndex, insertIndex);
      reordered.forEach((t, i) => {
        if (t.sort_order !== i) upsertTemplateTask({ ...t, sort_order: i });
      });
      return;
    }

    const destSiblings = sortByOrder(
      allTasks.filter(
        (t) =>
          t.list_id === destListId &&
          t.parent_id === destParentId &&
          t.id !== task.id,
      ),
    );
    destSiblings.splice(Math.min(insertIndex, destSiblings.length), 0, task);
    destSiblings.forEach((t, i) => {
      upsertTemplateTask({
        ...t,
        list_id: destListId,
        parent_id: destParentId,
        sort_order: i,
      });
    });

    sortByOrder(
      allTasks.filter(
        (t) =>
          t.list_id === oldListId &&
          t.parent_id === oldParentId &&
          t.id !== task.id,
      ),
    ).forEach((t, i) => {
      if (t.sort_order !== i) upsertTemplateTask({ ...t, sort_order: i });
    });

    for (const child of childTasks) {
      if (child.list_id !== destListId) {
        upsertTemplateTask({ ...child, list_id: destListId });
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Tasks</h3>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--row-hover)]"
            onClick={addList}
          >
            <Plus size={12} strokeWidth={1.75} /> List
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
            <Pencil size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {allLists.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No task lists yet — add a list to get started.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={allLists.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
          >
            {allLists.map((list) => {
              const listTasks = allTasks.filter((t) => t.list_id === list.id);
              const parents = sortByOrder(
                listTasks.filter((t) => !t.parent_id),
              );
              const collapsed = collapsedLists.has(list.id);
              const milestoneName = list.template_milestone_id
                ? (milestoneById.get(list.template_milestone_id) ?? null)
                : null;
              return (
                <ListSection
                  key={list.id}
                  list={list}
                  parents={parents}
                  childrenMap={childrenMap}
                  collapsed={collapsed}
                  listsEditMode={listsEditMode}
                  milestoneName={milestoneName}
                  milestones={[...milestoneById.entries()].map(([id, name]) => ({
                    id,
                    name,
                  }))}
                  onToggleCollapse={() =>
                    setCollapsedLists((prev) => {
                      const next = new Set(prev);
                      if (next.has(list.id)) next.delete(list.id);
                      else next.add(list.id);
                      return next;
                    })
                  }
                  onNameChange={(name) =>
                    upsertTemplateTaskList({ ...list, name })
                  }
                  onMilestoneChange={(milestoneId) =>
                    upsertTemplateTaskList({
                      ...list,
                      template_milestone_id: milestoneId,
                    })
                  }
                  onAddTask={() => addTask(list.id)}
                  onAddSubtask={(parentId) => addTask(list.id, parentId)}
                  onEditTask={setEditingTask}
                  onDelete={() => {
                    if (
                      !window.confirm(
                        `Delete list "${list.name}" and its tasks?`,
                      )
                    ) {
                      return;
                    }
                    for (const t of listTasks) deleteTemplateTask(t.id);
                    deleteTemplateTaskList(list.id);
                  }}
                />
              );
            })}
          </SortableContext>
        </DndContext>
      )}

      {editingTask ? (
        <Modal
          title={editingTask.parent_id ? "Edit Subtask" : "Edit Task"}
          onClose={() => setEditingTask(null)}
        >
          <div className="grid gap-3">
            <Field label="Title">
              <input
                className={inputClass}
                value={editingTask.title}
                onChange={(e) =>
                  setEditingTask({ ...editingTask, title: e.target.value })
                }
                autoFocus
              />
            </Field>
            <Field label="Notes">
              <textarea
                className={`${inputClass} h-24 py-2`}
                value={editingTask.notes}
                onChange={(e) =>
                  setEditingTask({ ...editingTask, notes: e.target.value })
                }
              />
            </Field>
            <p className="text-xs text-[var(--text-muted)]">
              Assignees, dates, and status are not stored on templates.
            </p>
            <div className="flex justify-between pt-2">
              <Button
                variant="destructiveOutline"
                size="sm"
                onClick={() => {
                  deleteTemplateTask(editingTask.id);
                  setEditingTask(null);
                }}
              >
                <Trash2 size={14} strokeWidth={1.75} /> Delete
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setEditingTask(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    if (!editingTask.title.trim()) return;
                    upsertTemplateTask({
                      ...editingTask,
                      title: editingTask.title.trim(),
                    });
                    setEditingTask(null);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function ListSection({
  list,
  parents,
  childrenMap,
  collapsed,
  listsEditMode,
  milestoneName,
  milestones,
  onToggleCollapse,
  onNameChange,
  onMilestoneChange,
  onAddTask,
  onAddSubtask,
  onEditTask,
  onDelete,
}: {
  list: TemplateTaskList;
  parents: TemplateTask[];
  childrenMap: Map<string, TemplateTask[]>;
  collapsed: boolean;
  listsEditMode: boolean;
  milestoneName: string | null;
  milestones: { id: string; name: string }[];
  onToggleCollapse: () => void;
  onNameChange: (name: string) => void;
  onMilestoneChange: (milestoneId: string | null) => void;
  onAddTask: () => void;
  onAddSubtask: (parentId: string) => void;
  onEditTask: (task: TemplateTask) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: list.id,
      data: { type: "list" } satisfies ListDragData,
    });

  return (
    <section
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="mb-3 overflow-hidden rounded-md border border-[var(--divider)]"
    >
      <div
        ref={setNodeRef}
        className="flex flex-wrap items-center gap-2 border-b border-[var(--divider)] bg-[var(--bg-elevated)]/50 px-2 py-1.5"
      >
        <button
          type="button"
          className="cursor-grab touch-none text-[var(--text-muted)]"
          aria-label="Drag list to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="cursor-pointer text-[var(--text-muted)]"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand list" : "Collapse list"}
        >
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={1.75} />
          ) : (
            <ChevronDown size={14} strokeWidth={1.75} />
          )}
        </button>
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium outline-none"
          value={list.name}
          onChange={(e) => onNameChange(e.target.value)}
          aria-label="List name"
        />
        {listsEditMode ? (
          <select
            className="h-7 max-w-[9rem] rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 text-[10px] text-[var(--text-muted)]"
            value={list.template_milestone_id ?? ""}
            onChange={(e) =>
              onMilestoneChange(e.target.value ? e.target.value : null)
            }
            aria-label="Assign list to milestone"
            title="Assign to milestone"
          >
            <option value="">No milestone</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        ) : milestoneName ? (
          <span className="text-[10px] text-[var(--text-muted)]">
            {milestoneName}
          </span>
        ) : null}
        {listsEditMode ? (
          <button
            type="button"
            className="inline-flex cursor-pointer rounded p-1 text-[var(--status-over)] hover:bg-[var(--row-hover)]"
            onClick={onDelete}
            aria-label={`Delete list ${list.name}`}
            title="Delete list"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      {!collapsed ? (
        <>
          {parents.length === 0 ? (
            <ListTaskDropZone listId={list.id}>
              <div className="h-2" aria-hidden />
            </ListTaskDropZone>
          ) : (
            <SortableContext
              items={parents.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {parents.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  depth={0}
                  kids={childrenMap.get(t.id) ?? []}
                  onEdit={onEditTask}
                  onAddSubtask={() => onAddSubtask(t.id)}
                />
              ))}
            </SortableContext>
          )}
          <ListTaskDropZone listId={list.id}>
            <div className="px-2 py-1.5 text-left">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                onClick={onAddTask}
              >
                <Plus size={12} strokeWidth={1.75} /> Add task
              </button>
            </div>
          </ListTaskDropZone>
        </>
      ) : null}
    </section>
  );
}

function ListTaskDropZone({
  listId,
  children,
}: {
  listId: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `list-drop:${listId}`,
    data: { type: "list-drop", listId } satisfies ListDropData,
  });
  return (
    <div ref={setNodeRef} className={cn(isOver && "bg-[var(--accent)]/10")}>
      {children}
    </div>
  );
}

function TaskRow({
  task,
  depth,
  kids,
  onEdit,
  onAddSubtask,
}: {
  task: TemplateTask;
  depth: number;
  kids: TemplateTask[];
  onEdit: (task: TemplateTask) => void;
  onAddSubtask: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: {
        type: "task",
        listId: task.list_id,
        parentId: task.parent_id,
      } satisfies TaskDragData,
    });

  const hasNotes = notesHasContent(task.notes);

  return (
    <div
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <div
        ref={setNodeRef}
        className="group flex items-center gap-1.5 border-b border-[var(--divider)] px-2 py-1.5 text-sm"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <button
          type="button"
          className="cursor-grab touch-none p-0.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100"
          aria-label="Drag to reorder, nest, or move to another list"
          title="Drag vertically to reorder or move lists. Drag right to nest, left to un-nest."
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} strokeWidth={1.75} />
        </button>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[var(--text-muted)]/35"
          title="Status is set after apply"
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            className="min-w-0 cursor-pointer truncate text-left hover:underline"
            onClick={() => onEdit(task)}
          >
            {task.title || "Untitled"}
          </button>
          {hasNotes ? (
            <StickyNote
              size={12}
              strokeWidth={1.75}
              className="shrink-0 text-[var(--text-muted)]"
            />
          ) : null}
        </div>
        {depth === 0 ? (
          <button
            type="button"
            className="inline-flex cursor-pointer rounded p-0.5 text-[var(--text-muted)] opacity-0 hover:bg-[var(--row-hover)] hover:text-[var(--text)] group-hover:opacity-100"
            onClick={onAddSubtask}
            aria-label="Add subtask"
            title="Add subtask"
          >
            <Plus size={14} strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      {depth === 0 && kids.length > 0 ? (
        <SortableContext
          items={sortByOrder(kids).map((k) => k.id)}
          strategy={verticalListSortingStrategy}
        >
          {sortByOrder(kids).map((c) => (
            <TaskRow
              key={c.id}
              task={c}
              depth={1}
              kids={[]}
              onEdit={onEdit}
              onAddSubtask={() => {}}
            />
          ))}
        </SortableContext>
      ) : null}
    </div>
  );
}
