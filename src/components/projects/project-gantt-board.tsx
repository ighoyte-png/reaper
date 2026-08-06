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
  GripVertical,
  Maximize2,
  Minimize2,
  PanelRightClose,
  Star,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { PersonAvatar } from "@/components/people/person-avatar";
import { buttonClass } from "@/components/ui/button";
import { DateInput, Field } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { RichNotesHtml } from "@/components/ui/simple-rich-text";
import { ScheduleRowHitLayer } from "@/components/schedule/schedule-row-hit-layer";
import { TaskStatusTag } from "@/components/tasks/task-status-tag";
import { useData } from "@/lib/data/store";
import { cn } from "@/lib/cn";
import {
  shiftWeek,
  shiftWorkingDays,
  toDateKey,
  weekStart,
  workingDayDelta,
} from "@/lib/domain/dates";
import {
  barPastFutureSplit,
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
  MILESTONE_PURPLE,
  resolveListBarDates,
  resolveMilestoneBarDates,
  resolveProjectBarDates,
  resolveTaskBarDates,
  taskBarColor,
  taskShowsClientReviewStar,
  type GanttBarDates,
} from "@/lib/domain/gantt";
import { projectAssigneePeople, projectTeamPersonIds } from "@/lib/domain/project-access";
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
import { readUserViewPrefs } from "@/lib/user-view-prefs";
import type {
  Milestone,
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
  | { kind: "task"; taskId: string }
  | { kind: "milestone"; milestoneId: string }
  | { kind: "project" };

type DragSnapshot = {
  target: DragTarget;
  mode: DragMode;
  originStart: string;
  originEnd: string;
  previewStart: string;
  previewEnd: string;
  /** Live preview geometry keyed by task id, `list:{id}`, `milestone:{id}`, or `project`. */
  previewMap: Map<string, GanttBarDates>;
  /** Task ids included in this drag (multi-select or single). */
  taskIds: string[];
  /** For list move: all tasks shifted at drag start (including cascade). */
  listTaskOrigins: Map<string, GanttBarDates>;
  /** For list move cascade: other list ids → dates. */
  cascadeListOrigins: Map<string, GanttBarDates>;
  /** For list move cascade: milestone ids → dates. */
  cascadeMilestoneOrigins: Map<string, GanttBarDates>;
  dirty: boolean;
  pointerId: number;
  didMove: boolean;
};

const EDGE_SCROLL_PX = 40;
const EDGE_SCROLL_SPEED = 14;
const CLICK_MOVE_THRESHOLD = 4;
const BAR_PAD_X = 6;
const BAR_GAP = 4;
const STATUS_CHIP_GAP = 4;

let measureCanvas: HTMLCanvasElement | null = null;

function measureBarLabelWidth(text: string): number {
  if (typeof document === "undefined") return text.length * 7;
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * 7;
  ctx.font =
    '500 12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  return ctx.measureText(text).width;
}

function todayKey() {
  return toDateKey(startOfDay(new Date()));
}

function hoverWash(color: string): string {
  return `color-mix(in srgb, ${color} 50%, black)`;
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
  showCrStar,
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
  showCrStar?: boolean;
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
  const crSlot = showCrStar ? 12 + BAR_GAP : 0;
  const availableForLabel = geo.width - BAR_PAD_X * 2 - crSlot;
  const labelWidth = label ? measureBarLabelWidth(label) : 0;
  const showLabel = Boolean(
    label && availableForLabel >= labelWidth && labelWidth > 0,
  );

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
        backgroundColor: color,
      }}
      title={title}
      onClick={onClick}
      onPointerDown={readOnly ? undefined : onPointerDownBar}
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
          className="pointer-events-none absolute inset-y-0 right-0 z-[1] overflow-hidden rounded-r-sm"
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
      <div className="relative z-[2] flex h-full min-w-0 flex-1 items-center gap-1 px-1.5">
        {showLabel ? (
          <span className="pointer-events-none min-w-0 flex-1 truncate text-left text-xs font-medium text-white">
            {label}
          </span>
        ) : (
          <span className="min-w-0 flex-1" aria-hidden />
        )}
        {showCrStar ? (
          <Star
            size={12}
            className="pointer-events-none shrink-0 text-white"
            fill="currentColor"
            aria-hidden
          />
        ) : null}
      </div>
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

function GanttMilestoneMarker({
  dates,
  columns,
  done,
  title,
  readOnly,
  onPointerDown,
}: {
  dates: GanttBarDates;
  columns: ScheduleColumn[];
  done: boolean;
  title: string;
  readOnly?: boolean;
  onPointerDown?: (e: ReactPointerEvent) => void;
}) {
  const geo = spanColumnsPx(columns, dates.startKey, dates.endKey);
  if (!geo) return null;
  const color = done ? "var(--status-healthy)" : MILESTONE_PURPLE;
  const size = Math.min(geo.width - 4, GANTT_TASK_ROW_H - 6, 22);
  return (
    <div
      className={cn(
        "pointer-events-auto absolute z-10 flex items-center justify-center rounded-sm",
        !readOnly && "cursor-grab active:cursor-grabbing",
      )}
      style={{
        left: geo.left,
        width: geo.width,
        height: GANTT_TASK_ROW_H - 4,
        top: "50%",
        transform: "translateY(-50%)",
        backgroundColor: color,
      }}
      title={title}
      onPointerDown={readOnly ? undefined : onPointerDown}
    >
      <Star
        size={Math.max(10, size - 6)}
        className="shrink-0 text-white"
        fill="currentColor"
        aria-hidden
      />
    </div>
  );
}

function TaskStatusChipBesideBar({
  dates,
  columns,
  status,
}: {
  dates: GanttBarDates;
  columns: ScheduleColumn[];
  status: TaskStatus;
}) {
  const geo = spanColumnsPx(columns, dates.startKey, dates.endKey);
  if (!geo) return null;
  return (
    <div
      className="pointer-events-none absolute z-[11] top-1/2 -translate-y-1/2"
      style={{ left: geo.left + geo.width + STATUS_CHIP_GAP }}
    >
      <TaskStatusTag status={status} className="scale-90 origin-left shadow-sm" />
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
  const {
    state,
    profile,
    upsertTask,
    upsertTaskList,
    upsertMilestone,
    upsertProject,
    myPerson,
  } = useData();
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSnapshot | null>(null);
  const dragStartClient = useRef({ x: 0, y: 0 });
  const edgeScrollRaf = useRef(0);
  const seenListIdsRef = useRef<Set<string>>(new Set());
  const panRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const reorderRef = useRef<{
    taskId: string;
    listId: string;
    startY: number;
    order: string[];
    pointerId: number;
  } | null>(null);

  const [anchor, setAnchor] = useState(() => weekStart(new Date()));
  const [expandedLists, setExpandedLists] = useState<Set<string>>(() => new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [panning, setPanning] = useState(false);
  const [dragVersion, setDragVersion] = useState(0);
  const [containerNarrow, setContainerNarrow] = useState(false);
  const [halfZoom, setHalfZoom] = useState(false);
  const [viewportExpanded, setViewportExpanded] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  const today = todayKey();
  const baseDayW = containerNarrow ? GANTT_DAY_W_NARROW : GANTT_DAY_W_DESKTOP;
  const dayW = halfZoom ? Math.max(20, Math.round(baseDayW / 2)) : baseDayW;

  const project = state.projects.find((p) => p.id === projectId) ?? null;
  const ganttLists = useMemo(
    () => ganttListsForProject(state.task_lists, projectId),
    [state.task_lists, projectId],
  );
  const projectTasks = useMemo(
    () => state.tasks.filter((t) => t.project_id === projectId),
    [state.tasks, projectId],
  );
  const projectMilestones = useMemo(
    () => state.milestones.filter((m) => m.project_id === projectId),
    [state.milestones, projectId],
  );

  const showExpandToggle =
    readUserViewPrefs(profile?.id).contentWidth === "constrained";

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

  // Only auto-expand newly seen list ids (do not re-expand user-collapsed lists after drag).
  useEffect(() => {
    setExpandedLists((prev) => {
      let changed = false;
      const next = new Set(prev);
      const currentIds = new Set(ganttLists.map((l) => l.id));
      for (const id of [...seenListIdsRef.current]) {
        if (!currentIds.has(id)) seenListIdsRef.current.delete(id);
      }
      for (const list of ganttLists) {
        if (seenListIdsRef.current.has(list.id)) continue;
        seenListIdsRef.current.add(list.id);
        if (!next.has(list.id)) {
          next.add(list.id);
          changed = true;
        }
      }
      return changed ? next : prev;
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

  /** Date key → holiday name for project team calendars / leave. */
  const holidayByDate = useMemo(() => {
    const map = new Map<string, string>();
    const teamIds = projectTeamPersonIds(
      projectId,
      state.project_members,
      state.assignments,
      projectTasks,
    );
    const calendarIds = new Set<string>();
    for (const person of state.people) {
      if (!teamIds.has(person.id)) continue;
      if (person.holiday_calendar_id) {
        calendarIds.add(person.holiday_calendar_id);
      }
    }
    for (const day of state.holiday_calendar_days) {
      if (!calendarIds.has(day.calendar_id)) continue;
      if (!map.has(day.date)) map.set(day.date, day.name);
    }
    for (const leave of state.leave_days) {
      if (!teamIds.has(leave.person_id)) continue;
      if (leave.kind !== "holiday") continue;
      if (map.has(leave.date)) continue;
      const name = leave.notes.trim() || "Statutory holiday";
      map.set(leave.date, name);
    }
    return map;
  }, [
    projectId,
    state.project_members,
    state.assignments,
    projectTasks,
    state.people,
    state.holiday_calendar_days,
    state.leave_days,
  ]);

  const listSections = useMemo(() => {
    return ganttLists.map((list) => {
      const tasks = ganttTasksForList(projectTasks, list.id);
      const milestone = list.milestone_id
        ? projectMilestones.find((m) => m.id === list.milestone_id) ?? null
        : null;
      return { list, tasks, milestone };
    });
  }, [ganttLists, projectTasks, projectMilestones]);

  const projectDates = useMemo(() => {
    if (!project) return null;
    const preview = dragRef.current?.previewMap.get("project");
    if (preview) return preview;
    return resolveProjectBarDates(project, fallbackKey);
  }, [project, fallbackKey, dragVersion]);

  const totalBodyHeight = useMemo(() => {
    let h = GANTT_TASK_ROW_H; // project timeline row
    for (const { list, tasks, milestone } of listSections) {
      h += GANTT_LIST_ROW_H;
      if (expandedLists.has(list.id)) {
        h += tasks.length * GANTT_TASK_ROW_H;
        if (milestone) h += GANTT_TASK_ROW_H;
      }
    }
    return Math.max(h, GANTT_TASK_ROW_H + GANTT_LIST_ROW_H);
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

  const getMilestoneDates = useCallback(
    (milestone: Milestone): GanttBarDates => {
      const preview = dragRef.current?.previewMap.get(
        `milestone:${milestone.id}`,
      );
      if (preview) return preview;
      return (
        resolveMilestoneBarDates(milestone) ?? {
          startKey: fallbackKey,
          endKey: fallbackKey,
        }
      );
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

      if (snap.target.kind === "project") {
        if (snap.mode === "move") {
          const delta = workingDayDelta(snap.originStart, col.startKey);
          if (delta === 0) return;
          snap.dirty = true;
          snap.didMove = true;
          const next = {
            startKey: shiftWorkingDays(snap.originStart, delta),
            endKey: shiftWorkingDays(snap.originEnd, delta),
          };
          snap.previewStart = next.startKey;
          snap.previewEnd = next.endKey;
          bumpDragPreview(new Map([["project", next]]));
        } else if (snap.mode === "resize-end") {
          const end =
            col.endKey >= snap.originStart ? col.endKey : snap.originStart;
          if (end === snap.previewEnd) return;
          snap.dirty = true;
          snap.didMove = true;
          snap.previewEnd = end;
          bumpDragPreview(
            new Map([
              ["project", { startKey: snap.originStart, endKey: end }],
            ]),
          );
        } else if (snap.mode === "resize-start") {
          const start =
            col.startKey <= snap.originEnd ? col.startKey : snap.originEnd;
          if (start === snap.previewStart) return;
          snap.dirty = true;
          snap.didMove = true;
          snap.previewStart = start;
          bumpDragPreview(
            new Map([
              ["project", { startKey: start, endKey: snap.originEnd }],
            ]),
          );
        }
        return;
      }

      if (snap.target.kind === "milestone") {
        if (snap.mode !== "move") return;
        const delta = workingDayDelta(snap.originStart, col.startKey);
        if (delta === 0) return;
        snap.dirty = true;
        snap.didMove = true;
        const key = shiftWorkingDays(snap.originStart, delta);
        const next = { startKey: key, endKey: key };
        snap.previewStart = key;
        snap.previewEnd = key;
        bumpDragPreview(
          new Map([[`milestone:${snap.target.milestoneId}`, next]]),
        );
        return;
      }

      if (snap.target.kind === "list") {
        const listId = snap.target.listId;
        const list = ganttLists.find((l) => l.id === listId);
        if (!list) return;
        if (snap.mode === "move") {
          const delta = workingDayDelta(snap.originStart, col.startKey);
          if (delta === 0) return;
          snap.dirty = true;
          snap.didMove = true;
          const newList = {
            startKey: shiftWorkingDays(snap.originStart, delta),
            endKey: shiftWorkingDays(snap.originEnd, delta),
          };
          const preview = new Map<string, GanttBarDates>();
          preview.set(`list:${list.id}`, newList);
          for (const [otherId, orig] of snap.cascadeListOrigins) {
            preview.set(`list:${otherId}`, {
              startKey: shiftWorkingDays(orig.startKey, delta),
              endKey: shiftWorkingDays(orig.endKey, delta),
            });
          }
          for (const [taskId, orig] of snap.listTaskOrigins) {
            preview.set(taskId, {
              startKey: shiftWorkingDays(orig.startKey, delta),
              endKey: shiftWorkingDays(orig.endKey, delta),
            });
          }
          for (const [msId, orig] of snap.cascadeMilestoneOrigins) {
            preview.set(`milestone:${msId}`, {
              startKey: shiftWorkingDays(orig.startKey, delta),
              endKey: shiftWorkingDays(orig.endKey, delta),
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
        const delta = workingDayDelta(snap.originStart, col.startKey);
        if (delta === 0) return;
        applyToTasks((orig) => ({
          startKey: shiftWorkingDays(orig.startKey, delta),
          endKey: shiftWorkingDays(orig.endKey, delta),
        }));
      } else if (snap.mode === "resize-end") {
        const endDelta = workingDayDelta(snap.originEnd, col.endKey);
        if (endDelta === 0) return;
        applyToTasks((orig) => {
          const endKey = shiftWorkingDays(orig.endKey, endDelta);
          return {
            startKey: orig.startKey,
            endKey: endKey >= orig.startKey ? endKey : orig.startKey,
          };
        });
      } else if (snap.mode === "resize-start") {
        const startDelta = workingDayDelta(snap.originStart, col.startKey);
        if (startDelta === 0) return;
        applyToTasks((orig) => {
          const startKey = shiftWorkingDays(orig.startKey, startDelta);
          return {
            startKey: startKey <= orig.endKey ? startKey : orig.endKey,
            endKey: orig.endKey,
          };
        });
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

    if (snap.target.kind === "project" && project) {
      const dates = clampDateRange(snap.previewStart, snap.previewEnd);
      void upsertProject({
        ...project,
        start_date: dates.startKey,
        end_date: dates.endKey,
      });
      setDragVersion((v) => v + 1);
      return;
    }

    if (snap.target.kind === "milestone") {
      const milestoneId = snap.target.milestoneId;
      const ms = projectMilestones.find((m) => m.id === milestoneId);
      const preview = previewMap.get(`milestone:${milestoneId}`);
      if (ms && preview) {
        upsertMilestone({
          ...ms,
          start_date: preview.startKey,
          due_date: preview.endKey,
        });
      }
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
      if (snap.mode === "move") {
        for (const [otherId, orig] of snap.cascadeListOrigins) {
          const preview = previewMap.get(`list:${otherId}`);
          const other = ganttLists.find((l) => l.id === otherId);
          if (!other || !preview) continue;
          upsertTaskList({
            ...other,
            start_date:
              other.start_date != null || preview.startKey !== orig.startKey
                ? preview.startKey
                : null,
            end_date:
              other.end_date != null || preview.endKey !== orig.endKey
                ? preview.endKey
                : null,
          });
        }
        for (const [msId, orig] of snap.cascadeMilestoneOrigins) {
          const preview = previewMap.get(`milestone:${msId}`);
          const ms = projectMilestones.find((m) => m.id === msId);
          if (!ms || !preview) continue;
          if (
            preview.startKey === orig.startKey &&
            preview.endKey === orig.endKey
          ) {
            continue;
          }
          upsertMilestone({
            ...ms,
            start_date: preview.startKey,
            due_date: preview.endKey,
          });
        }
      }
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
    projectMilestones,
    project,
    upsertTask,
    upsertTaskList,
    upsertMilestone,
    upsertProject,
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
      cascadeListOrigins?: Map<string, GanttBarDates>,
      cascadeMilestoneOrigins?: Map<string, GanttBarDates>,
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
        cascadeListOrigins: cascadeListOrigins ?? new Map(),
        cascadeMilestoneOrigins: cascadeMilestoneOrigins ?? new Map(),
        dirty: false,
        pointerId: e.pointerId,
        didMove: false,
      };
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [readOnly],
  );

  const buildListMoveCascade = useCallback(
    (list: TaskList) => {
      const listTaskOrigins = new Map<string, GanttBarDates>();
      const cascadeListOrigins = new Map<string, GanttBarDates>();
      const cascadeMilestoneOrigins = new Map<string, GanttBarDates>();
      const listsToShift = ganttLists.filter(
        (l) => l.id === list.id || l.sort_order > list.sort_order,
      );
      for (const l of listsToShift) {
        if (l.id !== list.id) {
          cascadeListOrigins.set(l.id, resolveListBarDates(l, fallbackKey));
        }
        for (const t of ganttTasksForList(projectTasks, l.id)) {
          listTaskOrigins.set(t.id, resolveTaskBarDates(t, l, fallbackKey));
        }
        if (l.milestone_id) {
          const ms = projectMilestones.find((m) => m.id === l.milestone_id);
          if (ms) {
            const dates = resolveMilestoneBarDates(ms);
            if (dates) cascadeMilestoneOrigins.set(ms.id, dates);
          }
        }
      }
      return { listTaskOrigins, cascadeListOrigins, cascadeMilestoneOrigins };
    },
    [ganttLists, projectTasks, projectMilestones, fallbackKey],
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

  useEffect(() => {
    if (!panning) return;
    const onMove = (e: PointerEvent) => {
      const pan = panRef.current;
      const el = scrollRef.current;
      if (!pan || !el || e.pointerId !== pan.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - pan.lastX;
      const dy = e.clientY - pan.lastY;
      pan.lastX = e.clientX;
      pan.lastY = e.clientY;
      el.scrollLeft -= dx;
      el.scrollTop -= dy;
    };
    const onUp = (e: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || e.pointerId !== pan.pointerId) return;
      panRef.current = null;
      setPanning(false);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [panning]);

  function startBlankPan(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    if (dragging) return;
    e.preventDefault();
    panRef.current = {
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    setPanning(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function goToday() {
    setAnchor(weekStart(new Date()));
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }

  function shiftAnchorWeek(delta: number) {
    setAnchor((a) => shiftWeek(a, delta));
  }

  const startTaskReorder = useCallback(
    (e: ReactPointerEvent, task: Task) => {
      if (readOnly || e.button !== 0 || task.parent_id) return;
      e.stopPropagation();
      e.preventDefault();
      const siblings = ganttTasksForList(projectTasks, task.list_id)
        .filter((t) => !t.parent_id)
        .map((t) => t.id);
      if (siblings.length < 2) return;
      reorderRef.current = {
        taskId: task.id,
        listId: task.list_id,
        startY: e.clientY,
        order: siblings,
        pointerId: e.pointerId,
      };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [readOnly, projectTasks],
  );

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const snap = reorderRef.current;
      if (!snap || e.pointerId !== snap.pointerId) return;
      const deltaRows = Math.round(
        (e.clientY - snap.startY) / GANTT_TASK_ROW_H,
      );
      const from = snap.order.indexOf(snap.taskId);
      if (from < 0) return;
      const to = Math.max(0, Math.min(snap.order.length - 1, from + deltaRows));
      if (to === from) return;
      const next = [...snap.order];
      next.splice(from, 1);
      next.splice(to, 0, snap.taskId);
      snap.order = next;
      snap.startY = e.clientY;
      next.forEach((id, i) => {
        const task = projectTasks.find((t) => t.id === id);
        if (!task || task.sort_order === i) return;
        upsertTask({ ...task, sort_order: i });
      });
    }
    function onUp(e: PointerEvent) {
      const snap = reorderRef.current;
      if (!snap || e.pointerId !== snap.pointerId) return;
      reorderRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [projectTasks, upsertTask]);

  const drawerOpen =
    showDrawer && !readOnly && selectedTaskIds.length > 0 && project;

  const projectGuideKeys = useMemo(() => {
    if (!projectDates) return { start: null as string | null, end: null as string | null };
    return { start: projectDates.startKey, end: projectDates.endKey };
  }, [projectDates]);

  const boardInner = (
    <div
      ref={containerRef}
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden",
        viewportExpanded
          ? "h-full flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)]"
          : // Cap height so blank-space pan can scroll vertically (not only horizontally).
            "h-[min(70dvh,calc(100dvh-14rem))]",
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
        <div className="ml-auto flex items-center gap-1">
          <NavBtn
            onClick={() => setHalfZoom((z) => !z)}
            label={halfZoom ? "Zoom in (full day width)" : "Zoom out (half day width)"}
          >
            {halfZoom ? <ZoomIn size={16} /> : <ZoomOut size={16} />}
          </NavBtn>
          {showExpandToggle ? (
            <NavBtn
              onClick={() => setViewportExpanded((v) => !v)}
              label={viewportExpanded ? "Collapse Gantt" : "Expand Gantt"}
            >
              {viewportExpanded ? (
                <Minimize2 size={16} />
              ) : (
                <Maximize2 size={16} />
              )}
            </NavBtn>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1">
        <div
          ref={scrollRef}
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain",
            panning && "cursor-grabbing select-none",
          )}
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
                  {columns.map((col) => {
                    const holidayName = holidayByDate.get(col.startKey);
                    return (
                    <div
                      key={col.id}
                      className={cn(
                        "relative flex items-center justify-center text-xs",
                        col.isWeekBoundaryEnd
                          ? "border-r-2 border-[var(--schedule-week-border)]"
                          : "border-r border-[var(--schedule-day-border)]",
                        col.isToday &&
                          "bg-[var(--today-col)] font-semibold text-[var(--accent)]",
                        holidayName && !col.isToday && "bg-[var(--leave-block-wash)]",
                      )}
                      style={{ width: col.width, height: 28 }}
                      title={holidayName ?? undefined}
                    >
                      {holidayName ? (
                        <div
                          className="pointer-events-none absolute inset-0 opacity-80"
                          style={{
                            background:
                              "repeating-linear-gradient(-45deg, transparent, transparent 4px, var(--leave-block-hatch) 4px, var(--leave-block-hatch) 8px)",
                          }}
                          aria-hidden
                        />
                      ) : null}
                      {col.isToday ? (
                        <span
                          className="absolute inset-x-1 bottom-0.5 z-[1] h-0.5 rounded-full bg-[var(--accent)]"
                          aria-hidden
                        />
                      ) : null}
                      <span className="relative z-[1]">{col.label}</span>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Body rows */}
            <div className="relative" style={{ height: totalBodyHeight }}>
              {holidayByDate.size > 0 ? (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-[1]"
                  style={{ left: GANTT_LABEL_PX, width: totalWidth }}
                  aria-hidden
                >
                  {columns.map((col, index) => {
                    const holidayName = holidayByDate.get(col.startKey);
                    if (!holidayName) return null;
                    return (
                      <div
                        key={`hol-${col.id}`}
                        className="absolute inset-y-0"
                        style={{
                          left: columnOffsetPx(columns, index),
                          width: col.width,
                          backgroundColor: "var(--leave-block-wash)",
                          backgroundImage:
                            "repeating-linear-gradient(-45deg, transparent, transparent 4px, var(--leave-block-hatch) 4px, var(--leave-block-hatch) 8px)",
                        }}
                        title={holidayName}
                      />
                    );
                  })}
                </div>
              ) : null}

              {/* Project start/end vertical guides */}
              {(projectGuideKeys.start || projectGuideKeys.end) && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-[3]"
                  style={{ left: GANTT_LABEL_PX, width: totalWidth }}
                  aria-hidden
                >
                  {(["start", "end"] as const).map((edge) => {
                    const key =
                      edge === "start"
                        ? projectGuideKeys.start
                        : projectGuideKeys.end;
                    if (!key) return null;
                    const idx = columns.findIndex(
                      (c) => key >= c.startKey && key <= c.endKey,
                    );
                    if (idx < 0) return null;
                    const col = columns[idx]!;
                    const left =
                      columnOffsetPx(columns, idx) +
                      (edge === "end" ? col.width - 2 : 0);
                    return (
                      <div
                        key={`guide-${edge}`}
                        className="absolute inset-y-0 w-0.5 bg-[var(--accent)]/50"
                        style={{ left }}
                      />
                    );
                  })}
                </div>
              )}

              {(() => {
                let y = 0;
                const rowNodes: ReactNode[] = [];

                // Project overall timeline row
                if (project && projectDates) {
                  const projRowId = "project-timeline";
                  const projHover = hoveredRowId === projRowId;
                  const projColor = "var(--accent)";
                  const projWash = projHover ? hoverWash(projColor) : undefined;
                  const projRowY = y;
                  y += GANTT_TASK_ROW_H;

                  rowNodes.push(
                    <div
                      key={projRowId}
                      className="absolute left-0 right-0 z-[2] flex"
                      style={{ top: projRowY, height: GANTT_TASK_ROW_H }}
                      onMouseEnter={() => setHoveredRowId(projRowId)}
                      onMouseLeave={() =>
                        setHoveredRowId((id) =>
                          id === projRowId ? null : id,
                        )
                      }
                    >
                      <div
                        className="sticky left-0 z-20 flex shrink-0 items-center border-r border-b border-[var(--border)] bg-[var(--bg)] px-2"
                        style={{
                          width: GANTT_LABEL_PX,
                          height: GANTT_TASK_ROW_H,
                          backgroundColor: projWash ?? "var(--bg)",
                        }}
                      >
                        <span className="min-w-0 truncate text-[11px] font-semibold">
                          {project.name}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "relative shrink-0 border-b border-[var(--border)]",
                          readOnly ? "cursor-grab" : "cursor-grab",
                        )}
                        style={{
                          width: totalWidth,
                          height: GANTT_TASK_ROW_H,
                          backgroundColor: projWash,
                        }}
                        onPointerDown={startBlankPan}
                      >
                        <ScheduleRowHitLayer
                          columns={columns}
                          width={totalWidth}
                          height={GANTT_TASK_ROW_H}
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
                          dates={projectDates}
                          columns={columns}
                          today={today}
                          color={projColor}
                          height={GANTT_TASK_ROW_H - 4}
                          label={project.name}
                          title={project.name}
                          readOnly={readOnly}
                          onPointerDownBar={(e) => {
                            startDrag(
                              e,
                              { kind: "project" },
                              "move",
                              projectDates,
                              [],
                            );
                          }}
                          onPointerDownResizeStart={(e) => {
                            e.stopPropagation();
                            startDrag(
                              e,
                              { kind: "project" },
                              "resize-start",
                              projectDates,
                              [],
                            );
                          }}
                          onPointerDownResizeEnd={(e) => {
                            e.stopPropagation();
                            startDrag(
                              e,
                              { kind: "project" },
                              "resize-end",
                              projectDates,
                              [],
                            );
                          }}
                        />
                      </div>
                    </div>,
                  );
                }

                for (const { list, tasks, milestone } of listSections) {
                  const listDates = getListDates(list);
                  const listColor = listBarColor(list, tasks, today);
                  const expanded = expandedLists.has(list.id);
                  const listRowId = `list:${list.id}`;
                  const listHover = hoveredRowId === listRowId;
                  const listWash = listHover ? hoverWash(listColor) : undefined;
                  const rowY = y;
                  y += GANTT_LIST_ROW_H;

                  rowNodes.push(
                    <div
                      key={`list-row-${list.id}`}
                      className="absolute left-0 right-0 z-[2] flex"
                      style={{ top: rowY, height: GANTT_LIST_ROW_H }}
                      onMouseEnter={() => setHoveredRowId(listRowId)}
                      onMouseLeave={() =>
                        setHoveredRowId((id) =>
                          id === listRowId ? null : id,
                        )
                      }
                    >
                      <div
                        className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-b border-[var(--border)] px-2"
                        style={{
                          width: GANTT_LABEL_PX,
                          height: GANTT_LIST_ROW_H,
                          backgroundColor: listWash ?? "var(--bg)",
                        }}
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
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left text-xs font-semibold hover:underline"
                          title={list.name}
                          onClick={() => toggleListExpanded(list.id)}
                        >
                          {list.name}
                        </button>
                      </div>
                      <div
                        className={cn(
                          "relative shrink-0 border-b border-[var(--border)]",
                          readOnly && "cursor-grab",
                        )}
                        style={{
                          width: totalWidth,
                          height: GANTT_LIST_ROW_H,
                          backgroundColor: listWash,
                        }}
                        onPointerDown={startBlankPan}
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
                            const cascade = buildListMoveCascade(list);
                            startDrag(
                              e,
                              { kind: "list", listId: list.id },
                              "move",
                              listDates,
                              [],
                              cascade.listTaskOrigins,
                              cascade.cascadeListOrigins,
                              cascade.cascadeMilestoneOrigins,
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
                    const barColor = taskBarColor(task, today, tasks);
                    const taskRowId = `task:${task.id}`;
                    const taskHover = hoveredRowId === taskRowId;
                    const taskWash = taskHover ? hoverWash(barColor) : undefined;
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
                        className="absolute left-0 right-0 z-[2] flex"
                        style={{ top: taskRowY, height: GANTT_TASK_ROW_H }}
                        onMouseEnter={() => setHoveredRowId(taskRowId)}
                        onMouseLeave={() =>
                          setHoveredRowId((id) =>
                            id === taskRowId ? null : id,
                          )
                        }
                      >
                        <div
                          className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-b border-[var(--border)] pl-8 pr-2"
                          style={{
                            width: GANTT_LABEL_PX,
                            height: GANTT_TASK_ROW_H,
                            backgroundColor: taskWash ?? "var(--bg)",
                          }}
                        >
                          {!readOnly && !task.parent_id ? (
                            <button
                              type="button"
                              className="touch-none shrink-0 cursor-grab p-0.5 text-[var(--text-muted)] opacity-60 hover:opacity-100 active:cursor-grabbing"
                              aria-label="Drag to reorder within list"
                              title="Drag to reorder within list"
                              onPointerDown={(e) => startTaskReorder(e, task)}
                            >
                              <GripVertical size={12} />
                            </button>
                          ) : null}
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
                              "min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]",
                              task.status === "complete" &&
                                task.is_client_review &&
                                "text-[var(--status-healthy)] line-through",
                            )}
                            title={task.title}
                          >
                            {task.title}
                          </span>
                          {showAssignees && assignee ? (
                            <PersonAvatar
                              avatarUrl={assignee.avatar_url}
                              avatarAttachmentId={assignee.avatar_attachment_id}
                              name={assignee.name}
                              size="xs"
                              fallback="initials"
                              color={personAvatarColor(assignee)}
                              className="shrink-0"
                            />
                          ) : null}
                        </div>
                        <div
                          className={cn(
                            "relative shrink-0 border-b border-[var(--border)]",
                            readOnly && "cursor-grab",
                          )}
                          style={{
                            width: totalWidth,
                            height: GANTT_TASK_ROW_H,
                            backgroundColor: taskWash,
                          }}
                          onPointerDown={startBlankPan}
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
                            color={barColor}
                            height={GANTT_TASK_ROW_H - 4}
                            label={task.title}
                            title={task.title}
                            selected={selected}
                            readOnly={readOnly}
                            showCrStar={taskShowsClientReviewStar(task)}
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
                          <TaskStatusChipBesideBar
                            dates={taskDates}
                            columns={columns}
                            status={task.status}
                          />
                        </div>
                      </div>,
                    );
                  }

                  if (milestone) {
                    const mDates = getMilestoneDates(milestone);
                    const msDone =
                      milestone.status === "done" ||
                      milestone.client_approved;
                    const msColor = msDone
                      ? "var(--status-healthy)"
                      : MILESTONE_PURPLE;
                    const msRowId = `milestone:${milestone.id}`;
                    const msHover = hoveredRowId === msRowId;
                    const msWash = msHover ? hoverWash(msColor) : undefined;
                    const msRowY = y;
                    y += GANTT_TASK_ROW_H;

                    rowNodes.push(
                      <div
                        key={`ms-row-${milestone.id}`}
                        className="absolute left-0 right-0 z-[2] flex"
                        style={{ top: msRowY, height: GANTT_TASK_ROW_H }}
                        onMouseEnter={() => setHoveredRowId(msRowId)}
                        onMouseLeave={() =>
                          setHoveredRowId((id) =>
                            id === msRowId ? null : id,
                          )
                        }
                      >
                        <div
                          className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-b border-[var(--border)] pl-8 pr-2"
                          style={{
                            width: GANTT_LABEL_PX,
                            height: GANTT_TASK_ROW_H,
                            backgroundColor: msWash ?? "var(--bg)",
                          }}
                        >
                          <Star
                            size={12}
                            className="shrink-0"
                            style={{ color: msColor }}
                            fill="currentColor"
                          />
                          <span
                            className={cn(
                              "min-w-0 truncate text-[11px] font-medium",
                              msDone
                                ? "text-[var(--status-healthy)] line-through"
                                : "text-[var(--text-muted)]",
                            )}
                            title={milestone.name}
                          >
                            {milestone.name}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "relative shrink-0 border-b border-[var(--border)]",
                            readOnly && "cursor-grab",
                          )}
                          style={{
                            width: totalWidth,
                            height: GANTT_TASK_ROW_H,
                            backgroundColor: msWash,
                          }}
                          onPointerDown={startBlankPan}
                        >
                          <ScheduleRowHitLayer
                            columns={columns}
                            width={totalWidth}
                            height={GANTT_TASK_ROW_H}
                            interactive={false}
                          />
                          <GanttMilestoneMarker
                            dates={mDates}
                            columns={columns}
                            done={msDone}
                            title={milestone.name}
                            readOnly={readOnly}
                            onPointerDown={(e) => {
                              startDrag(
                                e,
                                {
                                  kind: "milestone",
                                  milestoneId: milestone.id,
                                },
                                "move",
                                mDates,
                                [],
                              );
                            }}
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

  if (viewportExpanded) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] p-3">
        {boardInner}
      </div>
    );
  }

  return boardInner;
}
