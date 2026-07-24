"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
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
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  GripVertical,
  MessageSquare,
  Pencil,
  Plus,
  Reply,
  SmilePlus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { ConfirmDialog, inputClass, DateInput } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";
import { PersonAvatar } from "@/components/people/person-avatar";
import {
  RichNotesHtml,
  SimpleRichTextEditor,
} from "@/components/ui/simple-rich-text";
import { useData } from "@/lib/data/store";
import { useProjectHref } from "@/lib/hooks/use-app-href";
import { useViewAsOptional } from "@/lib/view-as";
import { notesHasContent, notesPreviewText } from "@/lib/notes-html";
import { extractMentionPersonIds } from "@/lib/mentions";
import { cn } from "@/lib/cn";
import { projectTeamPersonIds } from "@/lib/domain/project-access";
import {
  dueDateToneClass,
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

type InlineTaskDraft = {
  title: string;
  assignee_person_id: string | null;
  start_date: string | null;
  due_date: string | null;
  notes: string;
};

type Props = {
  projectId: string;
  /** When true, no create/reorder/edit - status toggle still allowed for own tasks. */
  readOnly?: boolean;
  /** Compact for sidebar. */
  compact?: boolean;
  /** Show list/card toggle (Phase 8). */
  allowCardView?: boolean;
  /** When false, hide row/list selection checkboxes and bulk bar. */
  allowSelect?: boolean;
  /** Deep-link: scroll to this task, highlight it, and expand notes/comments. */
  focusTaskId?: string | null;
  /**
   * Rendered between active lists and the Archive section (e.g. Templates).
   * Lets the project page keep Templates above Archive while both sit under Tasks.
   */
  templatesSlot?: ReactNode;
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
  /** Hide edit/drag/comments (e.g. schedule sidebar). */
  readOnly: boolean;
  /** Click status chip to cycle upcoming → active → complete. */
  allowStatusEdit: boolean;
  /**
   * When set (schedule sidebar / compact), task titles link to the project hub
   * with ?task= for highlight scroll — same deep-link as the dashboard.
   */
  hubTaskHref: ((taskId: string) => string) | null;
  /** Deep-link target from ?task= — slight blue highlight. */
  focusTaskId: string | null;
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  setParentsSelected: (ids: string[], on: boolean) => void;
  cycleStatus: (task: Task) => void;
  editingTaskId: string | null;
  setEditingTask: (task: Task | null) => void;
  saveEditingTask: (taskId: string, draft: InlineTaskDraft) => void;
  deleteEditingTask: (taskId: string) => void;
  addSubtask: (listId: string, parentId: string) => void;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  childrenMap: Map<string, Task[]>;
  addComment: (taskId: string, html: string, mentionedPersonIds: string[]) => void;
  editComment: (
    comment: TaskComment,
    html: string,
    mentionedPersonIds: string[],
  ) => void;
  deleteComment: (id: string) => void;
  toggleReaction: (commentId: string, emoji: string) => void;
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
  templatesSlot,
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
    toggleTaskCommentReaction,
    deleteTask,
    deleteTaskList,
    newId,
  } = useData();
  const projectHref = useProjectHref();
  const project = state.projects.find((p) => p.id === projectId);
  const viewAs = useViewAsOptional();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDraft, setBulkDraft] = useState<{
    status?: TaskStatus;
    /** undefined = unchanged; null = unassigned */
    assigneeId?: string | null;
    /** undefined = unchanged */
    dueDate?: string;
  }>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftingListId, setDraftingListId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmDeleteList, setConfirmDeleteList] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [view, setView] = useState<"list" | "card">("list");
  const [collapsedLists, setCollapsedLists] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [listsEditMode, setListsEditMode] = useState(false);
  const [archiveExpanded, setArchiveExpanded] = useState(false);

  const viewerCanManage = viewAs ? viewAs.effectiveCanManage : canManage;
  const viewerPersonId =
    viewAs?.effectivePersonId ?? myPerson?.id ?? null;

  const manageLists = viewerCanManage && !readOnly && !isPublicShare;
  const allowSelect =
    allowSelectProp !== undefined
      ? allowSelectProp
      : !isPublicShare && (viewerCanManage || !readOnly);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allLists = useMemo(
    () =>
      sortTaskLists(state.task_lists.filter((l) => l.project_id === projectId)),
    [state.task_lists, projectId],
  );
  const activeLists = useMemo(
    () => allLists.filter((l) => !l.archived),
    [allLists],
  );
  const archivedLists = useMemo(
    () => allLists.filter((l) => l.archived),
    [allLists],
  );

  const visibleTasks = useMemo(() => {
    return state.tasks.filter((t) => t.project_id === projectId);
  }, [state.tasks, projectId]);

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

  function deleteSelectedTasks() {
    if (!manageLists || selected.size === 0) return;
    // Delete parents first so child cleanup in deleteTask doesn't fight
    // with explicit child deletes in the same selection.
    const selectedTasks = [...selected]
      .map((id) => state.tasks.find((t) => t.id === id))
      .filter((t): t is Task => Boolean(t));
    const parents = selectedTasks.filter((t) => !t.parent_id);
    const orphans = selectedTasks.filter(
      (t) => t.parent_id && !selected.has(t.parent_id),
    );
    for (const task of [...parents, ...orphans]) {
      deleteTask(task.id);
    }
    setConfirmBulkDelete(false);
    clearSelection();
  }

  useEffect(() => {
    if (selected.size === 0) {
      setBulkDraft({});
      setConfirmBulkDelete(false);
    }
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
        if (viewerCanManage || task.assignee_person_id === viewerPersonId) {
          next = { ...next, status: bulkDraft.status };
          changed = true;
        }
      }
      if (viewerCanManage && bulkDraft.assigneeId !== undefined) {
        next = { ...next, assignee_person_id: bulkDraft.assigneeId };
        changed = true;
      }
      if (viewerCanManage && bulkDraft.dueDate !== undefined) {
        next = { ...next, due_date: bulkDraft.dueDate || null };
        changed = true;
      }
      if (changed) upsertTask(next);
    }
    clearSelection();
  }

  function addList() {
    if (!manageLists) return;
    activeLists.forEach((l, i) => {
      const nextOrder = i + 1;
      if (l.sort_order !== nextOrder) {
        upsertTaskList({ ...l, sort_order: nextOrder });
      }
    });
    const list: TaskList = {
      id: newId("tlist"),
      organization_id: state.organization.id,
      project_id: projectId,
      milestone_id: null,
      name: "New list",
      color: null,
      sort_order: 0,
      archived: false,
    };
    upsertTaskList(list);
  }

  function addSubtask(listId: string, parentId: string) {
    if (!manageLists) return;
    const parent = visibleTasks.find((t) => t.id === parentId);
    const siblings = visibleTasks.filter(
      (t) => t.list_id === listId && t.parent_id === parentId,
    );
    const task: Task = {
      id: newId("task"),
      organization_id: state.organization.id,
      project_id: projectId,
      list_id: listId,
      parent_id: parentId,
      assignee_person_id: parent
        ? parent.assignee_person_id
        : (viewerPersonId ?? state.people[0]?.id ?? null),
      title: "New subtask",
      status: "upcoming",
      start_date: null,
      due_date: null,
      notes: "",
      sort_order: siblings.length,
    };
    upsertTask(task);
  }

  function createTaskFromDraft(listId: string, draft: InlineTaskDraft) {
    if (!manageLists) return;
    const title = draft.title.trim();
    if (!title) return;
    const siblings = visibleTasks.filter(
      (t) => t.list_id === listId && t.parent_id === null,
    );
    const task: Task = {
      id: newId("task"),
      organization_id: state.organization.id,
      project_id: projectId,
      list_id: listId,
      parent_id: null,
      assignee_person_id: draft.assignee_person_id,
      title,
      status: "upcoming",
      start_date: draft.start_date,
      due_date: draft.due_date,
      notes: draft.notes,
      sort_order: siblings.length,
    };
    upsertTask(task);
    setDraftingListId(null);
  }

  function setEditingTask(task: Task | null) {
    if (task) {
      setDraftingListId(null);
      setEditingTaskId(task.id);
      return;
    }
    setEditingTaskId(null);
  }

  function saveEditingTask(taskId: string, draft: InlineTaskDraft) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const title = draft.title.trim();
    if (!title) return;
    upsertTask({
      ...task,
      title,
      assignee_person_id: draft.assignee_person_id,
      start_date: draft.start_date,
      due_date: draft.due_date,
      notes: draft.notes,
    });
    setEditingTaskId(null);
  }

  function deleteEditingTask(taskId: string) {
    deleteTask(taskId);
    setEditingTaskId(null);
  }

  function cycleStatus(task: Task) {
    if (isPublicShare) return;
    // Schedule compact sidebar stays otherwise read-only; status cycling is allowed.
    if (readOnly && !compact) return;
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
      updated_at: null,
      mentioned_person_ids: [...new Set(mentionedPersonIds)],
      reactions: [],
    });
  }

  function editComment(
    comment: TaskComment,
    html: string,
    mentionedPersonIds: string[],
  ) {
    if (!profile) return;
    if (comment.author_profile_id !== profile.id) return;
    upsertTaskComment({
      ...comment,
      body: html,
      updated_at: new Date().toISOString(),
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
    if (!focusTaskId) return;
    const focused =
      visibleTasks.find((t) => t.id === focusTaskId) ??
      state.tasks.find(
        (t) => t.id === focusTaskId && t.project_id === projectId,
      );
    if (focused) {
      setCollapsedLists((prev) => {
        if (!prev.has(focused.list_id)) return prev;
        const next = new Set(prev);
        next.delete(focused.list_id);
        return next;
      });
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(focusTaskId);
      return next;
    });
    const t = window.setTimeout(() => {
      document
        .getElementById(`task-row-${focusTaskId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [focusTaskId, visibleTasks, state.tasks, projectId]);

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
      const oldIndex = activeLists.findIndex((l) => l.id === active.id);
      const newIndex = activeLists.findIndex((l) => l.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(activeLists, oldIndex, newIndex);
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
    canManage: viewerCanManage,
    myPersonId: viewerPersonId,
    manageLists,
    allowSelect,
    listsEditMode,
    compact,
    readOnly: readOnly || isPublicShare,
    allowStatusEdit: !isPublicShare && (!readOnly || compact),
    hubTaskHref:
      compact && project
        ? (taskId: string) => projectHref(project, `task=${taskId}`)
        : null,
    focusTaskId,
    selected,
    toggleSelect,
    setParentsSelected,
    cycleStatus,
    editingTaskId,
    setEditingTask,
    saveEditingTask,
    deleteEditingTask,
    addSubtask,
    expanded,
    toggleExpand,
    childrenMap,
    addComment,
    editComment,
    deleteComment: deleteTaskComment,
    toggleReaction: toggleTaskCommentReaction,
    mentionPeople,
  };

  if (view === "card" && allowCardView) {
    return (
      <section
        className={cn(
          !compact &&
            "rounded-md border border-[var(--border)] bg-[var(--bg)] p-4",
        )}
      >
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
          {activeLists.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No task lists yet.</p>
          ) : (
            activeLists.map((list) => {
              const listParents = parentTasks(
                visibleTasks.filter((t) => t.list_id === list.id),
              );
              return (
                <section
                  key={list.id}
                  className="overflow-hidden rounded-md border border-[var(--divider)]"
                >
                  <div
                    className={cn(
                      "border-b border-[var(--divider)] px-3 py-2.5",
                      !list.color && "bg-[var(--bg-elevated)]/50",
                    )}
                    style={
                      list.color ? { backgroundColor: list.color } : undefined
                    }
                  >
                    <h4 className="truncate text-lg font-medium">{list.name}</h4>
                  </div>
                  <div className="p-2 sm:p-3">
                    {listParents.length === 0 && !manageLists ? (
                      <p className="px-1 py-2 text-sm text-[var(--text-muted)]">
                        No tasks in this list yet.
                      </p>
                    ) : (
                      <KanbanBoard
                        tasks={listParents}
                        manageLists={manageLists}
                        people={state.people}
                        editingTaskId={
                          readOnly || isPublicShare ? null : editingTaskId
                        }
                        onEdit={
                          readOnly || isPublicShare
                            ? undefined
                            : setEditingTask
                        }
                        onSaveEdit={saveEditingTask}
                        onDeleteEdit={deleteEditingTask}
                        onCancelEdit={() => setEditingTaskId(null)}
                        onMove={moveTaskToColumn}
                      />
                    )}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </section>
    );
  }

  return (
    <>
    <section
      className={cn(
        !compact &&
          "rounded-md border border-[var(--border)] bg-[var(--bg)] p-4",
      )}
    >
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
            <Select
              className="mt-0 h-7 w-auto min-w-[7.5rem] py-0 text-xs"
              value={bulkDraft.status ?? ""}
              onChange={(value) => {
                setBulkDraft((prev) => ({
                  ...prev,
                  status: (value || undefined) as TaskStatus | undefined,
                }));
              }}
              aria-label="Set status for selected tasks"
              placeholder="Choose..."
              options={[
                { value: "", label: "Choose..." },
                {
                  value: "upcoming",
                  label: taskStatusLabel("upcoming"),
                },
                {
                  value: "active",
                  label: taskStatusLabel("active"),
                },
                {
                  value: "complete",
                  label: taskStatusLabel("complete"),
                },
              ]}
            />
          </label>
          {viewerCanManage ? (
            <>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium text-[var(--text-muted)]">
                  Assign
                </span>
                <Select
                  searchable
                  className="mt-0 h-7 w-auto max-w-[10rem] py-0 text-xs"
                  value={
                    bulkDraft.assigneeId === undefined
                      ? ""
                      : bulkDraft.assigneeId === null
                        ? "__none__"
                        : bulkDraft.assigneeId
                  }
                  onChange={(value) => {
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
                  placeholder="Choose..."
                  options={[
                    { value: "", label: "Choose..." },
                    { value: "__none__", label: "Unassigned" },
                    ...sortPeopleByName(state.people).map((p) => ({
                      value: p.id,
                      label: p.name,
                    })),
                  ]}
                />
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
              {manageLists ? (
                <button
                  type="button"
                  className="box-border h-9 cursor-pointer rounded-md border border-[var(--status-over)]/40 px-2.5 text-xs font-medium text-[var(--status-over)] hover:bg-[var(--row-hover)]"
                  onClick={() => setConfirmBulkDelete(true)}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeLists.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {manageLists
            ? "No task lists yet - add a list to get started."
            : "No task lists on this project yet."}
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleListDragEnd}
        >
          <SortableContext
            items={activeLists.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
            disabled={!manageLists}
          >
            {activeLists.map((list) => {
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
                  drafting={draftingListId === list.id}
                  onStartDraft={() => {
                    setEditingTaskId(null);
                    setDraftingListId(list.id);
                  }}
                  onCancelDraft={() => setDraftingListId(null)}
                  onCreateDraft={(draft) => createTaskFromDraft(list.id, draft)}
                  onArchive={() =>
                    upsertTaskList({ ...list, archived: true })
                  }
                  onUnarchive={() =>
                    upsertTaskList({ ...list, archived: false })
                  }
                  onDelete={() =>
                    setConfirmDeleteList({ id: list.id, name: list.name })
                  }
                />
              );
            })}
          </SortableContext>
        </DndContext>
      )}

    </div>
    </section>
      {templatesSlot}
      {!compact && (archivedLists.length > 0 || manageLists) ? (
        <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-1.5 text-left"
            onClick={() => setArchiveExpanded((v) => !v)}
            aria-expanded={archiveExpanded}
          >
            {archiveExpanded ? (
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
            <h2 className="text-sm font-semibold">
              Archive
              {archivedLists.length > 0 ? ` (${archivedLists.length})` : ""}
            </h2>
          </button>
          {archiveExpanded ? (
            <div className="mt-3 space-y-3">
              {archivedLists.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No archived lists.
                </p>
              ) : (
                archivedLists.map((list) => {
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
                      drafting={draftingListId === list.id}
                      onStartDraft={() => {
                        setEditingTaskId(null);
                        setDraftingListId(list.id);
                      }}
                      onCancelDraft={() => setDraftingListId(null)}
                      onCreateDraft={(draft) =>
                        createTaskFromDraft(list.id, draft)
                      }
                      onArchive={() =>
                        upsertTaskList({ ...list, archived: true })
                      }
                      onUnarchive={() =>
                        upsertTaskList({ ...list, archived: false })
                      }
                      onDelete={() =>
                        setConfirmDeleteList({ id: list.id, name: list.name })
                      }
                    />
                  );
                })
              )}
            </div>
          ) : null}
        </section>
      ) : null}
      {confirmDeleteList ? (
        <ConfirmDialog
          title="Delete list?"
          message={`Delete list "${confirmDeleteList.name}" and its tasks? This can't be undone.`}
          confirmLabel="Delete"
          onCancel={() => setConfirmDeleteList(null)}
          onConfirm={() => {
            const listTasks = tasksForList(
              visibleTasks,
              confirmDeleteList.id,
            );
            for (const t of listTasks) deleteTask(t.id);
            deleteTaskList(confirmDeleteList.id);
            setConfirmDeleteList(null);
          }}
        />
      ) : null}
      {confirmBulkDelete ? (
        <ConfirmDialog
          title="Delete selected tasks?"
          message={`Delete ${selected.size} selected task${selected.size === 1 ? "" : "s"}? Subtasks of selected parents will also be removed. This can't be undone.`}
          confirmLabel="Delete"
          onCancel={() => setConfirmBulkDelete(false)}
          onConfirm={deleteSelectedTasks}
        />
      ) : null}
    </>
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
  drafting,
  onStartDraft,
  onCancelDraft,
  onCreateDraft,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  list: TaskList;
  parents: Task[];
  ctx: BoardCtx;
  collapsed: boolean;
  onToggleCollapse: () => void;
  milestoneName: string | null;
  onNameChange: (name: string) => void;
  drafting: boolean;
  onStartDraft: () => void;
  onCancelDraft: () => void;
  onCreateDraft: (draft: InlineTaskDraft) => void;
  onArchive: () => void;
  onUnarchive: () => void;
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
          "flex flex-wrap items-center gap-2 border-b border-[var(--divider)] px-2 py-2.5",
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
            className="min-w-0 flex-1 border-0 bg-transparent text-lg font-medium outline-none"
            value={list.name}
            onChange={(e) => onNameChange(e.target.value)}
          />
        ) : (
          <span className="min-w-0 flex-1 text-lg font-medium">{list.name}</span>
        )}
        {milestoneName ? (
          <span className="text-[10px] text-[var(--text-muted)]">
            {milestoneName}
          </span>
        ) : null}
        {ctx.manageLists && ctx.listsEditMode ? (
          <div className="flex items-center gap-1">
            {list.archived ? (
              <button
                type="button"
                className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                onClick={onUnarchive}
                aria-label={`Unarchive list ${list.name}`}
                title="Unarchive list"
              >
                <ArchiveRestore size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                onClick={onArchive}
                aria-label={`Archive list ${list.name}`}
                title="Archive list"
              >
                <Archive size={14} />
              </button>
            )}
            <button
              type="button"
              className="inline-flex cursor-pointer rounded p-1 text-[var(--status-over)] hover:bg-[var(--row-hover)]"
              onClick={onDelete}
              aria-label={`Delete list ${list.name}`}
              title="Delete list"
            >
              <Trash2 size={14} />
            </button>
          </div>
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
      </div>
      {!collapsed ? (
        <>
          {parents.length === 0 ? (
            <ListTaskDropZone listId={list.id} disabled={!ctx.manageLists}>
              {!ctx.manageLists ? (
                <p className="px-3 py-3 text-sm text-[var(--text-muted)]">
                  No tasks in this list yet.
                </p>
              ) : (
                <div className="h-2" aria-hidden />
              )}
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
              {drafting ? (
                <InlineTaskForm
                  people={ctx.people}
                  status="upcoming"
                  submitLabel="Add task"
                  onCancel={onCancelDraft}
                  onSubmit={onCreateDraft}
                />
              ) : (
                <div className="px-2 py-1.5 text-left">
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                    onClick={onStartDraft}
                  >
                    <Plus size={12} /> Add task
                  </button>
                </div>
              )}
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

function InlineTaskForm({
  people,
  initial,
  status = "upcoming",
  submitLabel,
  onCancel,
  onSubmit,
  onDelete,
  depth = 0,
}: {
  people: Person[];
  initial?: InlineTaskDraft;
  status?: TaskStatus;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: InlineTaskDraft) => void;
  onDelete?: () => void;
  depth?: number;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [assigneeId, setAssigneeId] = useState(
    initial?.assignee_person_id ?? "",
  );
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({
      title: trimmed,
      assignee_person_id: assigneeId || null,
      start_date: startDate || null,
      due_date: dueDate || null,
      notes,
    });
  }

  const statusSquareClass =
    status === "complete"
      ? "bg-[var(--task-complete-fg)]"
      : status === "active"
        ? "bg-[var(--task-active-fg)]"
        : "bg-[var(--task-upcoming-fg)]";

  return (
    <div
      className={cn(
        "bg-[var(--bg)] px-2 py-3",
        onDelete ? "border-b border-[var(--divider)]" : "border-t border-[var(--divider)]",
      )}
      style={{ paddingLeft: 8 + depth * 16 }}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-4 shrink-0" aria-hidden />
        <span
          className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", statusSquareClass)}
          aria-hidden
        />
        <input
          autoFocus
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") onCancel();
          }}
        />
      </div>
      <div className="pl-[2.375rem]">
        <div className="my-3 border-t border-dashed border-[var(--divider)]" />
        <div className="space-y-3">
          <div className="grid gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-center sm:gap-3">
            <span className="text-sm text-[var(--text-muted)]">Assigned to</span>
            <Select
              searchable
              value={assigneeId}
              onChange={setAssigneeId}
              options={[
                { value: "", label: "Unassigned" },
                ...sortPeopleByName(people).map((p) => ({
                  value: p.id,
                  label: p.name,
                })),
              ]}
            />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-center sm:gap-3">
            <span className="text-sm text-[var(--text-muted)]">Dates</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0">
                <span className="mb-0.5 block text-[11px] text-[var(--text-muted)]">
                  Start
                </span>
                <DateInput
                  className={cn(inputClass, "mt-0 h-8")}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="min-w-0">
                <span className="mb-0.5 block text-[11px] text-[var(--text-muted)]">
                  End
                </span>
                <DateInput
                  className={cn(inputClass, "mt-0 h-8")}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </label>
            </div>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-start sm:gap-3">
            <span className="pt-1.5 text-sm text-[var(--text-muted)]">Notes</span>
            <SimpleRichTextEditor value={notes} onChange={setNotes} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!title.trim()}
            onClick={submit}
          >
            {submitLabel}
          </button>
          <button
            type="button"
            className="h-8 cursor-pointer rounded-md px-3 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
            onClick={onCancel}
          >
            Cancel
          </button>
          {onDelete ? (
            <button
              type="button"
              className="h-8 cursor-pointer rounded-md px-3 text-sm text-[var(--status-over)] hover:bg-[var(--row-hover)]"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
      {confirmDelete && onDelete ? (
        <ConfirmDialog
          title="Delete task?"
          message="Delete this task and its subtasks? This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete();
          }}
        />
      ) : null}
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
      disabled: !ctx.manageLists || ctx.editingTaskId === task.id,
    });

  const assignee = ctx.people.find((p) => p.id === task.assignee_person_id);
  const taskComments = ctx.comments.filter((c) => c.task_id === task.id);
  const hasNotes = notesHasContent(task.notes);
  const kids = depth === 0 ? ctx.childrenMap.get(task.id) ?? [] : [];
  const isExpanded = ctx.expanded.has(task.id);
  const isSelected = ctx.selected.has(task.id);
  const canEditStatus = ctx.allowStatusEdit;
  const isFocused = ctx.focusTaskId === task.id;
  const isEditing = ctx.editingTaskId === task.id;
  const nestIndent = depth * 16;
  const nestLineLeft =
    depth > 0
      ? 8 + (depth - 1) * 16 + 16 + 6 + 5 - 2 + 3 - 2 - nestIndent
      : 0;

  if (isEditing) {
    return (
      <div
        id={`task-row-${task.id}`}
        className="relative my-0.5 py-0.5"
        style={nestIndent ? { marginLeft: nestIndent } : undefined}
      >
        <InlineTaskForm
          people={ctx.people}
          status={task.status}
          depth={0}
          submitLabel="Save"
          initial={{
            title: task.title,
            assignee_person_id: task.assignee_person_id,
            start_date: task.start_date,
            due_date: task.due_date,
            notes: task.notes,
          }}
          onCancel={() => ctx.setEditingTask(null)}
          onSubmit={(draft) => ctx.saveEditingTask(task.id, draft)}
          onDelete={() => ctx.deleteEditingTask(task.id)}
        />
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

  return (
    <div
      id={`task-row-${task.id}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        ...(nestIndent ? { marginLeft: nestIndent } : {}),
      }}
      className={cn(
        "relative my-0.5 py-0.5",
        // Named group only on subtasks so parent hover doesn't clear nest lines.
        depth > 0 && "group/subtask",
      )}
    >
      {depth > 0 ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 -bottom-0.5 w-px bg-[var(--text-muted)]/25 transition-opacity",
            // Hover fill is translucent — hide only this subtask's segment under the highlight.
            (isFocused || isExpanded) && "opacity-0",
            "group-hover/subtask:opacity-0",
          )}
          style={{ left: nestLineLeft }}
        />
      ) : null}
      <div
        className={cn(
          "relative rounded-md py-0.5 transition-colors",
          isFocused
            ? "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/25"
            : isExpanded
              ? "bg-[var(--row-hover)]"
              : "hover:bg-[var(--row-hover)]",
        )}
      >
      {/* Measure only the row so parents with subtasks don't block top drops. */}
      <div
        ref={setNodeRef}
        className={cn(
          "group flex items-center gap-1.5 px-2 py-1 text-sm",
          task.status === "complete" && "text-[var(--task-complete-fg)]",
          isSelected && "bg-[var(--accent)]/10",
        )}
        style={{ paddingLeft: 8 }}
      >
        {ctx.manageLists ? (
          <button
            type="button"
            className={cn(
              "cursor-grab touch-none p-0.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100",
              depth > 0 && "-translate-x-2",
            )}
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
          disabled={!canEditStatus}
          onClick={() => {
            if (!canEditStatus) return;
            ctx.cycleStatus(task);
          }}
        />
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {ctx.hubTaskHref ? (
            <Link
              href={ctx.hubTaskHref(task.id)}
              className="min-w-0 truncate hover:underline"
            >
              <span
                className={cn(
                  task.status === "complete" && "line-through",
                )}
              >
                {task.title}
              </span>
            </Link>
          ) : ctx.readOnly ? (
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
              onClick={() => ctx.toggleExpand(task.id)}
            >
              {task.title}
            </button>
          )}
          {!ctx.compact && assignee ? <InitialsAvatar person={assignee} /> : null}
          {task.due_date ? (
            <span
              className={cn(
                "shrink-0 text-xs",
                dueDateToneClass(task.due_date, todayKey(), {
                  complete: task.status === "complete",
                }),
              )}
            >
              {format(parseISO(task.due_date), "MMM d, yyyy")}
            </span>
          ) : null}
          {hasNotes ? (
            <Tooltip
              content={
                <span className="whitespace-pre-wrap">
                  {notesPreviewText(task.notes, 20)}
                </span>
              }
            >
              <StickyNote
                size={16}
                className="ml-1 mr-0.5 shrink-0 text-[var(--text-muted)]"
                aria-label="Task notes"
              />
            </Tooltip>
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
          {ctx.canManage && !ctx.readOnly ? (
            <button
              type="button"
              className="inline-flex shrink-0 cursor-pointer rounded p-0.5 text-[var(--text-muted)] opacity-0 hover:bg-[var(--row-hover)] hover:text-[var(--text)] group-hover:opacity-100"
              onClick={() => ctx.setEditingTask(task)}
              aria-label="Edit task"
              title="Edit task"
            >
              <Pencil size={14} />
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
        <div
          className="pb-3 pr-2 pt-3"
          style={{ paddingLeft: 8 }}
        >
          <div className="flex gap-1.5">
            <span className="w-4 shrink-0" aria-hidden />
            <span className="w-2.5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-8">
              {hasNotes ? (
                <div className="py-2">
                  <RichNotesHtml
                    html={task.notes}
                    className="text-sm text-[var(--text)]"
                  />
                </div>
              ) : null}
              <CommentThread
                task={task}
                comments={taskComments}
                ctx={ctx}
              />
            </div>
          </div>
        </div>
      ) : null}
      </div>
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
  comments,
  ctx,
}: {
  task: Task;
  comments: TaskComment[];
  ctx: BoardCtx;
}) {
  const [draft, setDraft] = useState("");
  const [replying, setReplying] = useState(false);
  const sorted = [...comments].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  function cancelReply() {
    setDraft("");
    setReplying(false);
  }

  function submitReply() {
    if (!notesHasContent(draft)) return;
    ctx.addComment(task.id, draft, extractMentionPersonIds(draft));
    setDraft("");
    setReplying(false);
  }

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">No comments yet</p>
      ) : (
        sorted.map((c) => (
          <CommentItem key={c.id} comment={c} ctx={ctx} />
        ))
      )}
      {ctx.profileId ? (
        replying ? (
          <div className="space-y-2.5">
            <SimpleRichTextEditor
              value={draft}
              onChange={setDraft}
              placeholder="Add a comment... Use @ to mention"
              mentionPeople={ctx.mentionPeople}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="h-7 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-xs font-medium text-[var(--accent-fg)] hover:opacity-90"
                onClick={submitReply}
              >
                Add comment
              </button>
              <button
                type="button"
                className="h-7 cursor-pointer rounded-md border border-[var(--border)] px-3 text-xs text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                onClick={cancelReply}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--text)_22%,transparent)] px-2.5 text-xs text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            onClick={() => setReplying(true)}
          >
            <Reply size={13} strokeWidth={1.75} />
            {sorted.length === 0 ? "Add comment" : "Reply"}
          </button>
        )
      ) : null}
    </div>
  );
}

function CommentItem({
  comment,
  ctx,
}: {
  comment: TaskComment;
  ctx: BoardCtx;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const author = ctx.profiles.find((p) => p.id === comment.author_profile_id);
  const authorPerson = ctx.people.find(
    (p) => p.profile_id === comment.author_profile_id,
  );
  const displayName =
    author?.full_name || authorPerson?.name || "Someone";
  const isAuthor = Boolean(
    ctx.profileId && comment.author_profile_id === ctx.profileId,
  );
  const canDelete = ctx.canManage || isAuthor;
  const wasEdited = Boolean(
    comment.updated_at && comment.updated_at !== comment.created_at,
  );
  const showActions = isAuthor || canDelete;

  function startEdit() {
    setDraft(comment.body);
    setEditing(true);
  }

  function cancelEdit() {
    setDraft(comment.body);
    setEditing(false);
  }

  function saveEdit() {
    if (!notesHasContent(draft)) return;
    ctx.editComment(comment, draft, extractMentionPersonIds(draft));
    setEditing(false);
  }

  return (
    <div className="group flex items-start gap-2.5">
      <PersonAvatar
        avatarUrl={authorPerson?.avatar_url}
        name={displayName}
        size="row"
        fallback="initials"
        className="mt-0.5 shrink-0"
      />
      <div className="relative min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--comment-bg)] p-5 text-sm">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-xs font-semibold text-[var(--text)]">
            {displayName}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
            {format(parseISO(comment.created_at), "MMM d, yyyy · h:mm a")}
            {wasEdited ? (
              <span
                className="ml-1 italic"
                title={
                  comment.updated_at
                    ? format(
                        parseISO(comment.updated_at),
                        "MMM d, yyyy · h:mm a",
                      )
                    : undefined
                }
              >
                · edited
              </span>
            ) : null}
          </span>
        </div>
        {editing ? (
          <div className="space-y-2.5">
            <SimpleRichTextEditor
              value={draft}
              onChange={setDraft}
              placeholder="Edit comment... Use @ to mention"
              mentionPeople={ctx.mentionPeople}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="h-7 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-xs font-medium text-[var(--accent-fg)] hover:opacity-90"
                onClick={saveEdit}
              >
                Save
              </button>
              <button
                type="button"
                className="h-7 cursor-pointer rounded-md border border-[var(--border)] px-3 text-xs hover:bg-[var(--row-hover)]"
                onClick={cancelEdit}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="leading-relaxed pr-14">
              <RichNotesHtml html={comment.body} />
            </div>
            <CommentReactions comment={comment} ctx={ctx} />
            {showActions ? (
              <div className="absolute bottom-3 right-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                {isAuthor ? (
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                    aria-label="Edit comment"
                    title="Edit"
                    onClick={startEdit}
                  >
                    <Pencil size={13} strokeWidth={1.75} />
                  </button>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--status-over)]"
                    aria-label="Delete comment"
                    title="Delete"
                    onClick={() => ctx.deleteComment(comment.id)}
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

const COMMENT_REACTION_EMOJIS = ["👍", "❤️", "🎉", "👀", "🔥"] as const;

function CommentReactions({
  comment,
  ctx,
}: {
  comment: TaskComment;
  ctx: BoardCtx;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const canReact = Boolean(ctx.profileId) && !ctx.readOnly;
  const reactions = comment.reactions ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, { emoji: string; profileIds: string[] }>();
    for (const reaction of reactions) {
      const entry = map.get(reaction.emoji) ?? {
        emoji: reaction.emoji,
        profileIds: [],
      };
      entry.profileIds.push(reaction.profile_id);
      map.set(reaction.emoji, entry);
    }
    return [...map.values()].sort((a, b) => a.emoji.localeCompare(b.emoji));
  }, [reactions]);

  if (!canReact && grouped.length === 0) return null;

  return (
    <div className="relative mt-3 flex flex-wrap items-center gap-1.5 pr-14">
      {grouped.map(({ emoji, profileIds }) => {
        const mine = Boolean(
          ctx.profileId && profileIds.includes(ctx.profileId),
        );
        const names = profileIds
          .map((id) => {
            const profile = ctx.profiles.find((p) => p.id === id);
            const person = ctx.people.find((p) => p.profile_id === id);
            return profile?.full_name || person?.name || "Someone";
          })
          .join(", ");
        return (
          <button
            key={emoji}
            type="button"
            disabled={!canReact}
            title={names}
            aria-label={`${emoji} reaction, ${profileIds.length} ${profileIds.length === 1 ? "person" : "people"}`}
            aria-pressed={mine}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors",
              mine
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--text)]"
                : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]",
              canReact && "cursor-pointer hover:bg-[var(--row-hover)]",
              !canReact && "cursor-default",
            )}
            onClick={() => {
              if (!canReact) return;
              ctx.toggleReaction(comment.id, emoji);
            }}
          >
            <span className="text-sm leading-none">{emoji}</span>
            <span>{profileIds.length}</span>
          </button>
        );
      })}
      {canReact ? (
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            aria-label="Add reaction"
            aria-expanded={pickerOpen}
            title="Add reaction"
            onClick={() => setPickerOpen((open) => !open)}
          >
            <SmilePlus size={14} strokeWidth={1.75} />
          </button>
          {pickerOpen ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-20 cursor-default"
                aria-label="Close reaction picker"
                onClick={() => setPickerOpen(false)}
              />
              <div className="absolute bottom-full left-0 z-30 mb-1 flex gap-0.5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-md">
                {COMMENT_REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-base hover:bg-[var(--row-hover)]"
                    aria-label={`React with ${emoji}`}
                    onClick={() => {
                      ctx.toggleReaction(comment.id, emoji);
                      setPickerOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </>
          ) : null}
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
  people,
  editingTaskId,
  onEdit,
  onSaveEdit,
  onDeleteEdit,
  onCancelEdit,
  onMove,
}: {
  tasks: Task[];
  manageLists: boolean;
  people: Person[];
  editingTaskId: string | null;
  onEdit?: (task: Task) => void;
  onSaveEdit: (taskId: string, draft: InlineTaskDraft) => void;
  onDeleteEdit: (taskId: string) => void;
  onCancelEdit: () => void;
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
            people={people}
            editingTaskId={editingTaskId}
            onEdit={onEdit}
            onSaveEdit={onSaveEdit}
            onDeleteEdit={onDeleteEdit}
            onCancelEdit={onCancelEdit}
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
  people,
  editingTaskId,
  onEdit,
  onSaveEdit,
  onDeleteEdit,
  onCancelEdit,
  activeId,
}: {
  status: TaskStatus;
  tasks: Task[];
  manageLists: boolean;
  people: Person[];
  editingTaskId: string | null;
  onEdit?: (task: Task) => void;
  onSaveEdit: (taskId: string, draft: InlineTaskDraft) => void;
  onDeleteEdit: (taskId: string) => void;
  onCancelEdit: () => void;
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
          tasks.map((t) =>
            editingTaskId === t.id ? (
              <InlineTaskForm
                key={t.id}
                people={people}
                status={t.status}
                submitLabel="Save"
                initial={{
                  title: t.title,
                  assignee_person_id: t.assignee_person_id,
                  start_date: t.start_date,
                  due_date: t.due_date,
                  notes: t.notes,
                }}
                onCancel={onCancelEdit}
                onSubmit={(draft) => onSaveEdit(t.id, draft)}
                onDelete={() => onDeleteEdit(t.id)}
              />
            ) : (
              <KanbanCard
                key={t.id}
                task={t}
                manageLists={manageLists}
                onEdit={onEdit}
                isOverlaySource={activeId === t.id}
              />
            ),
          )
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
        <div
          className={cn(
            "mt-1 text-[10px]",
            dueDateToneClass(task.due_date, todayKey(), {
              complete: task.status === "complete",
            }),
          )}
        >
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

