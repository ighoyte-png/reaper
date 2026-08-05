"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { startOfDay } from "date-fns";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  Star,
} from "lucide-react";
import { PersonAvatar } from "@/components/people/person-avatar";
import { buttonClass } from "@/components/ui/button";
import { DateInput, Field } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { RichNotesHtml } from "@/components/ui/simple-rich-text";
import { ScheduleRowHitLayer } from "@/components/schedule/schedule-row-hit-layer";
import { useData } from "@/lib/data/store";
import { cn } from "@/lib/cn";
import { shiftWeek, toDateKey, weekStart } from "@/lib/domain/dates";
import {
  barPastFutureSplit,
  calendarDayDelta,
  clampDateRange,
  ganttListsForProject,
  ganttTasksForList,
  GANTT_DAY_W_DESKTOP,
  GANTT_DAY_W_NARROW,
  GANTT_HATCH_STYLE,
  GANTT_LABEL_PX,
  GANTT_LIST_ROW_H,
  GANTT_TASK_ROW_H,
  listBarColor,
  resolveListBarDates,
  resolveTaskBarDates,
  shiftDateKey,
  taskBarColor,
  taskShowsClientReviewStar,
  type GanttBarDates,
} from "@/lib/domain/gantt";
import { projectAssigneePeople } from "@/lib/domain/project-access";
import { personAvatarColor } from "@/lib/domain/people";
import {
  canCompleteTask,
  isDownstreamOfOpenClientReview,
  listDisplayOrder,
  taskStatusLabel,
} from "@/lib/domain/tasks";
import { notesHasContent } from "@/lib/notes-html";
import {
  buildScheduleColumns,
  columnAtOffsetPx,
  columnOffsetPx,
  spanColumnsPx,
  type ScheduleColumn,
} from "@/lib/domain/schedule-zoom";
import type {
  Person,
  ProjectMember,
  Task,
  TaskComment,
  TaskList,
  TaskStatus,
} from "@/lib/types";

type Props = {
  projectId: string;
  readOnly?: boolean;
  showAssignees?: boolean;
  showDrawer?: boolean;
  className?: string;
};

type DrawerTab = "edit" | "description" | "comments";

type DragMode = "move" | "resize-start" | "resize-end";

type DragTarget =
  | { kind: "list"; listId: string }
  | { kind: "task"; taskId: string };

type DragSnapshot = {
  target: DragTarget;
  mode: DragMode;
  originStart: string;
  originEnd: string;
  previewStart: string;
  previewEnd: string;
  /** Live preview geometry keyed by task id or `list:{id}`. */
  previewMap: Map<string, GanttBarDates>;
  /** Task ids included in this drag (multi-select or single). */
  taskIds: string[];
  /** For list move: all tasks in the list at drag start. */
  listTaskOrigins: Map<string, GanttBarDates>;
  dirty: boolean;
  pointerId: number;
  didMove: boolean;
};

const EDGE_SCROLL_PX = 40;
const EDGE_SCROLL_SPEED = 14;
const CLICK_MOVE_THRESHOLD = 4;

function todayKey() {
  return toDateKey(startOfDay(new Date()));
}

function NavBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function GanttBarVisual({
  dates,
  columns,
  today,
  color,
  height,
  label,
  title,
  selected,
  readOnly,
  showAssignee,
  assignee,
  emphasizeTop,
  onPointerDownBar,
  onPointerDownResizeStart,
  onPointerDownResizeEnd,
  onClick,
}: {
  dates: GanttBarDates;
  columns: ScheduleColumn[];
  today: string;
  color: string;
  height: number;
  label?: string;
  title: string;
  selected?: boolean;
  readOnly?: boolean;
  showAssignee?: boolean;
  assignee?: Person | null;
  /** Task List parent bars: darker strip on the top 1/8. */
  emphasizeTop?: boolean;
  onPointerDownBar?: (e: ReactPointerEvent) => void;
  onPointerDownResizeStart?: (e: ReactPointerEvent) => void;
  onPointerDownResizeEnd?: (e: ReactPointerEvent) => void;
  onClick?: () => void;
}) {
  const geo = spanColumnsPx(columns, dates.startKey, dates.endKey);
  if (!geo) return null;

  const { pastFraction, hasFuture } = barPastFutureSplit(
    dates.startKey,
    dates.endKey,
    today,
  );
  const showLabel = geo.width >= 36 && label;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute z-10 flex items-center overflow-hidden rounded-sm",
        !readOnly && "cursor-grab active:cursor-grabbing",
        selected && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]",
      )}
      style={{
        left: geo.left,
        width: geo.width,
        height,
        top: "50%",
        transform: "translateY(-50%)",
      }}
      title={title}
      onClick={onClick}
      onPointerDown={readOnly ? undefined : onPointerDownBar}
    >
      <div
        className="relative h-full min-w-0 flex-1 overflow-hidden rounded-sm"
        style={{ backgroundColor: color }}
      >
        {emphasizeTop ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-[1] bg-black/20"
            style={{ height: "12.5%" }}
            aria-hidden
          />
        ) : null}
        {hasFuture ? (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 overflow-hidden rounded-r-sm"
            style={{
              left: `${pastFraction * 100}%`,
            }}
          >
            <div
              className="absolute inset-0 rounded-r-sm"
              style={GANTT_HATCH_STYLE}
              aria-hidden
            />
          </div>
        ) : null}
        {showLabel ? (
          <span className="pointer-events-none absolute inset-0 flex items-center truncate px-1.5 text-xs font-medium text-white">
            {label}
          </span>
        ) : null}
      </div>
      {showAssignee && assignee ? (
        <PersonAvatar
          avatarUrl={assignee.avatar_url}
          name={assignee.name}
          size="xs"
          fallback="initials"
          color={personAvatarColor(assignee)}
          className="ml-1 shrink-0 ring-1 ring-[var(--border)]"
        />
      ) : null}
      {!readOnly ? (
        <>
          <span
            className="absolute left-0 top-0 z-20 h-full w-2 cursor-ew-resize"
            onPointerDown={onPointerDownResizeStart}
          />
          <span
            className="absolute right-0 top-0 z-20 h-full w-2 cursor-ew-resize"
            onPointerDown={onPointerDownResizeEnd}
          />
        </>
      ) : null}
    </div>
  );
}

function ReadOnlyComments({
  taskId,
  comments,
  people,
  profiles,
}: {
  taskId: string;
  comments: TaskComment[];
  people: Person[];
  profiles: { id: string; full_name: string }[];
}) {
  const sorted = comments
    .filter((c) => c.task_id === taskId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (sorted.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">No comments yet</p>;
  }

  return (
    <div className="space-y-3">
      {sorted.map((c) => {
        const author = profiles.find((p) => p.id === c.author_profile_id);
        const authorPerson = people.find(
          (p) => p.profile_id === c.author_profile_id,
        );
        const name = author?.full_name || authorPerson?.name || "Someone";
        return (
          <div
            key={c.id}
            className="rounded-md border border-[var(--border)] bg-[var(--comment-bg)] p-3 text-sm"
          >
            <p className="mb-1 text-xs font-semibold">{name}</p>
            <div className="text-sm leading-relaxed">
              <RichNotesHtml html={c.body} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GanttDrawer({
  project,
  selectedTaskIds,
  tasks,
  lists,
  people,
  projectMembers,
  profiles,
  comments,
  myPersonId,
  onClose,
  onSaveTasks,
}: {
  project: { id: string; manager_person_id: string | null };
  selectedTaskIds: string[];
  tasks: Task[];
  lists: TaskList[];
  people: Person[];
  projectMembers: ProjectMember[];
  profiles: { id: string; full_name: string }[];
  comments: TaskComment[];
  myPersonId: string | null;
  onClose: () => void;
  onSaveTasks: (updates: Task[]) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("edit");
  const selectedTasks = useMemo(
    () => tasks.filter((t) => selectedTaskIds.includes(t.id)),
    [tasks, selectedTaskIds],
  );
  const multi = selectedTasks.length > 1;
  const task = selectedTasks.length === 1 ? selectedTasks[0] : null;
  const list = task ? lists.find((l) => l.id === task.list_id) : null;

  const [status, setStatus] = useState<TaskStatus>("upcoming");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (multi) {
      setStartDate("");
      setEndDate("");
      return;
    }
    if (!task) return;
    setStatus(task.status);
    setAssigneeId(task.assignee_person_id ?? "");
    setStartDate(task.start_date ?? "");
    setEndDate(task.due_date ?? "");
    setTab("edit");
  }, [task?.id, multi, task, selectedTaskIds.join(",")]);

  const assigneeOptions = useMemo(() => {
    if (!task) return [];
    return projectAssigneePeople(project.id, people, projectMembers, {
      managerPersonId: project.manager_person_id,
      includePersonId: task.assignee_person_id,
    });
  }, [project.id, project.manager_person_id, people, task, projectMembers]);

  const canComplete = task
    ? canCompleteTask(myPersonId, task, people, project)
    : false;

  const orderedListTasks = useMemo(() => {
    if (!task) return [];
    return listDisplayOrder(
      tasks.filter((t) => t.list_id === task.list_id && !t.is_divider),
    );
  }, [task, tasks]);

  const downstreamLocked = Boolean(
    task && isDownstreamOfOpenClientReview(task.id, orderedListTasks),
  );

  function applySingle() {
    if (!task) return;
    if (downstreamLocked) return;
    if (task.is_client_review) {
      const nextStatus = status;
      if (nextStatus === "complete" && !canComplete) return;
      if (nextStatus !== "upcoming" && nextStatus !== "complete") return;
      onSaveTasks([
        {
          ...task,
          status: nextStatus,
          assignee_person_id: assigneeId || null,
          start_date: startDate || null,
          due_date: endDate || null,
        },
      ]);
      return;
    }
    const next: Task = {
      ...task,
      status: status === "complete" && !canComplete ? task.status : status,
      assignee_person_id: assigneeId || null,
      start_date: startDate || null,
      due_date: endDate || null,
    };
    onSaveTasks([next]);
  }

  function applyBulkDates() {
    if (!multi) return;
    const updates = selectedTasks.map((t) => ({
      ...t,
      ...(startDate ? { start_date: startDate } : {}),
      ...(endDate ? { due_date: endDate } : {}),
    }));
    onSaveTasks(updates);
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <p className="truncate text-sm font-semibold">
          {multi
            ? `${selectedTasks.length} tasks`
            : task?.title ?? "Task"}
        </p>
        <button
          type="button"
          className={buttonClass({ variant: "ghost", size: "sm" })}
          onClick={onClose}
          aria-label="Close panel"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {!multi && task ? (
        <div className="flex border-b border-[var(--border)]">
          {(["edit", "description", "comments"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={cn(
                "flex-1 border-b-2 px-2 py-2 text-xs font-medium capitalize",
                tab === t
                  ? "border-[var(--accent)] text-[var(--text)]"
                  : "border-transparent text-[var(--text-muted)]",
              )}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {multi ? (
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-muted)]">
              Bulk edit dates for {selectedTasks.length} selected tasks.
            </p>
            <Field label="Start date">
              <DateInput
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="End date">
              <DateInput
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className={buttonClass({ className: "w-full" })}
              onClick={applyBulkDates}
              disabled={!startDate && !endDate}
            >
              Apply dates
            </button>
          </div>
        ) : tab === "edit" && task ? (
          <div className="space-y-3">
            <Field label="Status">
              <Select
                value={status}
                onChange={(v) => setStatus(v as TaskStatus)}
                disabled={downstreamLocked}
                options={
                  task.is_client_review
                    ? (["upcoming", "complete"] as const).map((s) => ({
                        value: s,
                        label: s === "upcoming" ? "Open" : "Approved",
                        disabled: s === "complete" && !canComplete,
                      }))
                    : (["upcoming", "active", "complete"] as const).map(
                        (s) => ({
                          value: s,
                          label: taskStatusLabel(s),
                          disabled: s === "complete" && !canComplete,
                        }),
                      )
                }
              />
            </Field>
            <Field label="Assignee">
              <Select
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
            </Field>
            <Field label="Start date">
              <DateInput
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="End date">
              <DateInput
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className={buttonClass({ className: "w-full" })}
              onClick={applySingle}
            >
              Save
            </button>
          </div>
        ) : tab === "description" && task ? (
          notesHasContent(task.notes) ? (
            <div className="text-sm leading-relaxed">
              <RichNotesHtml html={task.notes} />
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">No description</p>
          )
        ) : task ? (
          <ReadOnlyComments
            taskId={task.id}
            comments={comments}
            people={people}
            profiles={profiles}
          />
        ) : null}
      </div>
    </aside>
  );
}

export function ProjectGanttBoard({
  projectId,
  readOnly = false,
  showAssignees = true,
  showDrawer = true,
  className,
}: Props) {
  const { state, upsertTask, upsertTaskList, myPerson } = useData();
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSnapshot | null>(null);
  const dragStartClient = useRef({ x: 0, y: 0 });
  const edgeScrollRaf = useRef(0);

  const [anchor, setAnchor] = useState(() => weekStart(new Date()));
  const [expandedLists, setExpandedLists] = useState<Set<string>>(() => new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dragVersion, setDragVersion] = useState(0);
  const [containerNarrow, setContainerNarrow] = useState(false);

  const today = todayKey();
  const dayW = containerNarrow ? GANTT_DAY_W_NARROW : GANTT_DAY_W_DESKTOP;

  const project = state.projects.find((p) => p.id === projectId) ?? null;
  const ganttLists = useMemo(
    () => ganttListsForProject(state.task_lists, projectId),
    [state.task_lists, projectId],
  );
  const projectTasks = useMemo(
    () => state.tasks.filter((t) => t.project_id === projectId),
    [state.tasks, projectId],
  );

  const fallbackKey = useMemo(
    () => toDateKey(weekStart(anchor)),
    [anchor],
  );

  const { columns, totalWidth, rangeLabel } = useMemo(
    () =>
      buildScheduleColumns({
        zoom: "day",
        anchor,
        todayKey: today,
        dayW,
        isNarrow: false,
      }),
    [anchor, today, dayW],
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerNarrow(entry.contentRect.width < 640);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setExpandedLists((prev) => {
      const next = new Set(prev);
      for (const list of ganttLists) next.add(list.id);
      return next;
    });
  }, [ganttLists]);

  const headerGroups = useMemo(() => {
    type Group = {
      label: string;
      width: number;
      groupIndex: number;
      isCurrent: boolean;
      weekOfYear: number | null;
      year: number;
      cornerLabel: string | null;
    };
    const groups: Group[] = [];
    for (const col of columns) {
      const last = groups[groups.length - 1];
      if (
        last &&
        last.label === col.groupLabel &&
        last.groupIndex === col.groupIndex
      ) {
        last.width += col.width;
        last.isCurrent = last.isCurrent || col.isCurrentWeek;
      } else {
        groups.push({
          label: col.groupLabel,
          width: col.width,
          groupIndex: col.groupIndex,
          isCurrent: col.isCurrentWeek,
          weekOfYear: col.weekOfYear,
          year: col.year,
          cornerLabel:
            col.weekOfYear != null ? `W${col.weekOfYear}` : null,
        });
      }
    }
    return groups;
  }, [columns]);

  const listSections = useMemo(() => {
    return ganttLists.map((list) => {
      const tasks = ganttTasksForList(projectTasks, list.id);
      const milestone = list.milestone_id
        ? state.milestones.find((m) => m.id === list.milestone_id) ?? null
        : null;
      return { list, tasks, milestone };
    });
  }, [ganttLists, projectTasks, state.milestones]);

  const totalBodyHeight = useMemo(() => {
    let h = 0;
    for (const { list, tasks, milestone } of listSections) {
      h += GANTT_LIST_ROW_H;
      if (expandedLists.has(list.id)) {
        h += tasks.length * GANTT_TASK_ROW_H;
        if (milestone) h += GANTT_TASK_ROW_H;
      }
    }
    return Math.max(h, GANTT_LIST_ROW_H);
  }, [listSections, expandedLists]);

  const toggleListExpanded = useCallback((listId: string) => {
    setExpandedLists((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });
  }, []);

  const toggleTaskSelect = useCallback(
    (taskId: string, metaKey: boolean) => {
      setSelectedTaskIds((prev) => {
        if (metaKey) {
          const set = new Set(prev);
          if (set.has(taskId)) set.delete(taskId);
          else set.add(taskId);
          return [...set];
        }
        return [taskId];
      });
    },
    [],
  );

  const bumpDragPreview = useCallback((map: Map<string, GanttBarDates>) => {
    const snap = dragRef.current;
    if (!snap) return;
    snap.previewMap = map;
    setDragVersion((v) => v + 1);
  }, []);

  const getTaskDates = useCallback(
    (task: Task, list: TaskList): GanttBarDates => {
      const preview = dragRef.current?.previewMap.get(task.id);
      if (preview) return preview;
      return resolveTaskBarDates(task, list, fallbackKey);
    },
    [fallbackKey, dragVersion],
  );

  const getListDates = useCallback(
    (list: TaskList): GanttBarDates => {
      const preview = dragRef.current?.previewMap.get(`list:${list.id}`);
      if (preview) return preview;
      return resolveListBarDates(list, fallbackKey);
    },
    [fallbackKey, dragVersion],
  );

  const stopEdgeScroll = useCallback(() => {
    if (edgeScrollRaf.current) {
      cancelAnimationFrame(edgeScrollRaf.current);
      edgeScrollRaf.current = 0;
    }
  }, []);

  const runEdgeScroll = useCallback((clientX: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const labelEdge = rect.left + GANTT_LABEL_PX;
    let dx = 0;
    if (clientX < labelEdge + EDGE_SCROLL_PX) {
      dx = -EDGE_SCROLL_SPEED;
    } else if (clientX > rect.right - EDGE_SCROLL_PX) {
      dx = EDGE_SCROLL_SPEED;
    }
    if (dx === 0) {
      stopEdgeScroll();
      return;
    }
    el.scrollLeft += dx;
    edgeScrollRaf.current = requestAnimationFrame(() => runEdgeScroll(clientX));
  }, [stopEdgeScroll]);

  const columnFromClientX = useCallback(
    (clientX: number): ScheduleColumn | null => {
      const scrollEl = scrollRef.current;
      if (!scrollEl || columns.length === 0) return null;
      const rect = scrollEl.getBoundingClientRect();
      const x =
        clientX - rect.left + scrollEl.scrollLeft - GANTT_LABEL_PX;
      return columnAtOffsetPx(columns, x);
    },
    [columns],
  );

  const applyDragToColumn = useCallback(
    (col: ScheduleColumn) => {
      const snap = dragRef.current;
      if (!snap) return;

      if (snap.target.kind === "list") {
        const listId = snap.target.listId;
        const list = ganttLists.find((l) => l.id === listId);
        if (!list) return;
        if (snap.mode === "move") {
          const delta = calendarDayDelta(snap.originStart, col.startKey);
          if (delta === 0) return;
          snap.dirty = true;
          snap.didMove = true;
          const newList = {
            startKey: shiftDateKey(snap.originStart, delta),
            endKey: shiftDateKey(snap.originEnd, delta),
          };
          const preview = new Map<string, GanttBarDates>();
          preview.set(`list:${list.id}`, newList);
          for (const [taskId, orig] of snap.listTaskOrigins) {
            preview.set(taskId, {
              startKey: shiftDateKey(orig.startKey, delta),
              endKey: shiftDateKey(orig.endKey, delta),
            });
          }
          snap.previewStart = newList.startKey;
          snap.previewEnd = newList.endKey;
          bumpDragPreview(preview);
        } else if (snap.mode === "resize-end") {
          const end = col.endKey >= snap.originStart ? col.endKey : snap.originStart;
          if (end === snap.previewEnd) return;
          snap.dirty = true;
          snap.didMove = true;
          snap.previewEnd = end;
          const next = new Map(snap.previewMap);
          next.set(`list:${list.id}`, {
            startKey: snap.originStart,
            endKey: end,
          });
          bumpDragPreview(next);
        } else if (snap.mode === "resize-start") {
          const start =
            col.startKey <= snap.originEnd ? col.startKey : snap.originEnd;
          if (start === snap.previewStart) return;
          snap.dirty = true;
          snap.didMove = true;
          snap.previewStart = start;
          const next = new Map(snap.previewMap);
          next.set(`list:${list.id}`, {
            startKey: start,
            endKey: snap.originEnd,
          });
          bumpDragPreview(next);
        }
        return;
      }

      const taskId = snap.target.taskId;
      const task = projectTasks.find((t) => t.id === taskId);
      if (!task) return;
      const list = ganttLists.find((l) => l.id === task.list_id);
      if (!list) return;

      const applyToTasks = (mutate: (orig: GanttBarDates) => GanttBarDates) => {
        snap.dirty = true;
        snap.didMove = true;
        const preview = new Map<string, GanttBarDates>();
        for (const id of snap.taskIds) {
          const t = projectTasks.find((x) => x.id === id);
          if (!t) continue;
          const l = ganttLists.find((x) => x.id === t.list_id) ?? list;
          const orig =
            id === taskId
              ? { startKey: snap.originStart, endKey: snap.originEnd }
              : resolveTaskBarDates(t, l, fallbackKey);
          preview.set(id, mutate(orig));
        }
        bumpDragPreview(preview);
      };

      if (snap.mode === "move") {
        const delta = calendarDayDelta(snap.originStart, col.startKey);
        if (delta === 0) return;
        applyToTasks((orig) => ({
          startKey: shiftDateKey(orig.startKey, delta),
          endKey: shiftDateKey(orig.endKey, delta),
        }));
      } else if (snap.mode === "resize-end") {
        const endDelta = calendarDayDelta(snap.originEnd, col.endKey);
        if (endDelta === 0) return;
        applyToTasks((orig) => ({
          startKey: orig.startKey,
          endKey: shiftDateKey(orig.endKey, endDelta),
        }));
      } else if (snap.mode === "resize-start") {
        const startDelta = calendarDayDelta(snap.originStart, col.startKey);
        if (startDelta === 0) return;
        applyToTasks((orig) => ({
          startKey: shiftDateKey(orig.startKey, startDelta),
          endKey: orig.endKey,
        }));
      }
    },
    [ganttLists, projectTasks, fallbackKey, bumpDragPreview],
  );

  const commitDrag = useCallback(() => {
    const snap = dragRef.current;
    const previewMap = snap?.previewMap ?? new Map<string, GanttBarDates>();
    dragRef.current = null;
    setDragging(false);
    stopEdgeScroll();

    if (!snap) {
      setDragVersion((v) => v + 1);
      return;
    }

    if (
      !snap.dirty &&
      !snap.didMove &&
      snap.target.kind === "task" &&
      showDrawer &&
      !readOnly
    ) {
      setDragVersion((v) => v + 1);
      setSelectedTaskIds([snap.target.taskId]);
      return;
    }

    if (!snap.dirty) {
      setDragVersion((v) => v + 1);
      return;
    }

    if (snap.target.kind === "list") {
      const listId = snap.target.listId;
      const list = ganttLists.find((l) => l.id === listId);
      if (!list) {
        setDragVersion((v) => v + 1);
        return;
      }
      const listDates = clampDateRange(snap.previewStart, snap.previewEnd);
      upsertTaskList({
        ...list,
        start_date: listDates.startKey,
        end_date: listDates.endKey,
      });
      for (const [taskId, orig] of snap.listTaskOrigins) {
        const preview = previewMap.get(taskId);
        if (!preview) continue;
        const task = projectTasks.find((t) => t.id === taskId);
        if (!task) continue;
        upsertTask({
          ...task,
          start_date:
            task.start_date != null || preview.startKey !== orig.startKey
              ? preview.startKey
              : null,
          due_date:
            task.due_date != null || preview.endKey !== orig.endKey
              ? preview.endKey
              : null,
        });
      }
      setDragVersion((v) => v + 1);
      return;
    }

    for (const taskId of snap.taskIds) {
      const preview = previewMap.get(taskId);
      const task = projectTasks.find((t) => t.id === taskId);
      if (!task || !preview) continue;
      upsertTask({
        ...task,
        start_date: preview.startKey,
        due_date: preview.endKey,
      });
    }
    setDragVersion((v) => v + 1);
  }, [
    ganttLists,
    projectTasks,
    upsertTask,
    upsertTaskList,
    stopEdgeScroll,
    showDrawer,
    readOnly,
  ]);

  const startDrag = useCallback(
    (
      e: ReactPointerEvent,
      target: DragTarget,
      mode: DragMode,
      dates: GanttBarDates,
      taskIds: string[],
      listTaskOrigins?: Map<string, GanttBarDates>,
    ) => {
      if (readOnly || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      dragStartClient.current = { x: e.clientX, y: e.clientY };
      dragRef.current = {
        target,
        mode,
        originStart: dates.startKey,
        originEnd: dates.endKey,
        previewStart: dates.startKey,
        previewEnd: dates.endKey,
        previewMap: new Map(),
        taskIds,
        listTaskOrigins: listTaskOrigins ?? new Map(),
        dirty: false,
        pointerId: e.pointerId,
        didMove: false,
      };
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [readOnly],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const snap = dragRef.current;
      if (!snap || e.pointerId !== snap.pointerId) return;
      if (
        Math.abs(e.clientX - dragStartClient.current.x) > CLICK_MOVE_THRESHOLD ||
        Math.abs(e.clientY - dragStartClient.current.y) > CLICK_MOVE_THRESHOLD
      ) {
        snap.didMove = true;
      }
      const col = columnFromClientX(e.clientX);
      if (col) applyDragToColumn(col);
      runEdgeScroll(e.clientX);
    };

    const onUp = (e: PointerEvent) => {
      const snap = dragRef.current;
      if (!snap || e.pointerId !== snap.pointerId) return;
      commitDrag();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      stopEdgeScroll();
    };
  }, [
    dragging,
    applyDragToColumn,
    columnFromClientX,
    commitDrag,
    runEdgeScroll,
    stopEdgeScroll,
  ]);

  function goToday() {
    setAnchor(weekStart(new Date()));
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }

  function shiftAnchorWeek(delta: number) {
    setAnchor((a) => shiftWeek(a, delta));
  }

  const drawerOpen =
    showDrawer && !readOnly && selectedTaskIds.length > 0 && project;

  if (ganttLists.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed border-[var(--border)] p-8 text-sm text-[var(--text-muted)]",
          className,
        )}
      >
        No Gantt-enabled task lists for this project.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex min-h-0 flex-1 flex-col overflow-hidden",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-1">
          <NavBtn onClick={() => shiftAnchorWeek(-1)} label="Previous week">
            <ChevronLeft size={16} />
          </NavBtn>
          <button
            type="button"
            className="h-8 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
            onClick={goToday}
          >
            Today
          </button>
          <NavBtn onClick={() => shiftAnchorWeek(1)} label="Next week">
            <ChevronRight size={16} />
          </NavBtn>
        </div>
        <p className="text-sm font-medium">{rangeLabel}</p>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1">
        <div
          ref={scrollRef}
          className="min-h-0 min-w-0 flex-1 overflow-auto"
        >
          <div style={{ minWidth: GANTT_LABEL_PX + totalWidth }}>
            {/* Sticky header */}
            <div className="sticky top-0 z-30 bg-[var(--bg)]">
              <div className="flex border-b border-[var(--border)]">
                <div
                  className="sticky left-0 z-40 shrink-0 border-r border-[var(--border)] bg-[var(--bg)]"
                  style={{ width: GANTT_LABEL_PX, height: 24 }}
                />
                <div className="flex min-w-0">
                  {headerGroups.map((g) => (
                    <div
                      key={`${g.groupIndex}-${g.label}`}
                      className={cn(
                        "relative flex items-center justify-center border-r border-[var(--schedule-week-border)] text-xs font-medium",
                        g.isCurrent && "text-[var(--accent)]",
                      )}
                      style={{ width: g.width, height: 24 }}
                    >
                      {g.cornerLabel ? (
                        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] tabular-nums opacity-70">
                          {g.cornerLabel}
                        </span>
                      ) : null}
                      <span className={g.cornerLabel ? "px-4" : undefined}>
                        {g.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex border-b border-[var(--border)]">
                <div
                  className="sticky left-0 z-40 shrink-0 border-r border-[var(--border)] bg-[var(--bg)]"
                  style={{ width: GANTT_LABEL_PX, height: 28 }}
                />
                <div className="flex min-w-0">
                  {columns.map((col) => (
                    <div
                      key={col.id}
                      className={cn(
                        "relative flex items-center justify-center text-xs",
                        col.isWeekBoundaryEnd
                          ? "border-r-2 border-[var(--schedule-week-border)]"
                          : "border-r border-[var(--schedule-day-border)]",
                        col.isToday &&
                          "bg-[var(--today-col)] font-semibold text-[var(--accent)]",
                      )}
                      style={{ width: col.width, height: 28 }}
                    >
                      {col.isToday ? (
                        <span
                          className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full bg-[var(--accent)]"
                          aria-hidden
                        />
                      ) : null}
                      {col.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Body rows */}
            <div className="relative" style={{ height: totalBodyHeight }}>
              {(() => {
                let y = 0;
                const rowNodes: ReactNode[] = [];

                for (const { list, tasks, milestone } of listSections) {
                  const listDates = getListDates(list);
                  const listColor = listBarColor(list, tasks, today);
                  const expanded = expandedLists.has(list.id);
                  const rowY = y;
                  y += GANTT_LIST_ROW_H;

                  rowNodes.push(
                    <div
                      key={`list-row-${list.id}`}
                      className="absolute left-0 right-0 flex"
                      style={{ top: rowY, height: GANTT_LIST_ROW_H }}
                    >
                      <div
                        className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-b border-[var(--border)] bg-[var(--bg)] px-2"
                        style={{ width: GANTT_LABEL_PX, height: GANTT_LIST_ROW_H }}
                      >
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)]"
                          onClick={() => toggleListExpanded(list.id)}
                          aria-expanded={expanded}
                          aria-label={expanded ? "Collapse list" : "Expand list"}
                        >
                          <ChevronDown
                            size={14}
                            className={cn(
                              "transition-transform",
                              !expanded && "-rotate-90",
                            )}
                          />
                        </button>
                        <span className="min-w-0 truncate text-xs font-semibold">
                          {list.name}
                        </span>
                      </div>
                      <div
                        className="relative shrink-0 border-b border-[var(--border)]"
                        style={{ width: totalWidth, height: GANTT_LIST_ROW_H }}
                      >
                        <ScheduleRowHitLayer
                          columns={columns}
                          width={totalWidth}
                          height={GANTT_LIST_ROW_H}
                          interactive={false}
                        />
                        {columns.find((c) => c.isToday) ? (
                          <div
                            className="pointer-events-none absolute inset-y-0 z-0"
                            style={{
                              left: columnOffsetPx(
                                columns,
                                columns.findIndex((c) => c.isToday),
                              ),
                              width: columns.find((c) => c.isToday)!.width,
                              backgroundColor: "var(--today-col)",
                            }}
                          />
                        ) : null}
                        <GanttBarVisual
                          dates={listDates}
                          columns={columns}
                          today={today}
                          color={listColor}
                          height={GANTT_LIST_ROW_H - 6}
                          label={list.name}
                          title={list.name}
                          emphasizeTop
                          readOnly={readOnly}
                          onPointerDownBar={(e) => {
                            const origins = new Map<string, GanttBarDates>();
                            for (const t of tasks) {
                              origins.set(
                                t.id,
                                resolveTaskBarDates(t, list, fallbackKey),
                              );
                            }
                            startDrag(
                              e,
                              { kind: "list", listId: list.id },
                              "move",
                              listDates,
                              [],
                              origins,
                            );
                          }}
                          onPointerDownResizeStart={(e) => {
                            e.stopPropagation();
                            startDrag(
                              e,
                              { kind: "list", listId: list.id },
                              "resize-start",
                              listDates,
                              [],
                            );
                          }}
                          onPointerDownResizeEnd={(e) => {
                            e.stopPropagation();
                            startDrag(
                              e,
                              { kind: "list", listId: list.id },
                              "resize-end",
                              listDates,
                              [],
                            );
                          }}
                        />
                      </div>
                    </div>,
                  );

                  if (!expanded) continue;

                  for (const task of tasks) {
                    const taskDates = getTaskDates(task, list);
                    const assignee = task.assignee_person_id
                      ? state.people.find((p) => p.id === task.assignee_person_id)
                      : null;
                    const selected = selectedTaskIds.includes(task.id);
                    const taskRowY = y;
                    y += GANTT_TASK_ROW_H;

                    const childIds = projectTasks
                      .filter((t) => t.parent_id === task.id)
                      .map((t) => t.id);
                    // Parent date-drag always includes children (CR stays bound).
                    // CR itself can move/resize dates solo; vertical order stays parent-bound.
                    const dragTaskIds =
                      selected && selectedTaskIds.length > 1
                        ? selectedTaskIds
                        : !task.parent_id
                          ? [task.id, ...childIds]
                          : [task.id];

                    rowNodes.push(
                      <div
                        key={`task-row-${task.id}`}
                        className="absolute left-0 right-0 flex"
                        style={{ top: taskRowY, height: GANTT_TASK_ROW_H }}
                      >
                        <div
                          className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-b border-[var(--border)] bg-[var(--bg)] pl-8 pr-2"
                          style={{
                            width: GANTT_LABEL_PX,
                            height: GANTT_TASK_ROW_H,
                          }}
                        >
                          {taskShowsClientReviewStar(task) ? (
                            <Star
                              size={10}
                              className={cn(
                                "shrink-0",
                                task.status === "complete"
                                  ? "fill-[var(--status-healthy)] text-[var(--status-healthy)]"
                                  : "fill-[#f59e0b] text-[#f59e0b]",
                              )}
                              aria-hidden
                            />
                          ) : null}
                          <span
                            className={cn(
                              "min-w-0 truncate text-[11px] text-[var(--text-muted)]",
                              task.status === "complete" &&
                                task.is_client_review &&
                                "text-[var(--status-healthy)] line-through",
                            )}
                          >
                            {task.title}
                          </span>
                        </div>
                        <div
                          className="relative shrink-0 border-b border-[var(--border)]"
                          style={{
                            width: totalWidth,
                            height: GANTT_TASK_ROW_H,
                          }}
                        >
                          <ScheduleRowHitLayer
                            columns={columns}
                            width={totalWidth}
                            height={GANTT_TASK_ROW_H}
                            interactive={false}
                          />
                          <GanttBarVisual
                            dates={taskDates}
                            columns={columns}
                            today={today}
                            color={taskBarColor(task, today, tasks)}
                            height={GANTT_TASK_ROW_H - 4}
                            label={task.title}
                            title={task.title}
                            selected={selected}
                            readOnly={readOnly}
                            showAssignee={showAssignees}
                            assignee={assignee}
                            onPointerDownBar={(e) => {
                              if (e.metaKey || e.ctrlKey) {
                                toggleTaskSelect(
                                  task.id,
                                  true,
                                );
                                return;
                              }
                              startDrag(
                                e,
                                { kind: "task", taskId: task.id },
                                "move",
                                taskDates,
                                dragTaskIds,
                              );
                            }}
                            onPointerDownResizeStart={(e) => {
                              e.stopPropagation();
                              startDrag(
                                e,
                                { kind: "task", taskId: task.id },
                                "resize-start",
                                taskDates,
                                dragTaskIds,
                              );
                            }}
                            onPointerDownResizeEnd={(e) => {
                              e.stopPropagation();
                              startDrag(
                                e,
                                { kind: "task", taskId: task.id },
                                "resize-end",
                                taskDates,
                                dragTaskIds,
                              );
                            }}
                          />
                        </div>
                      </div>,
                    );
                  }

                  if (milestone) {
                    const mKey =
                      milestone.due_date ??
                      milestone.start_date ??
                      fallbackKey;
                    const mDates: GanttBarDates = {
                      startKey: mKey,
                      endKey: mKey,
                    };
                    const msRowY = y;
                    y += GANTT_TASK_ROW_H;

                    rowNodes.push(
                      <div
                        key={`ms-row-${milestone.id}`}
                        className="absolute left-0 right-0 flex"
                        style={{ top: msRowY, height: GANTT_TASK_ROW_H }}
                      >
                        <div
                          className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-b border-[var(--border)] bg-[var(--bg)] pl-8 pr-2"
                          style={{
                            width: GANTT_LABEL_PX,
                            height: GANTT_TASK_ROW_H,
                          }}
                        >
                          <Star
                            size={12}
                            className="shrink-0 text-[var(--status-near)]"
                            fill="currentColor"
                          />
                          <span className="min-w-0 truncate text-[11px] font-medium text-[var(--text-muted)]">
                            {milestone.name}
                          </span>
                        </div>
                        <div
                          className="relative shrink-0 border-b border-[var(--border)]"
                          style={{
                            width: totalWidth,
                            height: GANTT_TASK_ROW_H,
                          }}
                        >
                          <ScheduleRowHitLayer
                            columns={columns}
                            width={totalWidth}
                            height={GANTT_TASK_ROW_H}
                            interactive={false}
                          />
                          <GanttBarVisual
                            dates={mDates}
                            columns={columns}
                            today={today}
                            color="var(--status-near)"
                            height={GANTT_TASK_ROW_H - 4}
                            label={milestone.name}
                            title={milestone.name}
                            readOnly
                          />
                        </div>
                      </div>,
                    );
                  }
                }

                return rowNodes;
              })()}
            </div>
          </div>
        </div>

        {drawerOpen && project ? (
          <GanttDrawer
            project={project}
            selectedTaskIds={selectedTaskIds}
            tasks={projectTasks}
            lists={ganttLists}
            people={state.people}
            projectMembers={state.project_members}
            profiles={state.profiles}
            comments={state.task_comments}
            myPersonId={myPerson?.id ?? null}
            onClose={() => setSelectedTaskIds([])}
            onSaveTasks={(updates) => {
              for (const t of updates) upsertTask(t);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
