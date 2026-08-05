"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  CalendarDays,
  ChartGantt,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  LayoutList,
  LayoutGrid,
  MessageSquare,
  Pencil,
  Plus,
  Reply,
  SmilePlus,
  Star,
  StickyNote,
  Trash2,
} from "lucide-react";
import { ProjectTaskCalendar } from "@/components/projects/project-task-calendar";
import { ProjectGanttBoard } from "@/components/projects/project-gantt-board";
import { useToast } from "@/components/toast/toast-provider";
import { ConfirmDialog, inputClass, DateInput } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { ExpandPanel } from "@/components/ui/expand-panel";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";
import { PersonAvatar } from "@/components/people/person-avatar";
import { TaskStatusTag } from "@/components/tasks/task-status-tag";
import {
  TaskDescriptionCommentsGate,
  TaskDescriptionCreateField,
  TaskDescriptionEditor,
  TaskDescriptionView,
} from "@/components/projects/task-description";
import { RichNotesHtml, SimpleRichTextEditor } from "@/components/ui/simple-rich-text";
import { useData } from "@/lib/data/store";
import { useProjectHref } from "@/lib/hooks/use-app-href";
import { useViewAsOptional } from "@/lib/view-as";
import {
  clearCommentDraft,
  readCommentDraft,
  taskIdsWithCommentDrafts,
  writeCommentDraft,
} from "@/lib/comment-drafts";
import {
  clearTaskCreateDraft,
  listTaskCreateDrafts,
  readTaskCreateDraft,
  writeTaskCreateDraft,
  type TaskCreateDraft,
} from "@/lib/task-create-drafts";
import { notesHasContent, notesPreviewText } from "@/lib/notes-html";
import { extractMentionPersonIds } from "@/lib/mentions";
import { cn } from "@/lib/cn";
import { PRESET_COLORS } from "@/lib/domain/colors";
import { projectTeamPersonIds, projectAssigneePeople, canEditProject } from "@/lib/domain/project-access";
import { personAvatarColor } from "@/lib/domain/people";
import {
  canCompleteTask,
  dueDateToneClass,
  emptyTaskAuditFields,
  isClientReviewApproved,
  isClientReviewOpen,
  isDownstreamOfOpenClientReview,
  listDisplayOrder,
  nextClientReviewStatus,
  parentTasks,
  sortTaskLists,
  taskDividerLabel,
  taskDividerColor,
  normalizeDividerColor,
  taskStatusLabel,
  taskVisualTone,
  tasksForList,
  withClientReviewTitle,
  withoutClientReviewTitle,
  type TaskVisualTone,
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

type InlineTaskDraft = TaskCreateDraft;
export type TaskBoardView = "list" | "card" | "calendar" | "gantt";

const GANTT_STRUCTURAL_EDIT_MSG =
  "Changing order or deleting Gantt items should be done in Gantt view.";

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
  /** When set, only show tasks assigned to this person. */
  assigneePersonId?: string | null;
  /**
   * Rendered between active lists and the Archive section (e.g. Templates).
   * Lets the project page keep Templates above Archive while both sit under Tasks.
   */
  templatesSlot?: ReactNode;
  /** Notified when Gantt view is active so the page can relocate sidebar cards. */
  onGanttActiveChange?: (active: boolean) => void;
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
      color={personAvatarColor(person)}
      className="ring-1 ring-[var(--border)]"
    />
  );
}

/** Shared read-only-ish context threaded through row/list/comment sub-components. */
type BoardCtx = {
  people: Person[];
  /** Full org directory (for keeping orphan assignees visible when editing). */
  allPeople: Person[];
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
  toggleSelect: (id: string, shiftKey?: boolean) => void;
  setParentsSelected: (ids: string[], on: boolean) => void;
  /** Selected task ids currently being dragged as a group (dim siblings). */
  multiDragIds: Set<string> | null;
  cycleStatus: (task: Task) => void;
  editingTaskId: string | null;
  setEditingTask: (task: Task | null) => void;
  saveEditingTask: (taskId: string, draft: InlineTaskDraft) => void;
  deleteEditingTask: (taskId: string) => void;
  saveDivider: (
    taskId: string,
    patch: { title?: string; color?: string | null },
  ) => void;
  deleteDivider: (taskId: string) => void;
  exitingTaskIds: Set<string>;
  onTaskExitComplete: (taskId: string) => void;
  addSubtask: (listId: string, parentId: string) => void;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  collapseExpanded: (ids: string[]) => void;
  childrenMap: Map<string, Task[]>;
  addComment: (taskId: string, html: string, mentionedPersonIds: string[]) => void;
  editComment: (
    comment: TaskComment,
    html: string,
    mentionedPersonIds: string[],
  ) => void;
  deleteComment: (id: string) => void;
  toggleReaction: (commentId: string, emoji: string) => void;
  /** @mention targets on the project team. */
  mentionPeople: Person[];
  /** Task ids with unread assigner ↔ assignee thread for the viewer. */
  unreadTaskThreadIds: Set<string>;
  boardView: TaskBoardView;
  /** Gantt-enabled list locked to the project manager. */
  isListGanttLocked: (listId: string) => boolean;
  /** PM must use Gantt view for structural edits on Gantt lists. */
  guardGanttStructuralEdit: (listId: string) => boolean;
  /** Parent-then-children display order per list (CR tone / lock). */
  orderedListTasksByListId: Map<string, Task[]>;
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

/**
 * Tasks to move when dragging `activeId`. If the active task is selected with
 * others, move all selected roots (skip children whose parent is also selected).
 */
function movableDragGroup(
  activeId: string,
  selected: Set<string>,
  projectTasks: Task[],
): Task[] {
  const active = projectTasks.find((t) => t.id === activeId);
  if (!active) return [];
  if (!selected.has(activeId) || selected.size <= 1) {
    if (active.is_client_review) return [];
    return [active];
  }

  const roots = [...selected]
    .map((id) => projectTasks.find((t) => t.id === id))
    .filter((t): t is Task => Boolean(t))
    .filter((t) => !t.parent_id || !selected.has(t.parent_id));

  if (
    roots.length > 0 &&
    roots.every(
      (t) => t.is_client_review && t.parent_id && !selected.has(t.parent_id),
    )
  ) {
    return [];
  }

  return roots.sort((a, b) => {
    if (a.list_id !== b.list_id) {
      if (a.list_id === active.list_id) return -1;
      if (b.list_id === active.list_id) return 1;
      return a.list_id.localeCompare(b.list_id);
    }
    const aParent = a.parent_id ?? "";
    const bParent = b.parent_id ?? "";
    if (aParent !== bParent) {
      if (!a.parent_id) return -1;
      if (!b.parent_id) return 1;
      return aParent.localeCompare(bParent);
    }
    return a.sort_order - b.sort_order || a.title.localeCompare(b.title);
  });
}

/** Pulsing placeholder rows while project tasks load (schedule sidebar / hub). */
function TaskBoardSkeleton({ compact = false }: { compact?: boolean }) {
  const sections = compact
    ? [
        [0.92, 0.78, 0.64],
        [0.86, 0.7],
      ]
    : [
        [0.9, 0.75, 0.6, 0.82],
        [0.88, 0.68, 0.74],
      ];

  return (
    <div
      className={cn("space-y-4", compact && "space-y-3")}
      aria-busy="true"
      aria-label="Loading tasks"
    >
      {sections.map((widths, sectionIdx) => (
        <div key={sectionIdx} className="space-y-2">
          <div
            className={cn(
              "animate-pulse rounded bg-[var(--bg-elevated)]",
              compact ? "h-2.5 w-20" : "h-3 w-28",
            )}
            style={{ animationDelay: `${sectionIdx * 80}ms` }}
          />
          <div className={cn("space-y-1.5", !compact && "space-y-2")}>
            {widths.map((w, i) => (
              <div
                key={i}
                className={cn(
                  "animate-pulse rounded-md bg-[var(--bg-elevated)]",
                  compact ? "h-7" : "h-9",
                )}
                style={{
                  width: `${w * 100}%`,
                  animationDelay: `${sectionIdx * 80 + (i + 1) * 60}ms`,
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProjectTaskBoard({
  projectId,
  readOnly = false,
  compact = false,
  allowCardView = false,
  allowSelect: allowSelectProp,
  focusTaskId = null,
  assigneePersonId = null,
  templatesSlot,
  onGanttActiveChange,
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
    ensureProjectData,
    dataStatus,
    dismissTaskThreadUnread,
  } = useData();
  const { push: toast } = useToast();
  const projectHref = useProjectHref();
  const project = state.projects.find((p) => p.id === projectId);
  const viewAs = useViewAsOptional();

  useEffect(() => {
    if (!projectId) return;
    void ensureProjectData(projectId);
  }, [projectId, ensureProjectData]);

  const projectDataReady =
    isPublicShare ||
    !projectId ||
    dataStatus.projects[projectId] === "ready";
  const projectDataLoading =
    Boolean(projectId) &&
    !projectDataReady &&
    dataStatus.projects[projectId] !== "error";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectionAnchorRef = useRef<string | null>(null);
  const [multiDragIds, setMultiDragIds] = useState<Set<string> | null>(null);
  const [listDragActiveId, setListDragActiveId] = useState<string | null>(null);
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
  const [view, setView] = useState<TaskBoardView>("list");

  function setTaskView(next: TaskBoardView) {
    if (next === "card" || next === "calendar" || next === "gantt") {
      setEditingTaskId(null);
      setDraftingListId(null);
    }
    setView(next);
  }

  const [collapsedLists, setCollapsedLists] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [listsEditMode, setListsEditMode] = useState(false);
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const didRestoreCreateDraft = useRef(false);
  const [exitingTaskIds, setExitingTaskIds] = useState<Set<string>>(new Set());
  const pendingDeleteRootsRef = useRef<Set<string>>(new Set());
  const exitHandledRef = useRef<Set<string>>(new Set());

  const orgCanManage = viewAs ? viewAs.effectiveCanManage : canManage;
  const viewerPersonId =
    viewAs?.effectivePersonId ?? myPerson?.id ?? null;
  const viewerCanManage =
    orgCanManage ||
    canEditProject(project, {
      canManage: false,
      myPersonId: viewerPersonId,
      projectMembers: state.project_members,
    });

  const unreadTaskThreadIds = useMemo(() => {
    if (!viewerPersonId) return new Set<string>();
    return new Set(
      state.unread_task_threads
        .filter((r) => r.person_id === viewerPersonId)
        .map((r) => r.task_id),
    );
  }, [state.unread_task_threads, viewerPersonId]);

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

  const isPm =
    Boolean(project?.manager_person_id) &&
    project?.manager_person_id === viewerPersonId;

  const showGanttToggle =
    activeLists.some((l) => l.gantt_enabled) &&
    Boolean(project?.manager_person_id);

  const listById = useMemo(() => {
    const map = new Map<string, TaskList>();
    for (const list of allLists) map.set(list.id, list);
    return map;
  }, [allLists]);

  function isListGanttLocked(listId: string): boolean {
    const list = listById.get(listId);
    return Boolean(list?.gantt_enabled && !isPm);
  }

  function guardGanttStructuralEdit(listId: string): boolean {
    const list = listById.get(listId);
    if (!list?.gantt_enabled || !isPm || view === "gantt") return false;
    window.alert(GANTT_STRUCTURAL_EDIT_MSG);
    return true;
  }

  function guardGanttStructuralEditForTasks(taskIds: string[]): boolean {
    for (const id of taskIds) {
      const task = state.tasks.find((t) => t.id === id);
      if (task && guardGanttStructuralEdit(task.list_id)) return true;
    }
    return false;
  }

  useEffect(() => {
    if (view === "gantt" && !showGanttToggle) setView("list");
  }, [view, showGanttToggle]);

  useEffect(() => {
    onGanttActiveChange?.(view === "gantt");
  }, [view, onGanttActiveChange]);

  const visibleTasks = useMemo(() => {
    const projectTasks = state.tasks.filter((t) => t.project_id === projectId);
    if (!assigneePersonId) return projectTasks;

    const assigned = projectTasks.filter(
      (t) => t.assignee_person_id === assigneePersonId,
    );
    const assignedIds = new Set(assigned.map((t) => t.id));
    return assigned.map((t) =>
      t.parent_id && assignedIds.has(t.parent_id)
        ? t
        : t.parent_id
          ? { ...t, parent_id: null }
          : t,
    );
  }, [state.tasks, projectId, assigneePersonId]);

  const childrenMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    const byId = new Map(visibleTasks.map((t) => [t.id, t]));
    for (const t of visibleTasks) {
      if (!t.parent_id) continue;
      const parent = byId.get(t.parent_id);
      if (!parent || parent.is_divider) continue;
      const arr = map.get(t.parent_id) ?? [];
      arr.push(t);
      map.set(t.parent_id, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
    }
    return map;
  }, [visibleTasks]);

  const orderedListTasksByListId = useMemo(() => {
    const map = new Map<string, Task[]>();
    const listIds = new Set(visibleTasks.map((t) => t.list_id));
    for (const listId of listIds) {
      map.set(
        listId,
        listDisplayOrder(tasksForList(visibleTasks, listId)),
      );
    }
    return map;
  }, [visibleTasks]);

  /** Visual checkbox order across lists (parents then subtasks), for Shift+click ranges. */
  const selectableOrder = useMemo(() => {
    const ids: string[] = [];
    const walkLists = (lists: typeof activeLists) => {
      for (const list of lists) {
        const parents = sortByOrder(
          visibleTasks.filter((t) => t.list_id === list.id && !t.parent_id),
        );
        for (const parent of parents) {
          if (parent.is_divider) continue;
          ids.push(parent.id);
          for (const child of childrenMap.get(parent.id) ?? []) {
            ids.push(child.id);
          }
        }
      }
    };
    walkLists(activeLists);
    if (archiveExpanded) walkLists(archivedLists);
    return ids;
  }, [
    activeLists,
    archivedLists,
    archiveExpanded,
    visibleTasks,
    childrenMap,
  ]);

  function toggleSelect(id: string, shiftKey = false) {
    if (shiftKey && selectionAnchorRef.current) {
      const anchorId = selectionAnchorRef.current;
      const a = selectableOrder.indexOf(anchorId);
      const b = selectableOrder.indexOf(id);
      if (a >= 0 && b >= 0) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        setSelected(new Set(selectableOrder.slice(lo, hi + 1)));
        return;
      }
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    selectionAnchorRef.current = id;
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
    if (on && ids.length > 0) {
      selectionAnchorRef.current = ids[ids.length - 1] ?? null;
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      const opening = !next.has(id);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (opening && viewerPersonId && unreadTaskThreadIds.has(id)) {
        dismissTaskThreadUnread(id, viewerPersonId);
      }
      return next;
    });
  }

  function collapseExpanded(ids: string[]) {
    if (ids.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ids) {
        if (next.delete(id)) changed = true;
      }
      return changed ? next : prev;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkDraft({});
    selectionAnchorRef.current = null;
  }

  function beginDeleteTasks(rootIds: string[]) {
    if (guardGanttStructuralEditForTasks(rootIds)) return;
    const roots = [
      ...new Set(
        rootIds.filter(
          (id) =>
            Boolean(state.tasks.find((t) => t.id === id)) &&
            !pendingDeleteRootsRef.current.has(id),
        ),
      ),
    ];
    if (roots.length === 0) return;

    const newlyExiting = new Set<string>();
    for (const id of roots) {
      pendingDeleteRootsRef.current.add(id);
      exitHandledRef.current.delete(id);
      newlyExiting.add(id);
      for (const child of childrenMap.get(id) ?? []) {
        exitHandledRef.current.delete(child.id);
        newlyExiting.add(child.id);
      }
    }
    setExitingTaskIds((prev) => {
      const next = new Set(prev);
      for (const id of newlyExiting) next.add(id);
      return next;
    });
    setEditingTaskId((prev) => (prev && newlyExiting.has(prev) ? null : prev));
    setSelected((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of newlyExiting) {
        if (next.delete(id)) changed = true;
      }
      return changed ? next : prev;
    });
  }

  function onTaskExitComplete(taskId: string) {
    if (exitHandledRef.current.has(taskId)) return;
    exitHandledRef.current.add(taskId);

    setExitingTaskIds((prev) => {
      if (!prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });

    if (!pendingDeleteRootsRef.current.has(taskId)) return;
    pendingDeleteRootsRef.current.delete(taskId);
    const childIds = state.tasks
      .filter((t) => t.parent_id === taskId)
      .map((t) => t.id);
    deleteTask(taskId);
    if (childIds.length === 0) return;
    setExitingTaskIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of childIds) {
        if (next.delete(id)) changed = true;
        exitHandledRef.current.add(id);
      }
      return changed ? next : prev;
    });
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
    beginDeleteTasks([...parents, ...orphans].map((t) => t.id));
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

  function moveSelectedToList(destListId: string) {
    if (!manageLists || selected.size === 0 || !destListId) return;
    if (isListGanttLocked(destListId)) return;
    const destList = allLists.find((l) => l.id === destListId);
    if (!destList) return;
    if (guardGanttStructuralEditForTasks([...selected])) return;

    const projectTasks = state.tasks.filter((t) => t.project_id === projectId);
    const selectedTasks = [...selected]
      .map((id) => projectTasks.find((t) => t.id === id))
      .filter((t): t is Task => Boolean(t));

    // Move selected parents (with their children) and orphan selected subtasks.
    const movers = selectedTasks
      .filter((t) => !t.parent_id || !selected.has(t.parent_id))
      .filter(
        (t) =>
          !t.is_client_review || !t.parent_id || selected.has(t.parent_id),
      )
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.title.localeCompare(b.title),
      );
    if (movers.length === 0) return;

    const movingIds = new Set(movers.map((m) => m.id));
    const childTasksOf = (parentId: string) =>
      projectTasks.filter((t) => t.parent_id === parentId);

    const destParents = sortByOrder(
      projectTasks.filter(
        (t) =>
          t.list_id === destListId &&
          !t.parent_id &&
          !movingIds.has(t.id),
      ),
    );

    let nextOrder = destParents.length;
    for (const mover of movers) {
      upsertTask({
        ...mover,
        list_id: destListId,
        parent_id: null,
        sort_order: nextOrder,
      });
      nextOrder += 1;

      const children = sortByOrder(childTasksOf(mover.id));
      children.forEach((child, i) => {
        upsertTask({
          ...child,
          list_id: destListId,
          parent_id: mover.id,
          sort_order: i,
        });
      });
    }

    const oldScopes = new Map<
      string,
      { listId: string; parentId: string | null }
    >();
    for (const m of movers) {
      oldScopes.set(`${m.list_id}:${m.parent_id ?? ""}`, {
        listId: m.list_id,
        parentId: m.parent_id,
      });
    }
    for (const { listId, parentId } of oldScopes.values()) {
      if (listId === destListId && parentId === null) continue;
      sortByOrder(
        projectTasks.filter(
          (t) =>
            t.list_id === listId &&
            t.parent_id === parentId &&
            !movingIds.has(t.id),
        ),
      ).forEach((t, i) => {
        if (t.sort_order !== i) upsertTask({ ...t, sort_order: i });
      });
    }

    clearSelection();
  }

  function applyBulkEdits() {
    if (!bulkHasChanges || selected.size === 0) return;
    for (const id of selected) {
      const task = state.tasks.find((t) => t.id === id);
      if (!task || isListGanttLocked(task.list_id)) continue;
      const ordered = listDisplayOrder(
        visibleTasks.filter((t) => t.list_id === task.list_id),
      );
      if (isDownstreamOfOpenClientReview(task.id, ordered)) continue;

      let next = { ...task };
      let changed = false;
      if (bulkDraft.status !== undefined) {
        if (viewerCanManage || task.assignee_person_id === viewerPersonId) {
          if (task.is_client_review) {
            const crNext = nextClientReviewStatus(task.status);
            if (bulkDraft.status !== crNext && bulkDraft.status !== task.status) {
              continue;
            }
            if (
              bulkDraft.status === "complete" &&
              !canCompleteTask(
                viewerPersonId,
                task,
                state.people,
                project ?? null,
              )
            ) {
              continue;
            }
            if (bulkDraft.status !== task.status) {
              next = { ...next, status: bulkDraft.status };
              changed = true;
            }
          } else {
            if (
              bulkDraft.status === "complete" &&
              !canCompleteTask(
                viewerPersonId,
                task,
                state.people,
                project ?? null,
              )
            ) {
              continue;
            }
            next = { ...next, status: bulkDraft.status };
            changed = true;
          }
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
      hide_from_client: false,
      gantt_enabled: false,
      start_date: null,
      end_date: null,
    };
    upsertTaskList(list);
  }

  function addSubtask(listId: string, parentId: string) {
    if (!manageLists || isListGanttLocked(listId)) return;
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
      is_divider: false,
      is_client_review: false,
      status: "upcoming",
      start_date: null,
      due_date: null,
      notes: "",
      sort_order: siblings.length,
      ...emptyTaskAuditFields(),
    };
    upsertTask(task);
  }

  function createTaskFromDraft(listId: string, draft: InlineTaskDraft) {
    if (!manageLists || isListGanttLocked(listId)) return;
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
      is_divider: false,
      is_client_review: false,
      status: "upcoming",
      start_date: draft.start_date,
      due_date: draft.due_date,
      notes: draft.notes,
      sort_order: siblings.length,
      ...emptyTaskAuditFields(),
    };
    upsertTask(task);
    clearTaskCreateDraft(profile?.id, listId);
    setDraftingListId(null);
  }

  function addDivider(listId: string) {
    if (!manageLists || isListGanttLocked(listId)) return;
    const siblings = visibleTasks.filter(
      (t) => t.list_id === listId && !t.parent_id,
    );
    const task: Task = {
      id: newId("task"),
      organization_id: state.organization.id,
      project_id: projectId,
      list_id: listId,
      parent_id: null,
      assignee_person_id: null,
      title: "",
      is_divider: true,
      is_client_review: false,
      status: "upcoming",
      start_date: null,
      due_date: null,
      notes: "",
      sort_order: siblings.length,
      ...emptyTaskAuditFields(),
    };
    upsertTask(task);
  }

  function saveDivider(
    taskId: string,
    patch: { title?: string; color?: string | null },
  ) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || !task.is_divider) return;
    upsertTask({
      ...task,
      title: patch.title !== undefined ? patch.title.trim() : task.title,
      notes:
        patch.color !== undefined
          ? normalizeDividerColor(patch.color)
          : task.notes,
    });
  }

  function deleteDivider(taskId: string) {
    beginDeleteTasks([taskId]);
  }

  function setEditingTask(task: Task | null) {
    if (task) {
      if (isListGanttLocked(task.list_id)) return;
      setDraftingListId(null);
      setEditingTaskId(task.id);
      return;
    }
    setEditingTaskId(null);
  }

  function saveEditingTask(taskId: string, draft: InlineTaskDraft) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || isListGanttLocked(task.list_id)) return;
    const title = draft.title.trim();
    if (!title) return;
    const isClientReview = Boolean(task.parent_id && draft.is_client_review);
    upsertTask({
      ...task,
      title,
      assignee_person_id: draft.assignee_person_id,
      start_date: draft.start_date,
      due_date: draft.due_date,
      notes: draft.notes,
      is_client_review: isClientReview,
    });
    setEditingTaskId(null);
  }

  function deleteEditingTask(taskId: string) {
    setEditingTaskId(null);
    beginDeleteTasks([taskId]);
  }

  function cycleStatus(task: Task) {
    if (task.is_divider) return;
    if (isPublicShare) return;
    if (isListGanttLocked(task.list_id)) return;
    // Schedule compact sidebar stays otherwise read-only; status cycling is allowed.
    if (readOnly && !compact) return;

    const ordered = listDisplayOrder(
      visibleTasks.filter((t) => t.list_id === task.list_id),
    );
    if (isDownstreamOfOpenClientReview(task.id, ordered)) return;

    if (task.is_client_review) {
      const next = nextClientReviewStatus(task.status);
      if (
        next === "complete" &&
        !canCompleteTask(viewerPersonId, task, state.people, project ?? null)
      ) {
        toast(
          "Only the project manager or task assigner can mark tasks complete",
          "warning",
        );
        return;
      }
      upsertTask({ ...task, status: next });
      return;
    }

    const next =
      task.status === "upcoming"
        ? "active"
        : task.status === "active"
          ? "complete"
          : "upcoming";
    if (
      next === "complete" &&
      !canCompleteTask(viewerPersonId, task, state.people, project ?? null)
    ) {
      toast("Only the project manager or task assigner can mark tasks complete", "warning");
      return;
    }
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

  const assigneePeople = useMemo(
    () =>
      projectAssigneePeople(
        projectId,
        state.people,
        state.project_members,
        { managerPersonId: project?.manager_person_id },
      ),
    [
      projectId,
      state.people,
      state.project_members,
      project?.manager_person_id,
    ],
  );

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
    if (viewerPersonId && unreadTaskThreadIds.has(focusTaskId)) {
      dismissTaskThreadUnread(focusTaskId, viewerPersonId);
    }
    const t = window.setTimeout(() => {
      document
        .getElementById(`task-row-${focusTaskId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [focusTaskId, visibleTasks, state.tasks, projectId, viewerPersonId, unreadTaskThreadIds, dismissTaskThreadUnread]);

  // Re-open comment panels that have an unfinished local reply draft.
  useEffect(() => {
    const profileId = profile?.id ?? null;
    if (!profileId) return;
    const draftTaskIds = taskIdsWithCommentDrafts(profileId);
    if (draftTaskIds.length === 0) return;
    const onBoard = new Set(
      state.tasks
        .filter((t) => t.project_id === projectId)
        .map((t) => t.id),
    );
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of draftTaskIds) {
        if (!onBoard.has(id) || next.has(id)) continue;
        next.add(id);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [profile?.id, projectId, state.tasks]);

  // Re-open the newest unfinished create-task form for a list on this board.
  useEffect(() => {
    didRestoreCreateDraft.current = false;
  }, [projectId]);

  useEffect(() => {
    if (didRestoreCreateDraft.current) return;
    const profileId = profile?.id ?? null;
    if (!profileId || !manageLists) return;
    if (allLists.length === 0) return;
    didRestoreCreateDraft.current = true;
    const listIds = new Set(allLists.map((l) => l.id));
    const match = listTaskCreateDrafts(profileId).find((d) =>
      listIds.has(d.listId),
    );
    if (!match) return;
    setEditingTaskId(null);
    setDraftingListId(match.listId);
    setCollapsedLists((prev) => {
      if (!prev.has(match.listId)) return prev;
      const next = new Set(prev);
      next.delete(match.listId);
      return next;
    });
  }, [profile?.id, projectId, manageLists, allLists]);

  function moveTaskToColumn(taskId: string, destStatus: TaskStatus, destIndex: number) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || isListGanttLocked(task.list_id)) return;
    if (guardGanttStructuralEdit(task.list_id)) return;

    const ordered = listDisplayOrder(
      visibleTasks.filter((t) => t.list_id === task.list_id),
    );
    if (isDownstreamOfOpenClientReview(task.id, ordered)) return;

    if (task.is_client_review) {
      if (destStatus !== "upcoming" && destStatus !== "complete") return;
      if (
        destStatus === "complete" &&
        !canCompleteTask(viewerPersonId, task, state.people, project ?? null)
      ) {
        toast(
          "Only the project manager or task assigner can mark tasks complete",
          "warning",
        );
        return;
      }
    }

    const sourceStatus = task.status;
    const destSiblings = parentTasks(visibleTasks)
      .filter((t) => t.status === destStatus && t.id !== taskId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const nextOrder = [...destSiblings];
    nextOrder.splice(Math.min(destIndex, nextOrder.length), 0, task);
    nextOrder.forEach((t, i) => {
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

  function handleListDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | ListDragData
      | TaskDragData
      | undefined;
    if (!data || data.type !== "task") {
      setMultiDragIds(null);
      setListDragActiveId(null);
      return;
    }
    const activeId = String(event.active.id);
    setListDragActiveId(activeId);
    if (selected.has(activeId) && selected.size > 1) {
      const projectTasks = state.tasks.filter((t) => t.project_id === projectId);
      const group = movableDragGroup(activeId, selected, projectTasks);
      setMultiDragIds(new Set(group.map((t) => t.id)));
    } else {
      setMultiDragIds(null);
    }
  }

  function clearListDragState() {
    setMultiDragIds(null);
    setListDragActiveId(null);
  }

  function handleListDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    clearListDragState();
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
      const draggedList = activeLists.find((l) => l.id === active.id);
      if (draggedList && guardGanttStructuralEdit(draggedList.id)) return;
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
    const movers = movableDragGroup(String(active.id), selected, projectTasks);
    if (movers.length === 0) return;
    if (movers.some((m) => isListGanttLocked(m.list_id))) return;
    if (guardGanttStructuralEditForTasks(movers.map((m) => m.id))) return;
    const task = movers[0]!;
    const movingIds = new Set(movers.map((t) => t.id));
    const multi = movers.length > 1;

    const childTasksOf = (parentId: string) =>
      sortByOrder(projectTasks.filter((t) => t.parent_id === parentId));

    const primarilyHorizontal =
      Math.abs(delta.x) >= INDENT_DRAG_PX &&
      Math.abs(delta.x) >= Math.abs(delta.y) * 0.75;

    // Indent / outdent only for a single dragged task (not dividers or CR).
    if (primarilyHorizontal && !multi) {
      if (task.is_divider || task.is_client_review) return;
      const childTasks = childTasksOf(task.id);
      if (delta.x > 0) {
        if (task.parent_id || childTasks.length > 0) return;
        const parents = sortByOrder(
          projectTasks.filter(
            (t) =>
              t.list_id === task.list_id && !t.parent_id && !t.is_divider,
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
            ...(p.id === task.id && task.is_client_review
              ? {
                  is_client_review: false,
                  title: withoutClientReviewTitle(task.title),
                }
              : {}),
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

    if (primarilyHorizontal && multi) return;
    if (active.id === over.id || !overData) return;
    if (movers.some((m) => m.is_client_review)) return;

    let destListId: string;
    let destParentId: string | null;
    let insertIndex: number;

    if (overData.type === "list-drop") {
      destListId = overData.listId;
      destParentId = null;
      insertIndex = projectTasks.filter(
        (t) =>
          t.list_id === destListId &&
          !t.parent_id &&
          !movingIds.has(t.id),
      ).length;
    } else if (overData.type === "task") {
      const overTask = projectTasks.find((t) => t.id === over.id);
      if (!overTask) return;
      destListId = overTask.list_id;
      destParentId = overTask.is_divider ? null : overTask.parent_id;
      const destSiblings = sortByOrder(
        projectTasks.filter(
          (t) =>
            t.list_id === destListId &&
            t.parent_id === destParentId &&
            !movingIds.has(t.id),
        ),
      );
      if (movingIds.has(overTask.id)) {
        insertIndex = destSiblings.length;
      } else {
        const overIdx = destSiblings.findIndex((t) => t.id === overTask.id);
        insertIndex = overIdx < 0 ? destSiblings.length : overIdx;
      }
    } else {
      return;
    }

    if (destParentId && movingIds.has(destParentId)) return;
    if (movers.some((m) => m.is_divider)) destParentId = null;
    const anyMoverHasChildren = movers.some(
      (m) => childTasksOf(m.id).length > 0,
    );
    if (destParentId && anyMoverHasChildren) return;
    if (
      destParentId &&
      movers.some((m) =>
        projectTasks.some(
          (t) => t.id === destParentId && t.parent_id === m.id,
        ),
      )
    ) {
      return;
    }

    const sameScope = movers.every(
      (m) => m.list_id === destListId && m.parent_id === destParentId,
    );

    if (sameScope) {
      const scope = sortByOrder(
        projectTasks.filter(
          (t) => t.list_id === destListId && t.parent_id === destParentId,
        ),
      );
      const without = scope.filter((t) => !movingIds.has(t.id));
      const target = Math.max(0, Math.min(insertIndex, without.length));
      const next = [...without];
      next.splice(target, 0, ...movers);
      next.forEach((t, i) => {
        if (t.sort_order !== i) {
          upsertTask({
            ...t,
            parent_id: t.is_divider ? null : t.parent_id,
            sort_order: i,
          });
        }
      });
      return;
    }

    // Cross list / parent: insert block into dest, reindex every old scope.
    const destSiblings = sortByOrder(
      projectTasks.filter(
        (t) =>
          t.list_id === destListId &&
          t.parent_id === destParentId &&
          !movingIds.has(t.id),
      ),
    );
    const target = Math.max(0, Math.min(insertIndex, destSiblings.length));
    const nextDest = [...destSiblings];
    nextDest.splice(target, 0, ...movers);
    nextDest.forEach((t, i) => {
      upsertTask({
        ...t,
        list_id: destListId,
        parent_id: t.is_divider ? null : destParentId,
        sort_order: i,
      });
    });

    for (const mover of movers) {
      for (const child of childTasksOf(mover.id)) {
        if (child.list_id !== destListId) {
          upsertTask({ ...child, list_id: destListId });
        }
      }
    }

    const oldScopes = new Map<string, { listId: string; parentId: string | null }>();
    for (const m of movers) {
      oldScopes.set(`${m.list_id}:${m.parent_id ?? ""}`, {
        listId: m.list_id,
        parentId: m.parent_id,
      });
    }
    for (const { listId, parentId } of oldScopes.values()) {
      if (listId === destListId && parentId === destParentId) continue;
      sortByOrder(
        projectTasks.filter(
          (t) =>
            t.list_id === listId &&
            t.parent_id === parentId &&
            !movingIds.has(t.id),
        ),
      ).forEach((t, i) => {
        if (t.sort_order !== i) upsertTask({ ...t, sort_order: i });
      });
    }
  }

  const ctx: BoardCtx = {
    people: assigneePeople,
    allPeople: state.people,
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
    multiDragIds,
    cycleStatus,
    editingTaskId,
    setEditingTask,
    saveEditingTask,
    deleteEditingTask,
    saveDivider,
    deleteDivider,
    exitingTaskIds,
    onTaskExitComplete,
    addSubtask,
    expanded,
    toggleExpand,
    collapseExpanded,
    childrenMap,
    addComment,
    editComment,
    deleteComment: deleteTaskComment,
    toggleReaction: toggleTaskCommentReaction,
    mentionPeople,
    unreadTaskThreadIds,
    boardView: view,
    isListGanttLocked,
    guardGanttStructuralEdit,
    orderedListTasksByListId,
  };

  if (projectDataLoading) {
    return <TaskBoardSkeleton compact={compact} />;
  }

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
              setView={setTaskView}
              allowCardView={allowCardView}
              showGanttToggle={showGanttToggle}
            />
          </div>
          {activeLists.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No task lists yet.</p>
          ) : (
            activeLists.map((list) => {
              const listParents = parentTasks(
                visibleTasks.filter(
                  (t) => t.list_id === list.id && !t.is_divider,
                ),
              );
              const listManage =
                manageLists && !isListGanttLocked(list.id);
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
                    {listParents.length === 0 && !listManage ? (
                      <p className="px-1 py-2 text-sm text-[var(--text-muted)]">
                        No tasks in this list yet.
                      </p>
                    ) : (
                      <KanbanBoard
                        tasks={listParents}
                        orderedListTasks={
                          orderedListTasksByListId.get(list.id) ?? []
                        }
                        manageLists={listManage}
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

  if (view === "calendar") {
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
              <ViewToggle
                view={view}
                setView={setTaskView}
                allowCardView={allowCardView}
                showGanttToggle={showGanttToggle}
              />
            </div>
            <ProjectTaskCalendar tasks={visibleTasks} todayKey={todayKey()} />
          </div>
        </section>
        {templatesSlot}
      </>
    );
  }

  if (view === "gantt") {
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
              <ViewToggle
                view={view}
                setView={setTaskView}
                allowCardView={allowCardView}
                showGanttToggle={showGanttToggle}
              />
            </div>
            <div data-gantt-root data-project-id={projectId}>
              <ProjectGanttBoard
                projectId={projectId}
                readOnly={readOnly || !isPm}
              />
            </div>
          </div>
        </section>
        {templatesSlot}
      </>
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
        <ViewToggle
          view={view}
          setView={setTaskView}
          allowCardView={allowCardView}
          showGanttToggle={showGanttToggle}
        />
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
                    ...sortPeopleByName(assigneePeople).map((p) => ({
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
          {manageLists && activeLists.length > 0 ? (
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-[var(--text-muted)]">
                Move to list
              </span>
              <Select
                className="mt-0 h-7 w-auto min-w-[8.5rem] max-w-[12rem] py-0 text-xs"
                value=""
                onChange={(value) => {
                  if (value) moveSelectedToList(value);
                }}
                aria-label="Move selected tasks to list"
                placeholder="Choose..."
                options={[
                  { value: "", label: "Choose..." },
                  ...activeLists.map((l) => ({
                    value: l.id,
                    label: l.name,
                  })),
                ]}
              />
            </label>
          ) : null}
          <div className="ml-auto flex shrink-0 flex-col items-end gap-0">
            <span className="mb-1 text-[10px] text-[var(--text-muted)]">
              {selected.size} selected
              {manageLists ? " · drag to move together" : ""}
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
          onDragStart={handleListDragStart}
          onDragCancel={clearListDragState}
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
                  milestone={
                    milestone
                      ? { name: milestone.name, status: milestone.status }
                      : null
                  }
                  onNameChange={(name) => upsertTaskList({ ...list, name })}
                  drafting={draftingListId === list.id}
                  onStartDraft={() => {
                    setEditingTaskId(null);
                    setDraftingListId(list.id);
                  }}
                  onCancelDraft={() => {
                    clearTaskCreateDraft(profile?.id, list.id);
                    setDraftingListId(null);
                  }}
                  onCreateDraft={(draft) => createTaskFromDraft(list.id, draft)}
                  onAddDivider={() => addDivider(list.id)}
                  onArchive={() => {
                    if (guardGanttStructuralEdit(list.id)) return;
                    upsertTaskList({ ...list, archived: true });
                  }}
                  onUnarchive={() =>
                    upsertTaskList({ ...list, archived: false })
                  }
                  onToggleHideFromClient={() =>
                    upsertTaskList({
                      ...list,
                      hide_from_client: !list.hide_from_client,
                    })
                  }
                  onDelete={() => {
                    if (guardGanttStructuralEdit(list.id)) return;
                    setConfirmDeleteList({ id: list.id, name: list.name });
                  }}
                  onUpdateList={(patch) =>
                    upsertTaskList({ ...list, ...patch })
                  }
                  showGanttControls={Boolean(project?.manager_person_id)}
                />
              );
            })}
          </SortableContext>
          <DragOverlay dropAnimation={null}>
            {listDragActiveId ? (
              <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm shadow-md">
                {multiDragIds && multiDragIds.size > 1 ? (
                  <span className="font-medium">
                    {multiDragIds.size} tasks
                  </span>
                ) : (
                  <span className="font-medium">
                    {state.tasks.find((t) => t.id === listDragActiveId)
                      ?.title || "Task"}
                  </span>
                )}
              </div>
            ) : null}
          </DragOverlay>
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
                      milestone={
                    milestone
                      ? { name: milestone.name, status: milestone.status }
                      : null
                  }
                      onNameChange={(name) => upsertTaskList({ ...list, name })}
                      drafting={draftingListId === list.id}
                      onStartDraft={() => {
                        setEditingTaskId(null);
                        setDraftingListId(list.id);
                      }}
                      onCancelDraft={() => {
                        clearTaskCreateDraft(profile?.id, list.id);
                        setDraftingListId(null);
                      }}
                      onCreateDraft={(draft) =>
                        createTaskFromDraft(list.id, draft)
                      }
                      onAddDivider={() => addDivider(list.id)}
                      onArchive={() => {
                        if (guardGanttStructuralEdit(list.id)) return;
                        upsertTaskList({ ...list, archived: true });
                      }}
                      onUnarchive={() =>
                        upsertTaskList({ ...list, archived: false })
                      }
                      onToggleHideFromClient={() =>
                        upsertTaskList({
                          ...list,
                          hide_from_client: !list.hide_from_client,
                        })
                      }
                      onDelete={() => {
                        if (guardGanttStructuralEdit(list.id)) return;
                        setConfirmDeleteList({ id: list.id, name: list.name });
                      }}
                      onUpdateList={(patch) =>
                        upsertTaskList({ ...list, ...patch })
                      }
                      showGanttControls={Boolean(project?.manager_person_id)}
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
  showGanttToggle,
}: {
  view: TaskBoardView;
  setView: (v: TaskBoardView) => void;
  allowCardView: boolean;
  showGanttToggle: boolean;
}) {
  if (!allowCardView) return null;
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] text-xs">
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 px-2 py-1",
          view === "list" && "bg-[var(--row-hover)]",
        )}
        onClick={() => setView("list")}
      >
        <LayoutList size={12} />
        List
      </button>
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 px-2 py-1",
          view === "card" && "bg-[var(--row-hover)]",
        )}
        onClick={() => setView("card")}
      >
        <LayoutGrid size={12} />
        Cards
      </button>
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 px-2 py-1",
          view === "calendar" && "bg-[var(--row-hover)]",
        )}
        onClick={() => setView("calendar")}
      >
        <CalendarDays size={12} />
        Calendar
      </button>
      {showGanttToggle ? (
        <button
          type="button"
          className={cn(
            "inline-flex cursor-pointer items-center gap-1 px-2 py-1",
            view === "gantt" && "bg-[var(--row-hover)]",
          )}
          onClick={() => setView("gantt")}
        >
          <ChartGantt size={12} />
          Gantt
        </button>
      ) : null}
    </div>
  );
}

function ListSection({
  list,
  parents,
  ctx,
  collapsed,
  onToggleCollapse,
  milestone,
  onNameChange,
  drafting,
  onStartDraft,
  onCancelDraft,
  onCreateDraft,
  onAddDivider,
  onArchive,
  onUnarchive,
  onToggleHideFromClient,
  onDelete,
  onUpdateList,
  showGanttControls,
}: {
  list: TaskList;
  parents: Task[];
  ctx: BoardCtx;
  collapsed: boolean;
  onToggleCollapse: () => void;
  milestone: { name: string; status: string } | null;
  onNameChange: (name: string) => void;
  drafting: boolean;
  onStartDraft: () => void;
  onCancelDraft: () => void;
  onCreateDraft: (draft: InlineTaskDraft) => void;
  onAddDivider: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onToggleHideFromClient: () => void;
  onDelete: () => void;
  onUpdateList: (patch: Partial<TaskList>) => void;
  showGanttControls: boolean;
}) {
  const listLocked = ctx.isListGanttLocked(list.id);
  const listManage = ctx.manageLists && !listLocked;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: list.id,
      data: { type: "list" } satisfies ListDragData,
      disabled: !listManage,
    });

  const selectableIds = parents.flatMap((p) =>
    p.is_divider
      ? []
      : [p.id, ...(ctx.childrenMap.get(p.id) ?? []).map((c) => c.id)],
  );
  const selectedCount = selectableIds.filter((id) =>
    ctx.selected.has(id),
  ).length;
  const allSelected =
    selectableIds.length > 0 && selectedCount === selectableIds.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const hasExpandedTasks =
    !ctx.readOnly &&
    selectableIds.some((id) => ctx.expanded.has(id));

  return (
    <section
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="group/list mb-3 overflow-hidden rounded-md border border-[var(--divider)]"
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
            className="cursor-grab touch-none text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Drag list to reorder"
            disabled={!listManage}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>
        ) : null}
        <button
          type="button"
          className="cursor-pointer text-[var(--text-muted)]"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand list" : "Collapse list"}
        >
          <ChevronDown
            size={14}
            className={cn(
              "transition-transform duration-200 ease-out motion-reduce:transition-none",
              collapsed && "-rotate-90",
            )}
          />
        </button>
        {ctx.manageLists && !listLocked ? (
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-lg font-medium outline-none"
            value={list.name}
            onChange={(e) => onNameChange(e.target.value)}
          />
        ) : (
          <span className="min-w-0 flex-1 text-lg font-medium">{list.name}</span>
        )}
        {ctx.manageLists && ctx.listsEditMode ? (
          <div className="flex flex-wrap items-center gap-1">
            {showGanttControls ? (
              <>
                <button
                  type="button"
                  className={cn(
                    "inline-flex cursor-pointer items-center justify-center rounded border p-1 hover:bg-[var(--row-hover)]",
                    list.gantt_enabled
                      ? "border-[var(--accent)] bg-[var(--row-hover)] text-[var(--accent)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--accent)]",
                  )}
                  onClick={() => {
                    if (!list.gantt_enabled) {
                      if (
                        !window.confirm(
                          "Enabling Gantt View Will Lock all Editing to the Project Manager of This Project.",
                        )
                      ) {
                        return;
                      }
                    }
                    onUpdateList({ gantt_enabled: !list.gantt_enabled });
                  }}
                  aria-label={
                    list.gantt_enabled
                      ? "Disable Gantt view"
                      : "Enable Gantt view"
                  }
                  title={
                    list.gantt_enabled
                      ? "Disable Gantt view"
                      : "Enable Gantt view"
                  }
                  aria-pressed={list.gantt_enabled}
                >
                  <ChartGantt size={14} />
                </button>
                {list.gantt_enabled ? (
                  <>
                    <input
                      type="date"
                      className="h-7 rounded border border-[var(--border)] bg-transparent px-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                      value={list.start_date ?? ""}
                      onChange={(e) =>
                        onUpdateList({
                          start_date: e.target.value || null,
                        })
                      }
                      aria-label={`${list.name} start date`}
                    />
                    <input
                      type="date"
                      className="h-7 rounded border border-[var(--border)] bg-transparent px-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
                      value={list.end_date ?? ""}
                      onChange={(e) =>
                        onUpdateList({
                          end_date: e.target.value || null,
                        })
                      }
                      aria-label={`${list.name} end date`}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            <button
              type="button"
              className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
              onClick={onToggleHideFromClient}
              aria-label={
                list.hide_from_client
                  ? `Show ${list.name} on client portal`
                  : `Hide ${list.name} from client portal`
              }
              title={
                list.hide_from_client
                  ? "Hidden from client portal"
                  : "Hide from client portal"
              }
              aria-pressed={list.hide_from_client}
            >
              {list.hide_from_client ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            {list.archived ? (
              <button
                type="button"
                className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                onClick={onUnarchive}
                aria-label={`Unarchive list ${list.name}`}
                title="Unarchive list"
              >
                <ArchiveRestore size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                onClick={onArchive}
                aria-label={`Archive list ${list.name}`}
                title="Archive list"
              >
                <Archive size={14} />
              </button>
            )}
            <button
              type="button"
              className="inline-flex cursor-pointer rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--status-over)]"
              onClick={onDelete}
              aria-label={`Delete list ${list.name}`}
              title="Delete list"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : null}
        {hasExpandedTasks ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => ctx.collapseExpanded(selectableIds)}
            aria-label={`Collapse all open tasks in ${list.name}`}
            title="Collapse all"
          >
            Collapse all
          </Button>
        ) : null}
        {!ctx.listsEditMode && list.gantt_enabled ? (
          <ChartGantt
            size={14}
            className="shrink-0 text-[var(--status-healthy)]"
            aria-label="Gantt view enabled"
          />
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
      <ExpandPanel open={!collapsed}>
          {parents.length === 0 ? (
            <ListTaskDropZone listId={list.id} disabled={!listManage}>
              {!listManage ? (
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
              disabled={!listManage}
            >
              {parents.map((t) =>
                t.is_divider ? (
                  <TaskDividerRow key={t.id} task={t} ctx={ctx} />
                ) : (
                  <TaskRow key={t.id} task={t} depth={0} ctx={ctx} />
                ),
              )}
            </SortableContext>
          )}
          {milestone ? (
            <div className="flex items-center gap-1.5 px-2 py-1 text-sm">
              <Star
                size={10}
                className={cn(
                  "h-2.5 w-2.5 shrink-0",
                  milestone.status === "done"
                    ? "fill-[var(--status-healthy)] text-[var(--status-healthy)]"
                    : "fill-[#f59e0b] text-[#f59e0b]",
                )}
                aria-hidden
              />
              <span
                className={cn(
                  "min-w-0 truncate",
                  milestone.status === "done" &&
                    "text-[var(--status-healthy)] line-through",
                )}
              >
                {milestone.name}
              </span>
            </div>
          ) : null}
          {listManage ? (
            <ListTaskDropZone listId={list.id} disabled={false}>
              {drafting ? (
                <InlineTaskForm
                  people={ctx.people}
                  mentionPeople={ctx.mentionPeople}
                  initial={
                    readTaskCreateDraft(ctx.profileId, list.id) ?? undefined
                  }
                  status="upcoming"
                  submitLabel="Add task"
                  onDraftChange={(draft) =>
                    writeTaskCreateDraft(ctx.profileId, list.id, draft)
                  }
                  onCancel={onCancelDraft}
                  onSubmit={onCreateDraft}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-left opacity-0 transition-opacity group-hover/list:opacity-100 focus-within:opacity-100">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onStartDraft}
                  >
                    <Plus size={12} strokeWidth={1.75} />
                    Add task
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onAddDivider}
                  >
                    Add divider
                  </Button>
                </div>
              )}
            </ListTaskDropZone>
          ) : null}
      </ExpandPanel>
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
  allPeople,
  mentionPeople,
  initial,
  status = "upcoming",
  submitLabel,
  onCancel,
  onSubmit,
  onDelete,
  onDraftChange,
  depth = 0,
  descriptionViewExpanded = false,
  allowClientReview = false,
}: {
  people: Person[];
  allPeople?: Person[];
  mentionPeople?: Person[];
  initial?: InlineTaskDraft;
  status?: TaskStatus;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: InlineTaskDraft) => void;
  onDelete?: () => void;
  /** When set (create flow), persist field changes as a local draft. */
  onDraftChange?: (draft: InlineTaskDraft) => void;
  depth?: number;
  /** View-mode description expand state when opening edit. */
  descriptionViewExpanded?: boolean;
  allowClientReview?: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [assigneeId, setAssigneeId] = useState(
    initial?.assignee_person_id ?? "",
  );
  const [startDate, setStartDate] = useState(initial?.start_date ?? "");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isClientReview, setIsClientReview] = useState(
    Boolean(initial?.is_client_review),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;

  const assigneeOptions = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    const currentId = initial?.assignee_person_id;
    if (currentId && !byId.has(currentId)) {
      const extra = (allPeople ?? []).find((p) => p.id === currentId);
      if (extra) byId.set(extra.id, extra);
    }
    return sortPeopleByName([...byId.values()]);
  }, [people, allPeople, initial?.assignee_person_id]);

  useEffect(() => {
    onDraftChangeRef.current?.({
      title,
      assignee_person_id: assigneeId || null,
      start_date: startDate || null,
      due_date: dueDate || null,
      notes,
      is_client_review: isClientReview,
    });
  }, [title, assigneeId, startDate, dueDate, notes, isClientReview]);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit({
      title: trimmed,
      assignee_person_id: assigneeId || null,
      start_date: startDate || null,
      due_date: dueDate || null,
      notes,
      is_client_review: isClientReview,
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
            <div className="flex min-w-0 items-center gap-3">
              <Select
                searchable
                className="min-w-0 flex-1"
                value={assigneeId}
                onChange={setAssigneeId}
                options={[
                  { value: "", label: "Unassigned" },
                  ...assigneeOptions.map((p) => ({
                    value: p.id,
                    label: p.name,
                  })),
                ]}
              />
              {allowClientReview ? (
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm text-[var(--text-muted)]">
                  <Checkbox
                    checked={isClientReview}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setIsClientReview(on);
                      setTitle((prev) =>
                        on
                          ? withClientReviewTitle(prev)
                          : withoutClientReviewTitle(prev),
                      );
                    }}
                    aria-label="Client Review"
                  />
                  Client Review
                </label>
              ) : null}
            </div>
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
          {onDelete ? (
            <TaskDescriptionEditor
              value={notes}
              onChange={setNotes}
              mentionPeople={mentionPeople}
              initialExpanded={descriptionViewExpanded}
            />
          ) : (
            <TaskDescriptionCreateField
              value={notes}
              onChange={setNotes}
              mentionPeople={mentionPeople}
            />
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
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

function TaskCommentIndicator({
  unread,
  count,
  expanded,
}: {
  unread: boolean;
  count: number;
  expanded: boolean;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-[var(--text-muted)]"
      aria-label={unread ? "Unread comments" : undefined}
    >
      <span className="relative inline-flex shrink-0">
        <MessageSquare
          size={16}
          className="text-[var(--text-muted)]"
          strokeWidth={1.75}
        />
        {unread ? (
          <MessageSquare
            size={16}
            className="absolute inset-0 fill-[var(--status-near)] text-[var(--status-near)]"
            strokeWidth={1.75}
          />
        ) : null}
      </span>
      {count > 0 ? count : null}
      <ChevronDown
        size={10}
        className={cn(
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          expanded ? "rotate-0" : "-rotate-90",
        )}
      />
    </span>
  );
}

function TaskDividerRow({ task, ctx }: { task: Task; ctx: BoardCtx }) {
  const label = taskDividerLabel(task.title);
  const lineColor = taskDividerColor(task.notes);
  const isExiting = ctx.exitingTaskIds.has(task.id);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftColor, setDraftColor] = useState(task.notes);
  const inputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: {
        type: "task",
        listId: task.list_id,
        parentId: null,
      } satisfies TaskDragData,
      disabled: !ctx.manageLists || editing || isExiting,
    });

  useEffect(() => {
    if (!isExiting) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduced ? 180 : 320;
    const timer = window.setTimeout(() => {
      ctx.onTaskExitComplete(task.id);
    }, ms);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exit once per isExiting
  }, [isExiting, task.id]);

  useEffect(() => {
    if (!editing) {
      setDraftTitle(task.title);
      setDraftColor(task.notes);
    }
  }, [editing, task.title, task.notes]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (isExiting) setEditing(false);
  }, [isExiting]);

  function commitEdit() {
    ctx.saveDivider(task.id, { title: draftTitle, color: draftColor });
    setEditing(false);
  }

  function cancelEdit() {
    setDraftTitle(task.title);
    setDraftColor(task.notes);
    setEditing(false);
  }

  const displayColor = editing
    ? taskDividerColor(draftColor) ?? undefined
    : lineColor ?? undefined;

  return (
    <div
      id={`task-row-${task.id}`}
      style={{
        transform: isExiting
          ? undefined
          : CSS.Transform.toString(transform),
        transition: isExiting ? undefined : transition,
        opacity: isDragging ? 0.35 : undefined,
      }}
      className={cn("relative my-0.5 py-0.5", isExiting && "pointer-events-none")}
    >
      <div
        ref={setNodeRef}
        className={cn(
          "group flex items-center gap-1.5 rounded-md px-2 py-1 text-sm hover:bg-[var(--row-hover)]",
          isExiting && "task-row-exiting",
          ctx.focusTaskId === task.id &&
            !isExiting &&
            "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/25",
        )}
        style={{ paddingLeft: 8 }}
        onAnimationEnd={(e) => {
          if (!isExiting) return;
          if (e.target !== e.currentTarget) return;
          ctx.onTaskExitComplete(task.id);
        }}
      >
        {ctx.manageLists ? (
          <button
            type="button"
            className="cursor-grab touch-none p-0.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100"
            aria-label="Drag to reorder divider"
            title="Drag to reorder"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} />
          </button>
        ) : null}
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEdit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              placeholder="Divider label (optional)"
              className={cn(inputClass, "min-w-0 w-full text-xs")}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[10px] text-[var(--text-muted)]">
                Color
              </span>
              <button
                type="button"
                title="Default"
                aria-label="Default color"
                className={cn(
                  "h-4 w-4 shrink-0 rounded-full border-2 bg-[var(--text)]",
                  !normalizeDividerColor(draftColor)
                    ? "border-[var(--accent)]"
                    : "border-transparent",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  setDraftColor("");
                }}
              />
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  aria-label={`Color ${color}`}
                  className={cn(
                    "h-4 w-4 shrink-0 rounded-full border-2",
                    normalizeDividerColor(draftColor).toLowerCase() ===
                      color.toLowerCase()
                      ? "border-[var(--accent)]"
                      : "border-transparent",
                  )}
                  style={{ backgroundColor: color }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDraftColor(color);
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div
            className="flex min-w-0 flex-1 items-center gap-2"
            onDoubleClick={
              ctx.manageLists
                ? (e) => {
                    e.stopPropagation();
                    setEditing(true);
                  }
                : undefined
            }
          >
            <span
              aria-hidden
              className={cn("h-px min-w-4 flex-1", !displayColor && "bg-[var(--text)]")}
              style={displayColor ? { backgroundColor: displayColor } : undefined}
            />
            {label ? (
              <>
                <span
                  className={cn(
                    "shrink-0 whitespace-nowrap text-xs",
                    !displayColor && "text-[var(--text)]",
                  )}
                  style={displayColor ? { color: displayColor } : undefined}
                >
                  {label}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "h-px min-w-4 flex-1",
                    !displayColor && "bg-[var(--text)]",
                  )}
                  style={
                    displayColor ? { backgroundColor: displayColor } : undefined
                  }
                />
              </>
            ) : null}
          </div>
        )}
        {ctx.manageLists && !editing && !isExiting ? (
          <>
            <button
              type="button"
              className="inline-flex shrink-0 cursor-pointer rounded p-0.5 text-[var(--text-muted)] opacity-0 hover:bg-[var(--row-hover)] hover:text-[var(--text)] group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              aria-label="Edit divider"
              title="Edit divider"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="inline-flex shrink-0 cursor-pointer rounded p-0.5 text-[var(--text-muted)] opacity-0 hover:bg-[var(--row-hover)] hover:text-[var(--status-over)] group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                ctx.deleteDivider(task.id);
              }}
              aria-label="Delete divider"
              title="Delete divider"
            >
              <Trash2 size={14} />
            </button>
          </>
        ) : null}
      </div>
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
  const isExiting = ctx.exitingTaskIds.has(task.id);
  const listLocked = ctx.isListGanttLocked(task.list_id);
  const listManage = ctx.manageLists && !listLocked;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: {
        type: "task",
        listId: task.list_id,
        parentId: task.parent_id,
      } satisfies TaskDragData,
      disabled:
        !listManage ||
        ctx.editingTaskId === task.id ||
        isExiting ||
        task.is_client_review,
    });

  useEffect(() => {
    if (!isExiting) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduced ? 180 : 320;
    const timer = window.setTimeout(() => {
      ctx.onTaskExitComplete(task.id);
    }, ms);
    return () => window.clearTimeout(timer);
    // Intentionally omit ctx — completion is idempotent via exitHandledRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exit once per isExiting
  }, [isExiting, task.id]);

  const assignee = ctx.people.find((p) => p.id === task.assignee_person_id);
  const taskComments = ctx.comments.filter((c) => c.task_id === task.id);
  const hasNotes = notesHasContent(task.notes);
  const kids = depth === 0 ? ctx.childrenMap.get(task.id) ?? [] : [];
  const isExpanded = ctx.expanded.has(task.id);
  const isSelected = ctx.selected.has(task.id);
  const multiSelectDrag =
    listManage && ctx.selected.size > 1 && isSelected;
  const canEditStatus = ctx.allowStatusEdit && !listLocked;
  const isFocused = ctx.focusTaskId === task.id;
  const isEditing = ctx.editingTaskId === task.id && !isExiting;
  const [descExpanded, setDescExpanded] = useState(false);
  const [commentsBlocked, setCommentsBlocked] = useState(false);
  const ordered =
    ctx.orderedListTasksByListId.get(task.list_id) ?? [];
  const tone = taskVisualTone(task, ordered);
  const nestIndent = depth * 16;
  const nestLineLeft =
    depth > 0
      ? 8 +
        (depth - 1) * 16 +
        (ctx.manageLists ? 16 + 6 + 5 - 2 + 3 - 2 : 5 - 2 + 3 - 2) -
        nestIndent
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
          allPeople={ctx.allPeople}
          mentionPeople={ctx.mentionPeople}
          status={task.status}
          depth={0}
          submitLabel="Save"
          initial={{
            title: task.title,
            assignee_person_id: task.assignee_person_id,
            start_date: task.start_date,
            due_date: task.due_date,
            notes: task.notes,
            is_client_review: task.is_client_review,
          }}
          allowClientReview={Boolean(task.parent_id)}
          descriptionViewExpanded={descExpanded}
          onCancel={() => ctx.setEditingTask(null)}
          onSubmit={(draft) => ctx.saveEditingTask(task.id, draft)}
          onDelete={() => ctx.deleteEditingTask(task.id)}
        />
        {depth === 0 && kids.length > 0 ? (
          <SortableContext
            items={kids.map((k) => k.id)}
            strategy={verticalListSortingStrategy}
            disabled={!listManage}
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
        transform: isExiting
          ? undefined
          : CSS.Transform.toString(transform),
        transition: isExiting ? undefined : transition,
        opacity:
          isDragging || ctx.multiDragIds?.has(task.id) ? 0.35 : undefined,
        ...(nestIndent ? { marginLeft: nestIndent } : {}),
      }}
      className={cn(
        "relative my-0.5 py-0.5",
        // Named group only on subtasks so parent hover doesn't clear nest lines.
        depth > 0 && "group/subtask",
        isExiting && "pointer-events-none",
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
          isExiting
            ? "task-row-exiting"
            : isFocused
              ? "bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/25"
              : isExpanded
                ? "bg-[var(--row-hover)]"
                : "hover:bg-[var(--row-hover)]",
        )}
        onAnimationEnd={(e) => {
          if (!isExiting) return;
          if (e.target !== e.currentTarget) return;
          ctx.onTaskExitComplete(task.id);
        }}
      >
      {/* Measure only the row so parents with subtasks don't block top drops. */}
      <div
        ref={setNodeRef}
        className={cn(
          "group flex items-center gap-1.5 px-2 py-1 text-sm",
          task.status === "complete" && "text-[var(--task-complete-fg)]",
          isSelected && "bg-[var(--accent)]/10",
          multiSelectDrag
            ? "cursor-grab touch-none active:cursor-grabbing"
            : !ctx.readOnly && "cursor-pointer",
        )}
        style={{ paddingLeft: 8 }}
        title={
          multiSelectDrag ? "Drag to move all selected tasks" : undefined
        }
        {...(multiSelectDrag ? { ...attributes, ...listeners } : {})}
        onClick={
          ctx.readOnly || multiSelectDrag
            ? undefined
            : () => {
                ctx.toggleExpand(task.id);
              }
        }
      >
        {listManage && !task.is_client_review ? (
          <button
            type="button"
            className={cn(
              "touch-none p-0.5 text-[var(--text-muted)]",
              multiSelectDrag
                ? "cursor-grab opacity-100"
                : "cursor-grab opacity-0 group-hover:opacity-100",
              depth > 0 && "-translate-x-2",
            )}
            aria-label="Drag to reorder, nest, or move to another list"
            title={
              multiSelectDrag
                ? "Drag to move all selected tasks"
                : "Drag vertically to reorder or move lists. Drag right to nest, left to un-nest."
            }
            {...(multiSelectDrag ? {} : { ...attributes, ...listeners })}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} />
          </button>
        ) : listManage ? (
          <span className="w-[18px] shrink-0" aria-hidden />
        ) : null}
        {isClientReviewOpen(task) || isClientReviewApproved(task) ? (
          <button
            type="button"
            className={cn(
              "inline-flex shrink-0 cursor-pointer items-center justify-center",
              !canEditStatus && "cursor-not-allowed opacity-60",
            )}
            title={
              isClientReviewApproved(task)
                ? "Client Review approved"
                : "Client Review open"
            }
            aria-label={
              isClientReviewApproved(task)
                ? "Client Review approved. Click to reopen."
                : "Client Review open. Click to approve."
            }
            disabled={!canEditStatus}
            onPointerDown={(e) => multiSelectDrag && e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!canEditStatus) return;
              ctx.cycleStatus(task);
            }}
          >
            <Star
              size={10}
              className={cn(
                "h-2.5 w-2.5",
                isClientReviewApproved(task)
                  ? "fill-[var(--status-healthy)] text-[var(--status-healthy)]"
                  : "fill-[#f59e0b] text-[#f59e0b]",
              )}
              aria-hidden
            />
          </button>
        ) : tone === "downstream_locked" ? (
          <span
            className="h-2.5 w-2.5 shrink-0 cursor-not-allowed rounded-sm bg-[#f59e0b] opacity-60"
            title="Blocked by open Client Review above"
            aria-label="Blocked by open Client Review above"
          />
        ) : (
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
            onPointerDown={(e) => multiSelectDrag && e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (!canEditStatus) return;
              ctx.cycleStatus(task);
            }}
          />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {ctx.hubTaskHref ? (
            <Link
              href={ctx.hubTaskHref(task.id)}
              className="min-w-0 truncate hover:underline"
              onPointerDown={(e) => multiSelectDrag && e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <span
                className={cn(
                  task.status === "complete" && "line-through",
                  isClientReviewApproved(task) &&
                    "text-[var(--status-healthy)] line-through",
                )}
              >
                {task.title}
              </span>
            </Link>
          ) : (
            <span
              className={cn(
                "min-w-0 truncate",
                task.status === "complete" && "line-through",
                isClientReviewApproved(task) &&
                  "text-[var(--status-healthy)] line-through",
              )}
            >
              {task.title}
            </span>
          )}
          {!ctx.compact && assignee ? <InitialsAvatar person={assignee} /> : null}
          {!ctx.readOnly &&
          (taskComments.length > 0 ||
            ctx.unreadTaskThreadIds.has(task.id)) ? (
            <TaskCommentIndicator
              unread={ctx.unreadTaskThreadIds.has(task.id)}
              count={taskComments.length}
              expanded={isExpanded}
            />
          ) : null}
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
              align={ctx.compact && ctx.readOnly ? "end" : "center"}
              content={
                <span className="whitespace-pre-wrap">
                  {notesPreviewText(task.notes, 20)}
                </span>
              }
            >
              <StickyNote
                size={16}
                className="ml-1 mr-0.5 shrink-0 text-[var(--text-muted)]"
                aria-label="Task description"
              />
            </Tooltip>
          ) : null}
          {ctx.canManage && !ctx.readOnly && listManage ? (
            <button
              type="button"
              className="inline-flex shrink-0 cursor-pointer rounded p-0.5 text-[var(--text-muted)] opacity-0 hover:bg-[var(--row-hover)] hover:text-[var(--accent)] group-hover:opacity-100"
              onPointerDown={(e) => multiSelectDrag && e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                ctx.setEditingTask(task);
              }}
              aria-label="Edit task"
              title="Edit task"
            >
              <Pencil size={14} />
            </button>
          ) : null}
        </div>
        {listManage && depth === 0 ? (
          <button
            type="button"
            className="inline-flex cursor-pointer rounded p-0.5 text-[var(--text-muted)] opacity-0 hover:bg-[var(--row-hover)] hover:text-[var(--accent)] group-hover:opacity-100"
            onPointerDown={(e) => multiSelectDrag && e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              ctx.addSubtask(task.list_id, task.id);
            }}
            aria-label="Add subtask"
            title="Add subtask"
          >
            <Plus size={14} />
          </button>
        ) : null}
        {!ctx.compact ? (
          <TaskStatusTag status={task.status} className="shrink-0" />
        ) : null}
        {ctx.allowSelect ? (
          <Checkbox
            checked={isSelected}
            onPointerDown={(e) => multiSelectDrag && e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const shiftKey =
                "shiftKey" in e.nativeEvent
                  ? Boolean(e.nativeEvent.shiftKey)
                  : false;
              ctx.toggleSelect(task.id, shiftKey);
            }}
            aria-label={`Select ${task.title}`}
          />
        ) : null}
      </div>
      {!ctx.readOnly ? (
        <ExpandPanel open={isExpanded}>
          <div className="pb-3 pr-2 pt-3" style={{ paddingLeft: 8 }}>
            <div className="flex gap-1.5">
              <span className="w-4 shrink-0" aria-hidden />
              <span className="w-2.5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1 space-y-8">
                {hasNotes ? (
                  <TaskDescriptionView
                    html={task.notes}
                    taskId={task.id}
                    assigneePersonId={task.assignee_person_id}
                    viewerPersonId={ctx.myPersonId}
                    viewerProfileId={ctx.profileId}
                    taskExpanded={isExpanded}
                    onExpandedChange={setDescExpanded}
                    onCommentsBlockedChange={setCommentsBlocked}
                  />
                ) : null}
                <TaskDescriptionCommentsGate blocked={commentsBlocked}>
                  <CommentThread
                    task={task}
                    comments={taskComments}
                    ctx={ctx}
                    commentsDisabled={commentsBlocked}
                  />
                </TaskDescriptionCommentsGate>
                <TaskActivityMeta task={task} ctx={ctx} />
              </div>
            </div>
          </div>
        </ExpandPanel>
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

function profileDisplayName(
  profileId: string | null | undefined,
  ctx: BoardCtx,
): string | null {
  if (!profileId) return null;
  const author = ctx.profiles.find((p) => p.id === profileId);
  const authorPerson = ctx.people.find((p) => p.profile_id === profileId);
  return author?.full_name || authorPerson?.name || null;
}

function formatTaskActivityTime(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d, yyyy · h:mm a");
  } catch {
    return iso;
  }
}

function TaskActivityMeta({ task, ctx }: { task: Task; ctx: BoardCtx }) {
  const createdBy = profileDisplayName(task.created_by_profile_id, ctx);
  const editedBy = profileDisplayName(task.edited_by_profile_id, ctx);
  const changedBy = profileDisplayName(task.status_changed_by_profile_id, ctx);
  const createdAt = task.created_at
    ? formatTaskActivityTime(task.created_at)
    : null;
  const editedAt = task.edited_at
    ? formatTaskActivityTime(task.edited_at)
    : null;
  const changedAt = task.status_changed_at
    ? formatTaskActivityTime(task.status_changed_at)
    : null;

  const parts: ReactNode[] = [];
  if (createdAt) {
    parts.push(
      <span key="created">
        Created {createdAt}
        {createdBy ? (
          <>
            {" "}
            by <span className="text-[var(--text)]">{createdBy}</span>
          </>
        ) : null}
      </span>,
    );
  }
  if (editedAt) {
    parts.push(
      <span key="edited">
        Edited {editedAt}
        {editedBy ? (
          <>
            {" "}
            by <span className="text-[var(--text)]">{editedBy}</span>
          </>
        ) : null}
      </span>,
    );
  }
  if (changedAt) {
    parts.push(
      <span key="status">
        Status set to{" "}
        <span className="text-[var(--text)]">
          {taskStatusLabel(task.status)}
        </span>{" "}
        {changedAt}
        {changedBy ? (
          <>
            {" "}
            by <span className="text-[var(--text)]">{changedBy}</span>
          </>
        ) : null}
      </span>,
    );
  }

  if (parts.length === 0) return null;

  return (
    <p className="text-xs text-[var(--text-muted)]">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <span aria-hidden> · </span> : null}
          {part}
        </Fragment>
      ))}
    </p>
  );
}

function CommentThread({
  task,
  comments,
  ctx,
  commentsDisabled = false,
}: {
  task: Task;
  comments: TaskComment[];
  ctx: BoardCtx;
  commentsDisabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [replying, setReplying] = useState(false);
  const sorted = [...comments].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  useEffect(() => {
    if (!ctx.profileId) return;
    const stored = readCommentDraft(ctx.profileId, task.id);
    if (!notesHasContent(stored)) return;
    setDraft(stored);
    setReplying(true);
  }, [ctx.profileId, task.id]);

  function updateDraft(html: string) {
    setDraft(html);
    writeCommentDraft(ctx.profileId, task.id, html);
  }

  function cancelReply() {
    setDraft("");
    setReplying(false);
    clearCommentDraft(ctx.profileId, task.id);
  }

  function submitReply() {
    if (!notesHasContent(draft)) return;
    ctx.addComment(task.id, draft, extractMentionPersonIds(draft));
    setDraft("");
    setReplying(false);
    clearCommentDraft(ctx.profileId, task.id);
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
              onChange={updateDraft}
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
            className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-[color-mix(in_srgb,var(--text)_22%,transparent)] px-2.5 text-xs text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={commentsDisabled}
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
  const [confirmDelete, setConfirmDelete] = useState(false);
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
            {wasEdited && comment.updated_at ? (
              <span className="ml-1 italic">
                · edited{" "}
                {format(parseISO(comment.updated_at), "MMM d, yyyy · h:mm a")}
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
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
      {confirmDelete ? (
        <ConfirmDialog
          title="Delete comment?"
          message="Delete this comment? This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            ctx.deleteComment(comment.id);
          }}
        />
      ) : null}
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

function statusCardTone(
  status: TaskStatus,
  visualTone: TaskVisualTone = "normal",
) {
  if (
    visualTone === "client_review_open" ||
    visualTone === "downstream_locked"
  ) {
    return {
      bar: "bg-[#f59e0b]",
      shell: "border-[#f59e0b]/35 bg-[#f59e0b]/10",
    };
  }
  if (visualTone === "client_review_approved") {
    return {
      bar: "bg-[var(--status-healthy)]",
      shell: "border-[var(--status-healthy)]/35 bg-[var(--status-healthy)]/10",
    };
  }
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
  orderedListTasks,
  manageLists,
  onMove,
}: {
  tasks: Task[];
  orderedListTasks: Task[];
  manageLists: boolean;
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
    const activeTask = tasks.find((t) => t.id === active.id);
    if (activeTask) {
      const tone = taskVisualTone(activeTask, orderedListTasks);
      if (tone === "downstream_locked") return;
      if (activeTask.is_client_review) {
        if (destStatus !== "upcoming" && destStatus !== "complete") return;
      }
    }
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
            orderedListTasks={orderedListTasks}
            manageLists={manageLists}
            activeId={activeId}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <KanbanCardFace
            task={activeTask}
            orderedListTasks={orderedListTasks}
            dragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  tasks,
  orderedListTasks,
  manageLists,
  activeId,
}: {
  status: TaskStatus;
  tasks: Task[];
  orderedListTasks: Task[];
  manageLists: boolean;
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
              orderedListTasks={orderedListTasks}
              manageLists={manageLists}
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
  orderedListTasks = [],
  dragging = false,
}: {
  task: Task;
  orderedListTasks?: Task[];
  dragging?: boolean;
}) {
  const visualTone = taskVisualTone(task, orderedListTasks);
  const tone = statusCardTone(task.status, visualTone);

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
      <span
        className={cn(
          "block w-full text-left",
          task.status === "complete" &&
            "text-[var(--task-complete-fg)] line-through",
          isClientReviewApproved(task) &&
            "text-[var(--status-healthy)] line-through",
        )}
      >
        {task.title}
      </span>
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
  orderedListTasks,
  manageLists,
  isOverlaySource,
}: {
  task: Task;
  orderedListTasks: Task[];
  manageLists: boolean;
  isOverlaySource: boolean;
}) {
  const tone = taskVisualTone(task, orderedListTasks);
  const dragDisabled =
    !manageLists || tone === "downstream_locked";

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "card", status: task.status } satisfies CardDragData,
      disabled: dragDisabled,
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging || isOverlaySource ? 0.35 : 1,
      }}
      className={cn(manageLists && !dragDisabled && "cursor-grab touch-none")}
      {...(dragDisabled ? {} : { ...attributes, ...listeners })}
    >
      <KanbanCardFace task={task} orderedListTasks={orderedListTasks} />
    </div>
  );
}

