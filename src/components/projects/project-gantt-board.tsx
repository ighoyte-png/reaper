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
import { format, parseISO, startOfDay } from "date-fns";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  Star,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { PersonAvatar } from "@/components/people/person-avatar";
import { buttonClass } from "@/components/ui/button";
import { DateInput, Field, ConfirmDialog, inputClass } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { PHONE_MEDIA_QUERY, useIsPhone } from "@/lib/hooks/use-media-query";
import { RichNotesHtml } from "@/components/ui/simple-rich-text";
import { ScheduleRowHitLayer } from "@/components/schedule/schedule-row-hit-layer";
import { TaskStatusTag } from "@/components/tasks/task-status-tag";
import { useData } from "@/lib/data/store";
import { cn } from "@/lib/cn";
import {
  parseDateKey,
  shiftWeek,
  shiftWorkingDays,
  toDateKey,
  weekStart,
  workingDayDelta,
  workingDaysBetween,
} from "@/lib/domain/dates";
import {
  barPastFutureSplit,
  clampDateRange,
  ganttListsForProject,
  ganttTasksForList,
  GANTT_DAY_W_DESKTOP,
  GANTT_DAY_W_NARROW,
  GANTT_HATCH_STYLE,
  GANTT_LABEL_COLLAPSED_PX,
  GANTT_LABEL_PX,
  GANTT_LIST_ROW_H,
  GANTT_TASK_ROW_H,
  listBarColor,
  listIsComplete,
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
import { personAvatarColor, resolveAuthorLabel } from "@/lib/domain/people";
import {
  canCompleteTask,
  isDownstreamOfOpenClientReview,
  listDisplayOrder,
  taskStatusLabel,
  taskVisualTone,
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
  Project,
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

type GanttUndoEntry = {
  tasks?: Task[];
  taskLists?: TaskList[];
  milestones?: Milestone[];
  project?: Project;
};

const UNDO_STACK_CAP = 50;

function cloneTask(task: Task): Task {
  return { ...task };
}

function cloneTaskList(list: TaskList): TaskList {
  return { ...list };
}

function cloneMilestone(milestone: Milestone): Milestone {
  return { ...milestone };
}

function cloneProject(project: Project): Project {
  return { ...project };
}

/** Reorder root tasks while keeping parent→children clumps intact. */
function flattenGanttTasksByRootOrder(
  listTasks: Task[],
  rootOrder: string[],
): Task[] {
  const byId = new Map(listTasks.map((t) => [t.id, t]));
  const childrenByParent = new Map<string, Task[]>();
  for (const t of listTasks) {
    if (!t.parent_id) continue;
    const arr = childrenByParent.get(t.parent_id) ?? [];
    arr.push(t);
    childrenByParent.set(t.parent_id, arr);
  }
  for (const arr of childrenByParent.values()) {
    arr.sort(
      (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title),
    );
  }
  const out: Task[] = [];
  const seen = new Set<string>();
  for (const rootId of rootOrder) {
    const root = byId.get(rootId);
    if (!root || root.parent_id) continue;
    out.push(root);
    seen.add(root.id);
    for (const c of childrenByParent.get(rootId) ?? []) {
      out.push(c);
      seen.add(c.id);
    }
  }
  for (const t of listDisplayOrder(listTasks)) {
    if (!seen.has(t.id)) out.push(t);
  }
  return out;
}

function moveRootOrder(
  rootOrder: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (fromIndex === toIndex) return rootOrder;
  const next = [...rootOrder];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return rootOrder;
  next.splice(toIndex, 0, moved);
  return next;
}

/** Pick insert index by nearest group midpoint under the pointer. */
function reorderTargetIndex(
  clientY: number,
  originClientY: number,
  fromIndex: number,
  rootHeights: number[],
): number {
  const n = rootHeights.length;
  if (n === 0) return 0;
  let fromTop = 0;
  for (let i = 0; i < fromIndex; i++) fromTop += rootHeights[i] ?? 0;
  const fromH = rootHeights[fromIndex] ?? GANTT_TASK_ROW_H;
  const dragCenter = fromTop + fromH / 2 + (clientY - originClientY);
  let best = fromIndex;
  let bestDist = Number.POSITIVE_INFINITY;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = rootHeights[i] ?? GANTT_TASK_ROW_H;
    const dist = Math.abs(dragCenter - (y + h / 2));
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
    y += h;
  }
  return best;
}

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
  /** Day under pointer at drag start (for move grab-relative deltas). */
  grabDateKey: string;
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
  // Soft tint of the row color on --bg so labels stay legible (was 50% black).
  return `color-mix(in srgb, ${color} 12%, var(--bg))`;
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
  const dayW = columns[0]?.width ?? 0;
  const crCenterInLastDay = showCrStar && dayW > 0;
  const availableForLabel = geo.width - BAR_PAD_X * 2;
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
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-[1] overflow-hidden rounded-r-sm",
            pastFraction > 0 &&
              "border-l border-[var(--progress-approved-hatch)]",
          )}
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
      {crCenterInLastDay ? (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-[3] flex items-center justify-center"
          style={{ width: Math.min(dayW, geo.width) }}
          aria-hidden
        >
          <Star
            size={Math.min(12, Math.max(8, Math.min(dayW, height) - 4))}
            className="text-white"
            fill="currentColor"
          />
        </div>
      ) : null}
      <div className="relative z-[2] flex h-full min-w-0 flex-1 items-center gap-1 px-1.5">
        {showLabel ? (
          <span
            className={cn(
              "pointer-events-none min-w-0 flex-1 truncate text-left text-xs font-medium text-white",
              crCenterInLastDay && "pr-3",
            )}
          >
            {label}
          </span>
        ) : (
          <span className="min-w-0 flex-1" aria-hidden />
        )}
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

function GanttChipBesideBar({
  dates,
  columns,
  children,
}: {
  dates: GanttBarDates;
  columns: ScheduleColumn[];
  children: ReactNode;
}) {
  const geo = spanColumnsPx(columns, dates.startKey, dates.endKey);
  if (!geo) return null;
  return (
    <div
      className="pointer-events-none absolute top-1/2 z-[11] -translate-y-1/2"
      style={{ left: geo.left + geo.width + STATUS_CHIP_GAP }}
    >
      {children}
    </div>
  );
}

function TaskStatusChipBesideBar({
  dates,
  columns,
  status,
  isClientReview = false,
  isDownstreamHold = false,
}: {
  dates: GanttBarDates;
  columns: ScheduleColumn[];
  status: TaskStatus;
  isClientReview?: boolean;
  isDownstreamHold?: boolean;
}) {
  return (
    <GanttChipBesideBar dates={dates} columns={columns}>
      <TaskStatusTag
        status={status}
        isClientReview={isClientReview}
        isDownstreamHold={isDownstreamHold}
        className="origin-left scale-90 shadow-sm"
      />
    </GanttChipBesideBar>
  );
}

function MilestoneChipBesideBar({
  dates,
  columns,
  done,
}: {
  dates: GanttBarDates;
  columns: ScheduleColumn[];
  done: boolean;
}) {
  return (
    <GanttChipBesideBar dates={dates} columns={columns}>
      <span
        className={cn(
          "origin-left scale-90 rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide shadow-sm",
          done &&
            "bg-[var(--status-healthy)]/15 text-[var(--status-healthy)]",
        )}
        style={
          done
            ? undefined
            : {
                color: MILESTONE_PURPLE,
                backgroundColor: `color-mix(in srgb, ${MILESTONE_PURPLE} 18%, transparent)`,
              }
        }
      >
        {done ? "Approved" : "Milestone"}
      </span>
    </GanttChipBesideBar>
  );
}

function ListCompleteChipBesideBar({
  dates,
  columns,
}: {
  dates: GanttBarDates;
  columns: ScheduleColumn[];
}) {
  return (
    <GanttChipBesideBar dates={dates} columns={columns}>
      <span className="origin-left scale-90 rounded bg-[var(--status-healthy)]/15 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--status-healthy)] shadow-sm">
        List Complete
      </span>
    </GanttChipBesideBar>
  );
}

/** Fixed leading slot so grip / icons keep titles left-aligned. */
const GANTT_LABEL_LEAD_PX = 20;

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
        const author = c.author_profile_id
          ? profiles.find((p) => p.id === c.author_profile_id)
          : undefined;
        const authorPerson = c.author_profile_id
          ? people.find((p) => p.profile_id === c.author_profile_id)
          : undefined;
        const name = resolveAuthorLabel(author, authorPerson);
        const wasEdited = Boolean(
          c.updated_at && c.updated_at !== c.created_at,
        );
        return (
          <div
            key={c.id}
            className="rounded-md border border-[var(--border)] bg-[var(--comment-bg)] p-3 text-sm"
          >
            <div className="flex items-start gap-3">
              <PersonAvatar
                avatarUrl={authorPerson?.avatar_url}
                avatarAttachmentId={authorPerson?.avatar_attachment_id}
                name={name}
                size="row"
                fallback="initials"
                className="shrink-0"
                personId={authorPerson?.id}
                color={authorPerson ? personAvatarColor(authorPerson) : null}
              />
              <div className="min-w-0 flex-1">
                <div className="mb-3">
                  <p className="truncate text-sm font-semibold leading-snug text-[var(--text)]">
                    {name}
                  </p>
                  <div className="mt-0.5 space-y-0.5 text-xs tabular-nums text-[var(--text-muted)]">
                    <p>
                      {format(parseISO(c.created_at), "MMM d, yyyy · h:mm a")}
                    </p>
                    {wasEdited && c.updated_at ? (
                      <p className="italic">
                        Edited{" "}
                        {format(parseISO(c.updated_at), "MMM d, yyyy · h:mm a")}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="leading-relaxed">
                  <RichNotesHtml html={c.body} />
                </div>
              </div>
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
  sticky = false,
  onClose,
  onSaveTasks,
  onDeleteTask,
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
  /** Pin beside the chart while the page scrolls (non-fullscreen). */
  sticky?: boolean;
  onClose: () => void;
  onSaveTasks: (updates: Task[]) => void;
  onDeleteTask?: (taskId: string) => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("edit");
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    setConfirmDelete(false);
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
    <>
    <aside
      className={cn(
        "flex w-80 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg)]",
        sticky
          ? "sticky top-0 z-30 max-h-dvh self-start"
          : "h-full min-h-0",
      )}
    >
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
                className={cn(inputClass, "mt-0 h-8")}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="End date">
              <DateInput
                className={cn(inputClass, "mt-0 h-8")}
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
                className={cn(inputClass, "mt-0 h-8")}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="End date">
              <DateInput
                className={cn(inputClass, "mt-0 h-8")}
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
            {onDeleteTask ? (
              <button
                type="button"
                className="h-8 w-full cursor-pointer rounded-md px-3 text-sm text-[var(--status-over)] hover:bg-[var(--row-hover)]"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            ) : null}
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
    {confirmDelete && task && onDeleteTask ? (
      <ConfirmDialog
        title="Delete task?"
        message="Delete this task and its subtasks? This can't be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDeleteTask(task.id);
        }}
      />
    ) : null}
    </>
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
    deleteTask,
    myPerson,
  } = useData();
  const isPhone = useIsPhone();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSnapshot | null>(null);
  const dragStartClient = useRef({ x: 0, y: 0 });
  const edgeScrollRaf = useRef(0);
  const seenListIdsRef = useRef<Set<string>>(new Set());
  const panRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
    startX: number;
    startY: number;
    didMove: boolean;
    /** Vertical scrollport when the Gantt itself does not scroll Y. */
    verticalEl: HTMLElement | null;
  } | null>(null);
  const pendingScrollToKeyRef = useRef<string | null>(null);
  const [reorderGhost, setReorderGhost] = useState<{
    title: string;
    x: number;
    y: number;
  } | null>(null);
  /** Live vertical reorder preview (committed only on pointer up). */
  const [reorderPreview, setReorderPreview] = useState<{
    listId: string;
    taskId: string;
    fromIndex: number;
    toIndex: number;
    rootOrder: string[];
  } | null>(null);
  const reorderRef = useRef<{
    taskId: string;
    listId: string;
    originClientY: number;
    fromIndex: number;
    toIndex: number;
    rootOrder: string[];
    rootHeights: number[];
    initialTasks: Task[];
    pointerId: number;
  } | null>(null);
  const undoStackRef = useRef<GanttUndoEntry[]>([]);
  const applyingUndoRef = useRef(false);
  const performUndoRef = useRef(() => {});
  const [undoDepth, setUndoDepth] = useState(0);

  useEffect(() => {
    undoStackRef.current = [];
    setUndoDepth(0);
  }, [projectId]);

  const [anchor, setAnchor] = useState(() => weekStart(new Date()));
  const [expandedLists, setExpandedLists] = useState<Set<string>>(() => new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [panning, setPanning] = useState(false);
  const [dragVersion, setDragVersion] = useState(0);
  const [containerNarrow, setContainerNarrow] = useState(false);
  const [halfZoom, setHalfZoom] = useState(false);
  const [viewportExpanded, setViewportExpanded] = useState(false);
  /** Task-list name column — open on desktop; collapsed on phone (same query as useIsPhone). */
  const [labelsCollapsed, setLabelsCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(PHONE_MEDIA_QUERY).matches;
  });
  const labelPx = labelsCollapsed ? GANTT_LABEL_COLLAPSED_PX : GANTT_LABEL_PX;
  // Phone: open in fullscreen pan mode by default (and when entering Gantt).
  useEffect(() => {
    if (isPhone) setViewportExpanded(true);
  }, [isPhone]);
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
        isNarrow: containerNarrow,
      }),
    [anchor, today, dayW, containerNarrow],
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerNarrow(entry.contentRect.width < 1024);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const body = scrollRef.current;
    const header = headerScrollRef.current;
    if (!body || !header) return;
    header.scrollLeft = body.scrollLeft;
  }, [totalWidth]);

  // Only auto-expand newly seen incomplete lists (completed stay collapsed on load;
  // do not re-expand user-collapsed lists after drag).
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
        const tasks = ganttTasksForList(projectTasks, list.id);
        if (listIsComplete(list, tasks, today)) continue;
        if (!next.has(list.id)) {
          next.add(list.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ganttLists, projectTasks, today]);

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
      let tasks = ganttTasksForList(projectTasks, list.id);
      if (reorderPreview?.listId === list.id) {
        const previewOrder = moveRootOrder(
          reorderPreview.rootOrder,
          reorderPreview.fromIndex,
          reorderPreview.toIndex,
        );
        tasks = flattenGanttTasksByRootOrder(tasks, previewOrder);
      }
      const milestone = list.milestone_id
        ? projectMilestones.find((m) => m.id === list.milestone_id) ?? null
        : null;
      return { list, tasks, milestone };
    });
  }, [ganttLists, projectTasks, projectMilestones, reorderPreview]);

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

  const edgeScrollClientXRef = useRef(0);

  const runEdgeScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      edgeScrollRaf.current = 0;
      return;
    }
    const clientX = edgeScrollClientXRef.current;
    const rect = el.getBoundingClientRect();
    const labelEdge = rect.left + labelPx;
    let dx = 0;
    if (clientX < labelEdge + EDGE_SCROLL_PX) {
      dx = -EDGE_SCROLL_SPEED;
    } else if (clientX > rect.right - EDGE_SCROLL_PX) {
      dx = EDGE_SCROLL_SPEED;
    }
    if (dx === 0) {
      edgeScrollRaf.current = 0;
      return;
    }
    el.scrollLeft += dx;
    const header = headerScrollRef.current;
    if (header) header.scrollLeft = el.scrollLeft;
    edgeScrollRaf.current = requestAnimationFrame(runEdgeScroll);
  }, [labelPx]);

  const ensureEdgeScroll = useCallback(
    (clientX: number) => {
      edgeScrollClientXRef.current = clientX;
      if (edgeScrollRaf.current) return;
      edgeScrollRaf.current = requestAnimationFrame(runEdgeScroll);
    },
    [runEdgeScroll],
  );

  const columnFromClientX = useCallback(
    (clientX: number): ScheduleColumn | null => {
      const scrollEl = scrollRef.current;
      if (!scrollEl || columns.length === 0) return null;
      const rect = scrollEl.getBoundingClientRect();
      const x =
        clientX - rect.left + scrollEl.scrollLeft - labelPx;
      return columnAtOffsetPx(columns, x);
    },
    [columns, labelPx],
  );

  const applyDragToColumn = useCallback(
    (col: ScheduleColumn) => {
      const snap = dragRef.current;
      if (!snap) return;

      if (snap.target.kind === "project") {
        if (snap.mode === "move") {
          const delta = workingDayDelta(snap.grabDateKey, col.startKey);
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
        const delta = workingDayDelta(snap.grabDateKey, col.startKey);
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
          const delta = workingDayDelta(snap.grabDateKey, col.startKey);
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
        const delta = workingDayDelta(snap.grabDateKey, col.startKey);
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

  const pushUndo = useCallback(
    (entry: GanttUndoEntry) => {
      if (readOnly || applyingUndoRef.current) return;
      const hasWork =
        Boolean(entry.project) ||
        (entry.tasks?.length ?? 0) > 0 ||
        (entry.taskLists?.length ?? 0) > 0 ||
        (entry.milestones?.length ?? 0) > 0;
      if (!hasWork) return;
      undoStackRef.current.push(entry);
      if (undoStackRef.current.length > UNDO_STACK_CAP) {
        undoStackRef.current.shift();
      }
      setUndoDepth(undoStackRef.current.length);
    },
    [readOnly],
  );

  const performUndo = useCallback(() => {
    if (readOnly) return;
    const entry = undoStackRef.current.pop();
    setUndoDepth(undoStackRef.current.length);
    if (!entry) return;
    applyingUndoRef.current = true;
    if (entry.project) upsertProject(entry.project);
    for (const list of entry.taskLists ?? []) upsertTaskList(list);
    for (const milestone of entry.milestones ?? []) {
      upsertMilestone(milestone);
    }
    for (const task of entry.tasks ?? []) upsertTask(task);
    applyingUndoRef.current = false;
  }, [readOnly, upsertProject, upsertTaskList, upsertMilestone, upsertTask]);
  performUndoRef.current = performUndo;

  useEffect(() => {
    if (readOnly) return;
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      if (e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      performUndoRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly]);

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
      pushUndo({ project: cloneProject(project) });
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
        pushUndo({ milestones: [cloneMilestone(ms)] });
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
      const undoLists: TaskList[] = [cloneTaskList(list)];
      const undoMilestones: Milestone[] = [];
      const undoTasks: Task[] = [];
      if (snap.mode === "move") {
        for (const [otherId] of snap.cascadeListOrigins) {
          const other = ganttLists.find((l) => l.id === otherId);
          if (other) undoLists.push(cloneTaskList(other));
        }
        for (const [msId] of snap.cascadeMilestoneOrigins) {
          const ms = projectMilestones.find((m) => m.id === msId);
          if (ms) undoMilestones.push(cloneMilestone(ms));
        }
      }
      for (const [taskId] of snap.listTaskOrigins) {
        const task = projectTasks.find((t) => t.id === taskId);
        if (task) undoTasks.push(cloneTask(task));
      }
      pushUndo({
        taskLists: undoLists,
        milestones: undoMilestones,
        tasks: undoTasks,
      });
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

    const undoTasks = snap.taskIds
      .map((taskId) => projectTasks.find((t) => t.id === taskId))
      .filter((t): t is Task => Boolean(t))
      .map(cloneTask);
    pushUndo({ tasks: undoTasks });
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
    pushUndo,
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
      const pointerCol = columnFromClientX(e.clientX);
      const grabDays = workingDaysBetween(dates.startKey, dates.endKey);
      const pointerKey = pointerCol?.startKey ?? dates.startKey;
      const grabDateKey = grabDays.includes(pointerKey)
        ? pointerKey
        : dates.startKey;
      dragRef.current = {
        target,
        mode,
        originStart: dates.startKey,
        originEnd: dates.endKey,
        grabDateKey,
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
    [readOnly, columnFromClientX],
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
      if (!snap.didMove) return;
      const col = columnFromClientX(e.clientX);
      if (col) applyDragToColumn(col);
      ensureEdgeScroll(e.clientX);
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
    ensureEdgeScroll,
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
      if (
        Math.abs(e.clientX - pan.startX) > CLICK_MOVE_THRESHOLD ||
        Math.abs(e.clientY - pan.startY) > CLICK_MOVE_THRESHOLD
      ) {
        pan.didMove = true;
      }
      pan.lastX = e.clientX;
      pan.lastY = e.clientY;
      if (!pan.didMove) return;
      el.scrollLeft -= dx;
      const header = headerScrollRef.current;
      if (header) header.scrollLeft = el.scrollLeft;
      if (viewportExpanded) {
        el.scrollTop -= dy;
      } else if (pan.verticalEl) {
        pan.verticalEl.scrollTop -= dy;
      }
    };
    const onUp = (e: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || e.pointerId !== pan.pointerId) return;
      const dismiss = !pan.didMove && showDrawer && !readOnly;
      panRef.current = null;
      setPanning(false);
      if (dismiss) setSelectedTaskIds([]);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [panning, viewportExpanded, showDrawer, readOnly]);

  function startBlankPan(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    if (dragging) return;
    e.preventDefault();
    const scrollEl = scrollRef.current;
    let verticalEl: HTMLElement | null = null;
    if (!viewportExpanded && scrollEl) {
      let node: HTMLElement | null = scrollEl.parentElement;
      while (node && node !== document.documentElement) {
        const { overflowY } = getComputedStyle(node);
        if (
          (overflowY === "auto" ||
            overflowY === "scroll" ||
            overflowY === "overlay") &&
          node.scrollHeight > node.clientHeight + 1
        ) {
          verticalEl = node;
          break;
        }
        node = node.parentElement;
      }
      if (!verticalEl) {
        verticalEl = (document.scrollingElement as HTMLElement | null) ?? null;
      }
    }
    panRef.current = {
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      didMove: false,
      verticalEl,
    };
    setPanning(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function syncHeaderFromBody() {
    const body = scrollRef.current;
    const header = headerScrollRef.current;
    if (!body || !header || syncingScrollRef.current) return;
    if (header.scrollLeft === body.scrollLeft) return;
    syncingScrollRef.current = true;
    header.scrollLeft = body.scrollLeft;
    syncingScrollRef.current = false;
  }

  function syncBodyFromHeader() {
    const body = scrollRef.current;
    const header = headerScrollRef.current;
    if (!body || !header || syncingScrollRef.current) return;
    if (body.scrollLeft === header.scrollLeft) return;
    syncingScrollRef.current = true;
    body.scrollLeft = header.scrollLeft;
    syncingScrollRef.current = false;
  }

  function goToday() {
    setAnchor(weekStart(new Date()));
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = 0;
  }

  const earliestGanttStartKey = useMemo(() => {
    let earliest: string | null = project?.start_date ?? null;
    const consider = (key: string | null | undefined) => {
      if (!key) return;
      if (!earliest || key < earliest) earliest = key;
    };
    for (const list of ganttLists) {
      consider(list.start_date);
      for (const task of ganttTasksForList(projectTasks, list.id)) {
        consider(task.start_date ?? task.due_date);
      }
      if (list.milestone_id) {
        const ms = projectMilestones.find((m) => m.id === list.milestone_id);
        consider(ms?.start_date ?? ms?.due_date);
      }
    }
    return earliest;
  }, [project?.start_date, ganttLists, projectTasks, projectMilestones]);

  function goShowStart() {
    if (!earliestGanttStartKey) return;
    pendingScrollToKeyRef.current = earliestGanttStartKey;
    setAnchor(weekStart(parseDateKey(earliestGanttStartKey)));
  }

  useLayoutEffect(() => {
    const key = pendingScrollToKeyRef.current;
    if (!key) return;
    const idx = columns.findIndex((c) => c.startKey === key);
    if (idx < 0) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, columnOffsetPx(columns, idx) - dayW * 2);
    const header = headerScrollRef.current;
    if (header) header.scrollLeft = el.scrollLeft;
    pendingScrollToKeyRef.current = null;
  }, [columns, dayW]);

  function shiftAnchorWeek(delta: number) {
    setAnchor((a) => shiftWeek(a, delta));
  }

  const startTaskReorder = useCallback(
    (e: ReactPointerEvent, task: Task) => {
      if (readOnly || e.button !== 0 || task.parent_id) return;
      e.stopPropagation();
      e.preventDefault();
      const listTasks = ganttTasksForList(projectTasks, task.list_id);
      const siblings = listTasks.filter((t) => !t.parent_id).map((t) => t.id);
      if (siblings.length < 2) return;
      const fromIndex = siblings.indexOf(task.id);
      if (fromIndex < 0) return;
      const childCountByRoot = new Map<string, number>();
      for (const t of listTasks) {
        if (!t.parent_id) continue;
        childCountByRoot.set(
          t.parent_id,
          (childCountByRoot.get(t.parent_id) ?? 0) + 1,
        );
      }
      const rootHeights = siblings.map(
        (id) => (1 + (childCountByRoot.get(id) ?? 0)) * GANTT_TASK_ROW_H,
      );
      const initialTasks = siblings
        .map((id) => projectTasks.find((t) => t.id === id))
        .filter((t): t is Task => Boolean(t))
        .map(cloneTask);
      reorderRef.current = {
        taskId: task.id,
        listId: task.list_id,
        originClientY: e.clientY,
        fromIndex,
        toIndex: fromIndex,
        rootOrder: siblings,
        rootHeights,
        initialTasks,
        pointerId: e.pointerId,
      };
      setReorderPreview({
        listId: task.list_id,
        taskId: task.id,
        fromIndex,
        toIndex: fromIndex,
        rootOrder: siblings,
      });
      setReorderGhost({
        title: task.title,
        x: e.clientX,
        y: e.clientY,
      });
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [readOnly, projectTasks],
  );

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const snap = reorderRef.current;
      if (!snap || e.pointerId !== snap.pointerId) return;
      setReorderGhost({
        title:
          projectTasks.find((t) => t.id === snap.taskId)?.title ?? "Task",
        x: e.clientX,
        y: e.clientY,
      });
      const to = reorderTargetIndex(
        e.clientY,
        snap.originClientY,
        snap.fromIndex,
        snap.rootHeights,
      );
      if (to === snap.toIndex) return;
      snap.toIndex = to;
      setReorderPreview({
        listId: snap.listId,
        taskId: snap.taskId,
        fromIndex: snap.fromIndex,
        toIndex: to,
        rootOrder: snap.rootOrder,
      });
    }
    function onUp(e: PointerEvent) {
      const snap = reorderRef.current;
      if (!snap || e.pointerId !== snap.pointerId) return;
      reorderRef.current = null;
      setReorderGhost(null);
      setReorderPreview(null);
      if (snap.toIndex === snap.fromIndex) return;
      const next = moveRootOrder(
        snap.rootOrder,
        snap.fromIndex,
        snap.toIndex,
      );
      next.forEach((id, i) => {
        const task = projectTasks.find((t) => t.id === id);
        if (!task || task.sort_order === i) return;
        upsertTask({ ...task, sort_order: i });
      });
      pushUndo({ tasks: snap.initialTasks });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [projectTasks, upsertTask, pushUndo]);

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
        "relative flex min-w-0",
        viewportExpanded
          ? "h-full min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]"
          : "min-h-0 items-start",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          viewportExpanded && "h-full min-h-0",
        )}
      >
        <div className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
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
            <button
              type="button"
              className="h-8 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              onClick={goShowStart}
              disabled={!earliestGanttStartKey}
            >
              Show Start
            </button>
              <NavBtn onClick={() => shiftAnchorWeek(1)} label="Next week">
                <ChevronRight size={16} />
              </NavBtn>
            </div>
            <p className="text-sm font-medium">{rangeLabel}</p>
            <div className="ml-auto flex items-center gap-1">
              {!readOnly ? (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => performUndo()}
                  disabled={undoDepth === 0}
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                >
                  <Undo2 size={16} />
                </button>
              ) : null}
              <NavBtn
                onClick={() => setHalfZoom((z) => !z)}
                label={
                  halfZoom
                    ? "Zoom in (full day width)"
                    : "Zoom out (half day width)"
                }
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

          <div
            ref={headerScrollRef}
            className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            onScroll={syncBodyFromHeader}
          >
            <div
              className="transition-[min-width] duration-200 ease-out"
              style={{ minWidth: labelPx + totalWidth }}
            >
              <div className="flex border-b border-[var(--border)]">
                <div
                  className="sticky left-0 z-40 flex shrink-0 items-center justify-center border-r border-[var(--border)] bg-[var(--bg)] transition-[width] duration-200 ease-out"
                  style={{ width: labelPx, height: 24 }}
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
              <div className="flex">
                <div
                  className={cn(
                    "sticky left-0 z-40 flex shrink-0 items-center border-r border-[var(--border)] bg-[var(--bg)] transition-[width] duration-200 ease-out",
                    labelsCollapsed ? "justify-center px-0" : "justify-start pl-2",
                  )}
                  style={{ width: labelPx, height: 28 }}
                >
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                    onClick={() => setLabelsCollapsed((v) => !v)}
                    aria-label={
                      labelsCollapsed
                        ? "Show task list names"
                        : "Hide task list names"
                    }
                  >
                    {labelsCollapsed ? (
                      <PanelLeftOpen size={14} />
                    ) : (
                      <PanelLeftClose size={14} />
                    )}
                  </button>
                </div>
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
                          holidayName &&
                            !col.isToday &&
                            "bg-[var(--leave-block-wash)]",
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
          </div>
        </div>

        <div
          ref={scrollRef}
          className={cn(
            "min-w-0 w-full",
            viewportExpanded
              ? "min-h-0 flex-1 overflow-auto overscroll-contain"
              : "overflow-x-auto",
            panning && "cursor-grabbing select-none",
          )}
          onScroll={syncHeaderFromBody}
        >
          <div
            className="transition-[min-width] duration-200 ease-out"
            style={{ minWidth: labelPx + totalWidth }}
          >
            {/* Body rows */}
            <div className="relative" style={{ height: totalBodyHeight }}>
              {holidayByDate.size > 0 ? (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-[1]"
                  style={{ left: labelPx, width: totalWidth }}
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

              {/* Project start/end vertical guides (under row/sticky label z) */}
              {(projectGuideKeys.start || projectGuideKeys.end) && (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-[1]"
                  style={{ left: labelPx, width: totalWidth }}
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
                        className={cn(
                          "sticky left-0 z-20 flex shrink-0 items-center border-r border-b border-[var(--border)] bg-[var(--bg)] transition-[width] duration-200 ease-out",
                          labelsCollapsed ? "justify-center px-0" : "px-2",
                        )}
                        style={{
                          width: labelPx,
                          height: GANTT_TASK_ROW_H,
                          backgroundColor: projWash ?? "var(--bg)",
                        }}
                        title={labelsCollapsed ? project.name : undefined}
                      >
                        {labelsCollapsed ? (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                            aria-hidden
                          />
                        ) : (
                          <span className="min-w-0 truncate text-[11px] font-semibold">
                            {project.name}
                          </span>
                        )}
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
                        className={cn(
                          "sticky left-0 z-20 flex shrink-0 items-center border-r border-b border-[var(--border)] transition-[width] duration-200 ease-out",
                          labelsCollapsed ? "justify-center gap-0 px-0" : "gap-1 px-2",
                        )}
                        style={{
                          width: labelPx,
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
                          title={labelsCollapsed ? list.name : undefined}
                        >
                          <ChevronDown
                            size={14}
                            className={cn(
                              "transition-transform",
                              !expanded && "-rotate-90",
                            )}
                          />
                        </button>
                        {!labelsCollapsed ? (
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left text-xs font-semibold hover:underline"
                            title={list.name}
                            onClick={() => toggleListExpanded(list.id)}
                          >
                            {list.name}
                          </button>
                        ) : null}
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
                        {listIsComplete(list, tasks, today) ? (
                          <ListCompleteChipBesideBar
                            dates={listDates}
                            columns={columns}
                          />
                        ) : null}
                      </div>
                    </div>,
                  );

                  if (!expanded) continue;

                  const listReordering = reorderPreview?.listId === list.id;
                  const draggingTaskId = listReordering
                    ? reorderPreview.taskId
                    : null;

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
                    const isDraggedGroup =
                      draggingTaskId != null &&
                      (task.id === draggingTaskId ||
                        task.parent_id === draggingTaskId);

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
                        style={{
                          top: taskRowY,
                          height: GANTT_TASK_ROW_H,
                          transition: listReordering
                            ? "top 150ms ease"
                            : undefined,
                          // Leave an empty drop footprint; floating ghost is the drag cue.
                          opacity: isDraggedGroup ? 0 : undefined,
                          pointerEvents: isDraggedGroup ? "none" : undefined,
                          zIndex: isDraggedGroup ? 3 : undefined,
                        }}
                        onMouseEnter={() => setHoveredRowId(taskRowId)}
                        onMouseLeave={() =>
                          setHoveredRowId((id) =>
                            id === taskRowId ? null : id,
                          )
                        }
                      >
                        <div
                          className={cn(
                            "sticky left-0 z-20 flex shrink-0 items-center border-r border-b border-[var(--border)] transition-[width] duration-200 ease-out",
                            labelsCollapsed
                              ? "justify-center gap-0 px-0"
                              : "gap-1 pl-8 pr-2",
                          )}
                          style={{
                            width: labelPx,
                            height: GANTT_TASK_ROW_H,
                            backgroundColor: taskWash ?? "var(--bg)",
                          }}
                          title={labelsCollapsed ? task.title : undefined}
                        >
                          {labelsCollapsed ? (
                            taskShowsClientReviewStar(task) ? (
                              <Star
                                size={10}
                                className={cn(
                                  task.status === "complete"
                                    ? "fill-[var(--status-healthy)] text-[var(--status-healthy)]"
                                    : "fill-[#f59e0b] text-[#f59e0b]",
                                )}
                                aria-hidden
                              />
                            ) : (
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: barColor }}
                                aria-hidden
                              />
                            )
                          ) : (
                            <>
                              <span
                                className="inline-flex shrink-0 items-center justify-center"
                                style={{ width: GANTT_LABEL_LEAD_PX }}
                              >
                                {!readOnly && !task.parent_id ? (
                                  <button
                                    type="button"
                                    className="touch-none cursor-grab p-0.5 text-[var(--text-muted)] opacity-60 hover:opacity-100 active:cursor-grabbing"
                                    aria-label="Drag to reorder within list"
                                    title="Drag to reorder within list"
                                    onPointerDown={(e) =>
                                      startTaskReorder(e, task)
                                    }
                                  >
                                    <GripVertical size={12} />
                                  </button>
                                ) : taskShowsClientReviewStar(task) ? (
                                  <Star
                                    size={10}
                                    className={cn(
                                      task.status === "complete"
                                        ? "fill-[var(--status-healthy)] text-[var(--status-healthy)]"
                                        : "fill-[#f59e0b] text-[#f59e0b]",
                                    )}
                                    aria-hidden
                                  />
                                ) : null}
                              </span>
                              <span
                                className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]"
                                title={task.title}
                              >
                                {task.title}
                              </span>
                              {showAssignees && assignee ? (
                                <PersonAvatar
                                  avatarUrl={assignee.avatar_url}
                                  avatarAttachmentId={
                                    assignee.avatar_attachment_id
                                  }
                                  name={assignee.name}
                                  size="xs"
                                  fallback="initials"
                                  personId={assignee.id}
                                  color={personAvatarColor(assignee)}
                                  className="shrink-0"
                                />
                              ) : null}
                            </>
                          )}
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
                            isClientReview={task.is_client_review}
                            isDownstreamHold={
                              taskVisualTone(task, tasks) ===
                              "downstream_locked"
                            }
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
                          className={cn(
                            "sticky left-0 z-20 flex shrink-0 items-center border-r border-b border-[var(--border)] transition-[width] duration-200 ease-out",
                            labelsCollapsed
                              ? "justify-center gap-0 px-0"
                              : "gap-1 pl-8 pr-2",
                          )}
                          style={{
                            width: labelPx,
                            height: GANTT_TASK_ROW_H,
                            backgroundColor: msWash ?? "var(--bg)",
                          }}
                          title={labelsCollapsed ? milestone.name : undefined}
                        >
                          <span
                            className="inline-flex shrink-0 items-center justify-center"
                            style={{
                              width: labelsCollapsed
                                ? undefined
                                : GANTT_LABEL_LEAD_PX,
                            }}
                          >
                            <Star
                              size={labelsCollapsed ? 10 : 12}
                              style={{ color: msColor }}
                              fill="currentColor"
                            />
                          </span>
                          {!labelsCollapsed ? (
                            <span
                              className={cn(
                                "min-w-0 truncate text-[11px] font-medium",
                                msDone
                                  ? "text-[var(--status-healthy)]"
                                  : "text-[var(--text-muted)]",
                              )}
                              title={milestone.name}
                            >
                              {milestone.name}
                            </span>
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
                          <MilestoneChipBesideBar
                            dates={mDates}
                            columns={columns}
                            done={msDone}
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
          sticky={!viewportExpanded}
          onClose={() => setSelectedTaskIds([])}
          onSaveTasks={(updates) => {
            const before = updates
              .map((u) => projectTasks.find((t) => t.id === u.id))
              .filter((t): t is Task => Boolean(t))
              .map(cloneTask);
            pushUndo({ tasks: before });
            for (const t of updates) upsertTask(t);
          }}
          onDeleteTask={(id) => {
            const before = projectTasks
              .filter((t) => t.id === id || t.parent_id === id)
              .map(cloneTask);
            pushUndo({ tasks: before });
            deleteTask(id);
            setSelectedTaskIds([]);
          }}
        />
      ) : null}
      {reorderGhost ? (
        <div
          className="pointer-events-none fixed z-[80] max-w-xs truncate rounded-md border border-[var(--accent)]/40 bg-[var(--bg)] px-3 py-2 text-sm shadow-lg ring-1 ring-[var(--accent)]/20"
          style={{
            left: reorderGhost.x + 12,
            top: reorderGhost.y + 12,
          }}
        >
          {reorderGhost.title}
        </div>
      ) : null}
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
        Enable Gantt on task list(s) to start making your Gantt
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
