"use client";

import { Fragment, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition, memo, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { format, isWeekend, parseISO, addWeeks, subWeeks } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen, Plus, Save, Scissors, StickyNote, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { BurnBar } from "@/components/ui/burn-bar";
import { CurrencyChip } from "@/components/ui/currency-chip";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { inputClass, Modal, DateInput, ConfirmDialog } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PersonAvatar } from "@/components/people/person-avatar";
import { ProjectTaskBoard } from "@/components/projects/project-task-board";
import {
  assignmentIsOutOfSync,
  assignmentScheduleMoveLocked,
  boundTasksNotesHtml,
  isBoundTasksNotes,
  isGanttTask,
  isTasksRemovedNote,
  nextAvailableScheduleRange,
  desiredRangeCollidesOnProjectRow,
  rangeOverlapsAssignmentWithBoundTasks,
  syncNonGanttTaskDatesFromBindings,
  sortBoundTaskIdsByListOrder,
  taskBoundDatesMatchSpan,
} from "@/lib/domain/assignment-bound-tasks";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import {
  ManagerTag,
  ProjectManagerTag,
} from "@/components/projects/project-manager-person";
import {
  filterPeopleByPod,
  podsForPerson,
  scheduleProjectManagerPeople,
  sortPods,
  type PodFilter,
} from "@/lib/domain/pods";
import {
  readSchedulePodFilter,
  writeSchedulePodFilter,
} from "@/lib/schedule-pod-filter";
import {
  RichNotesHtml,
  SimpleRichTextEditor,
} from "@/components/ui/simple-rich-text";
import { BoundAssignmentNotesTooltip } from "@/components/schedule/bound-assignment-notes-tooltip";
import { Tooltip } from "@/components/ui/tooltip";
import { notesHasContent } from "@/lib/notes-html";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useViewAsOptional } from "@/lib/view-as";
import {
  budgetBurn,
  budgetHealth,
  formatHours,
  formatMoney,
  normalizeBudgetMode,
  roundAssignmentHours,
} from "@/lib/domain/budget";
import { projectCurrency } from "@/lib/domain/currency";
import { ProductionHoursPanel } from "@/components/budgets/production-hours-panel";
import {
  availableHoursInRange,
  buildBookedHoursByPersonDay,
  capacityLevel,
  dailyCapacityHours,
  isOnFullDayLeave,
  isOnLeave,
  personBookedHoursOnDay,
  sumBookedHoursFromDayMap,
  utilizationPct,
} from "@/lib/domain/capacity";
import { capacityThresholdsFromSettings } from "@/lib/domain/org-settings";
import {
  shiftMonth,
  shiftWeek,
  shiftWorkingDays,
  toDateKey,
  weekStart,
  workingDayDelta,
  workingDaysBetween,
} from "@/lib/domain/dates";
import {
  readUserViewPrefs,
  scheduleAnchorForDateWithOffset,
  scheduleAnchorForOffset,
} from "@/lib/user-view-prefs";
import { expandAssignmentInRange, expandAssignmentsInRange, occurrenceCoversDay, assignmentOverlapsDateRange, weeklySeriesEndDate, type AssignmentOccurrence } from "@/lib/domain/recurrence";
import {
  endWeeklySeriesBeforeOccurrence,
  splitWeeklySeriesForFuture,
  splitWeeklySeriesForInstance,
  withRecurrenceException,
} from "@/lib/domain/recurrence-split";
import {
  applyFullDayLeaveOverrideForDates,
  sliceWeeklyOccurrenceAt,
} from "@/lib/domain/leave-override";
import { fullDayLeaveDatesInRange } from "@/lib/domain/project-manager-schedule";
import {
  assignmentPlacementConflicts,
  clampResizeEnd,
  clampResizeStart,
  cleanupOverlappingAssignments,
  clipRangeToFreeDays,
  occupiedDaysForRow,
  punchProjectRowForInsertRange,
} from "@/lib/domain/assignment-occupancy";
import {
  buildScheduleColumns,
  columnIndexForDateKey,
  columnOffsetPx,
  columnsOverlapRange,
  overlapWorkingDays,
  spanColumnsPx,
  type ScheduleZoom,
} from "@/lib/domain/schedule-zoom";
import { ScheduleRowHitLayer } from "@/components/schedule/schedule-row-hit-layer";
import { cn } from "@/lib/cn";
import { useMediaQuery, useIsPhone } from "@/lib/hooks/use-media-query";
import {
  clientNameOf,
  projectDisplayColor,
  projectLabelWithClient,
  projectStatusLabel,
  sortClientsByName,
  sortPeopleByName,
  sortProjectsByClientThenName,
} from "@/lib/domain/sorting";
import { personAvatarColor } from "@/lib/domain/people";
import { projectTeamPersonIds } from "@/lib/domain/project-access";
import { ProjectStatusTag } from "@/components/projects/project-status-tag";
import {
  isFullDayLeave,
  leaveBlockLabel,
  leaveFromTypeOption,
  leaveTypeFromLeave,
  type LeaveTypeOption,
} from "@/lib/domain/leave";
import { leaveBlocksInRange, type LeaveBlock } from "@/lib/domain/leave-blocks";
import type {
  Assignment,
  AssignmentBoundTask,
  AssignmentStatus,
  Client,
  LeaveDay,
  LeaveKind,
  Person,
  Pod,
  PodMember,
  Project,
  ProjectStatus,
} from "@/lib/types";

const DAY_W_DESKTOP = 48;
const DAY_W_MOBILE = 40;
const DAY_H = 32;
const DAY_PAD_Y = 3;
const ROW_H = DAY_H + DAY_PAD_Y * 2;
const LABEL_DESKTOP = 248;
const LABEL_MOBILE = 136;

const TENTATIVE_HATCH_STYLE: CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(-45deg, transparent, transparent 3px, var(--assignment-tentative-hatch) 3px, var(--assignment-tentative-hatch) 6px)",
};

/** Tentative hatch: assignment is tentative, or its project is On Hold. */
function showsTentativeHatch(
  assignmentStatus: AssignmentStatus | string | null | undefined,
  projectStatus: ProjectStatus | string | null | undefined,
): boolean {
  return (
    assignmentStatus === "tentative" || projectStatus === "on_hold"
  );
}

const EMPTY_PROJECTS: Project[] = [];
const EMPTY_OCCS: AssignmentOccurrence[] = [];
const EMPTY_UTIL: PersonUtilBand[] = [];

type PersonUtilBand = {
  id: string;
  width: number;
  booked: number;
  available: number;
  pct: number;
  level: ReturnType<typeof capacityLevel>;
};

type UndoEntry =
  | { kind: "restore"; assignment: Assignment }
  | { kind: "remove"; id: string }
  | {
      kind: "assignments";
      restoreAssignments: Assignment[];
      removeAssignmentIds: string[];
    }
  | {
      kind: "leave";
      restoreLeaves: LeaveDay[];
      removeLeaveIds: string[];
      /** person_id:date keys — survives id remaps from realtime. */
      removeLeaveKeys: string[];
      restoreAssignments: Assignment[];
      removeAssignmentIds: string[];
    };

export function ScheduleGrid() {
  const {
    state,
    upsertAssignment,
    deleteAssignment,
    setAssignmentBoundTasks,
    clearAssignmentBoundTasks,
    copyAssignmentBoundTasks,
    setAssignmentBoundTasksOutOfSync,
    upsertTask,
    deleteLeave,
    applyLeaveUndo,
    setLeaveBlock,
    newId,
    canManage: roleCanManage,
    isPublicShare,
    myPerson,
    profile,
    authError,
    ensureScheduleRange,
    ensureProjectData,
    ensureBoundAssignmentTasks,
    setActiveRealtimeProjectIds,
  } = useData();
  const viewAs = useViewAsOptional();
  const viewAsPersonId = viewAs?.viewAsPersonId ?? null;
  const canManage = viewAs ? viewAs.effectiveCanManage : roleCanManage;
  const { push } = useToast();
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const isNarrow = useMediaQuery("(max-width: 1023px)");
  const isCoarse = useMediaQuery("(pointer: coarse)");
  const isPhone = useIsPhone();
  const LABEL_PX = isPhone || isNarrow ? LABEL_MOBILE : LABEL_DESKTOP;
  const [phoneDayW, setPhoneDayW] = useState(DAY_W_MOBILE);
  const DAY_W = isPhone
    ? phoneDayW
    : isNarrow
      ? DAY_W_MOBILE
      : DAY_W_DESKTOP;
  const { filters, setFilter, setFilters } = useUrlFilters({
    project: "all",
    person: "all",
    zoom: "day",
    capacity: "week",
    assignment: "",
    tab: "",
    date: "",
    bindTask: "",
  });
  const zoom = (
    filters.zoom === "week" || filters.zoom === "month" || filters.zoom === "day"
      ? filters.zoom
      : "day"
  ) as ScheduleZoom;
  const capacityGrain: "week" | "day" =
    filters.capacity === "day" ? "day" : "week";
  const projectFilter = filters.project;
  const personFilter = filters.person;
  const [halfZoom, setHalfZoom] = useState(false);
  const dayW =
    !isPhone && zoom === "day" && halfZoom
      ? Math.max(20, Math.round(DAY_W / 2))
      : DAY_W;
  const [podFilter, setPodFilter] = useState<PodFilter>("all");
  const skipPodFilterWrite = useRef(true);
  const deepLinkAssignmentRef = useRef<string | null>(null);
  const [anchor, setAnchor] = useState(() =>
    scheduleAnchorForOffset(readUserViewPrefs(null).scheduleViewOffset),
  );
  const scheduleOffsetAppliedRef = useRef(false);

  useLayoutEffect(() => {
    const orgId = state.organization.id;
    if (!orgId) return;
    skipPodFilterWrite.current = true;
    setPodFilter(readSchedulePodFilter(orgId, profile?.id));
  }, [state.organization.id, profile?.id]);

  useEffect(() => {
    if (skipPodFilterWrite.current) {
      skipPodFilterWrite.current = false;
      return;
    }
    const orgId = state.organization.id;
    if (!orgId) return;
    writeSchedulePodFilter(orgId, profile?.id, podFilter);
  }, [state.organization.id, profile?.id, podFilter]);

  useEffect(() => {
    const patch: {
      project?: string;
      person?: string;
      zoom?: string;
      capacity?: string;
    } = {};
    if (
      projectFilter !== "all" &&
      !state.projects.some((p) => p.id === projectFilter)
    ) {
      patch.project = "all";
    }
    if (
      personFilter !== "all" &&
      !state.people.some((p) => p.id === personFilter)
    ) {
      patch.person = "all";
    }
    if (
      filters.zoom !== "day" &&
      filters.zoom !== "week" &&
      filters.zoom !== "month"
    ) {
      patch.zoom = "day";
    }
    if (filters.capacity !== "week" && filters.capacity !== "day") {
      patch.capacity = "week";
    }
    if (Object.keys(patch).length) setFilters(patch);
  }, [
    projectFilter,
    personFilter,
    filters.zoom,
    filters.capacity,
    state.projects,
    state.people,
    setFilters,
  ]);

  useEffect(() => {
    if (podFilter === "all") return;
    if (!state.pods.some((p) => p.id === podFilter)) {
      setPodFilter("all");
    }
  }, [podFilter, state.pods]);

  useLayoutEffect(() => {
    if (scheduleOffsetAppliedRef.current) return;
    if (!profile?.id) return;
    setAnchor(
      scheduleAnchorForOffset(
        readUserViewPrefs(profile.id).scheduleViewOffset,
      ),
    );
    scheduleOffsetAppliedRef.current = true;
  }, [profile?.id]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedLeaveBlockId, setSelectedLeaveBlockId] = useState<
    string | null
  >(null);
  const [leaveEditForm, setLeaveEditForm] = useState<{
    blockId: string;
    person_id: string;
    start_date: string;
    end_date: string;
    kind: LeaveKind;
    hours_per_day: number | null;
    notes: string;
    dayIds: string[];
  } | null>(null);
  const [editForm, setEditForm] = useState<Assignment | null>(null);
  const [gridDragging, setGridDragging] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  /** Phone: brief delay before sheet opens so the finger can lift off the tap. */
  const mobilePanelOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  /** User's preferred minimized state (restored after temporary expand for editing). */
  const [sidebarPreferMinimized, setSidebarPreferMinimized] = useState(true);
  const [sidebarMinimized, setSidebarMinimized] = useState(true);
  const [sidebarPanelTab, setSidebarPanelTab] = useState<
    "edit" | "tasks" | "hours" | "assigner"
  >("edit");
  /** Manager: Bind to Assignment checkbox (Tasks tab). */
  const [bindToAssignment, setBindToAssignment] = useState(false);
  const [bindEditingSelection, setBindEditingSelection] = useState(false);
  const [bindDraftIds, setBindDraftIds] = useState<Set<string>>(() => new Set());
  const [bindConfirm, setBindConfirm] = useState<null | {
    step: "dates" | "overwrite" | "gantt";
    taskIds: string[];
  }>(null);
  const [ganttMoveLockedNotice, setGanttMoveLockedNotice] = useState(false);
  const [ganttScheduleMoveNotice, setGanttScheduleMoveNotice] = useState(false);
  const [cutBoundConfirm, setCutBoundConfirm] = useState<null | {
    assignmentId: string;
    cutDate: string;
    occurrenceStart?: string;
    occurrenceEnd?: string;
  }>(null);
  const [bindCollisionConfirm, setBindCollisionConfirm] = useState<null | {
    taskId: string;
    personId: string;
    projectId: string;
    desiredStart: string;
    desiredEnd: string;
    /** When false, only next-available / cancel (blockers have bound tasks). */
    allowSlice: boolean;
  }>(null);
  /** Local draft assignment — not persisted until Save. */
  const [pendingCreate, setPendingCreate] = useState<Assignment | null>(null);
  /** Pending project-origin bind completed on first assignment save. */
  const pendingProjectBindTaskIdRef = useRef<string | null>(null);
  /** Undo entry for slice-and-insert during project bind; reverted on draft cancel. */
  const bindInsertPunchPendingRef = useRef<Extract<
    UndoEntry,
    { kind: "assignments" }
  > | null>(null);
  const deepLinkBindTaskRef = useRef<string | null>(null);
  const sidebarPreferMinimizedRef = useRef(true);
  const hoursInputRef = useRef<HTMLInputElement>(null);
  /** When set to an assignment id, focus/select Hours after that form mounts. */
  const focusHoursAfterCreateRef = useRef<string | null>(null);
  sidebarPreferMinimizedRef.current = sidebarPreferMinimized;
  const [draft, setDraft] = useState<{
    personId: string;
    projectId: string;
    start: string;
    end: string;
    originStart: string;
    originEnd: string;
  } | null>(null);
  const [leaveDraft, setLeaveDraft] = useState<{
    personId: string;
    start: string;
    end: string;
    originStart: string;
    originEnd: string;
  } | null>(null);
  const dragSnapshot = useRef<{
    id: string;
    mode: "move" | "resize-end" | "resize-start";
    before: Assignment;
    dirty: boolean;
    /** Day under the pointer when the move grab began (occurrence day for weekly). */
    grabDateKey: string;
    /** Occurrence span when dragging a weekly expanded block. */
    occurrenceStart: string;
    occurrenceEnd: string;
    /** Weekly: drag only this occurrence visually (series stays put until scope chosen). */
    weeklyInstance: boolean;
    previewStart: string;
    previewEnd: string;
    /** True when resize was shortened to avoid full-day leave/holiday. */
    leaveTrimmed: boolean;
  } | null>(null);
  /** Live geometry for a weekly occurrence being dragged/resized. */
  const [dragPreview, setDragPreview] = useState<{
    assignmentId: string;
    originStart: string;
    originEnd: string;
    previewStart: string;
    previewEnd: string;
  } | null>(null);
  const leaveDragSnapshot = useRef<{
    mode: "move" | "resize-end" | "resize-start";
    personId: string;
    kind: LeaveKind;
    hours_per_day: number | null;
    notes: string;
    previousDayIds: string[];
    originStart: string;
    originEnd: string;
    currentStart: string;
    currentEnd: string;
    /** Day under the pointer when a move grab began. */
    grabDateKey: string;
    dirty: boolean;
  } | null>(null);
  const [sliceMode, setSliceMode] = useState(false);
  /** Phone-only: filters/slice toolbar starts collapsed to free viewport. */
  const [phoneFiltersExpanded, setPhoneFiltersExpanded] = useState(false);
  const [extraProjectsByPerson, setExtraProjectsByPerson] = useState<
    Record<string, string[]>
  >({});
  const [addProjectForPerson, setAddProjectForPerson] = useState<string | null>(
    null,
  );
  const [addProjectClientId, setAddProjectClientId] = useState<string>("");
  const [addProjectId, setAddProjectId] = useState<string>("");
  const [selectedOccurrence, setSelectedOccurrence] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [recurrencePrompt, setRecurrencePrompt] = useState<{
    before: Assignment;
    after: Assignment;
    occurrenceStart: string;
    occurrenceEnd: string;
    leaveTrimmed?: boolean;
  } | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<{
    assignment: Assignment;
    occurrence: { start: string; end: string } | null;
  } | null>(null);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const applyingUndoRef = useRef(false);
  const performUndoRef = useRef(() => {});
  const [undoDepth, setUndoDepth] = useState(0);
  const closeSidePanelRef = useRef(() => {});
  const deleteSelectedAssignmentRef = useRef(() => {});
  const assignmentsRef = useRef(state.assignments);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollDateRef = useRef<string | null>(null);
  const weekSwipeRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreNextScheduleClickRef = useRef(false);
  const todayKey = toDateKey(new Date());

  useLayoutEffect(() => {
    if (!isPhone) return;
    function measure() {
      const cols = zoom === "day" ? 5 : 1;
      const gutter = 16;
      const w = Math.max(160, window.innerWidth - LABEL_PX - gutter);
      setPhoneDayW(Math.max(36, Math.floor(w / cols)));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isPhone, zoom, LABEL_PX]);

  useEffect(() => {
    return () => {
      if (mobilePanelOpenTimerRef.current != null) {
        clearTimeout(mobilePanelOpenTimerRef.current);
        mobilePanelOpenTimerRef.current = null;
      }
    };
  }, []);

  const { columns, totalWidth: tw, rangeLabel } = useMemo(
    () =>
      buildScheduleColumns({
        zoom,
        anchor,
        todayKey,
        dayW,
        isNarrow,
        isPhone,
      }),
    [zoom, anchor, todayKey, dayW, isNarrow, isPhone],
  );
  const startKey = columns[0]?.startKey ?? todayKey;
  const endKey = columns[columns.length - 1]?.endKey ?? todayKey;

  function applyScheduleScrollForDateKey(dateKey: string) {
    if (!scrollRef.current) return;
    const offset = readUserViewPrefs(profile?.id).scheduleViewOffset;
    // With a view offset, keep the left edge at the offset weeks (same as
    // Today / default Schedule load) so prior weeks stay on screen.
    if (offset !== "none") {
      scrollRef.current.scrollLeft = 0;
      return;
    }
    const idx = columnIndexForDateKey(columns, dateKey);
    if (idx < 0) return;
    scrollRef.current.scrollLeft = Math.max(
      0,
      columnOffsetPx(columns, idx) - dayW * 2,
    );
  }

  function scrollScheduleToDateKey(dateKey: string) {
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    const offset = readUserViewPrefs(profile?.id).scheduleViewOffset;
    const targetAnchor = scheduleAnchorForDateWithOffset(dateKey, offset);
    const needsReanchor =
      weekStart(anchor).getTime() !== weekStart(targetAnchor).getTime();
    if (needsReanchor || dateKey < startKey || dateKey > endKey) {
      pendingScrollDateRef.current = dateKey;
      setAnchor(targetAnchor);
      return;
    }
    pendingScrollDateRef.current = null;
    applyScheduleScrollForDateKey(dateKey);
  }

  useLayoutEffect(() => {
    const key = pendingScrollDateRef.current;
    if (!key) return;
    if (key < startKey || key > endKey) return;
    pendingScrollDateRef.current = null;
    applyScheduleScrollForDateKey(key);
  }, [columns, startKey, endKey, dayW]);

  useEffect(() => {
    if (!state.organization.id) return;
    const fetchStart = toDateKey(subWeeks(parseISO(startKey), 2));
    const fetchEnd = toDateKey(addWeeks(parseISO(endKey), 2));
    void ensureScheduleRange(fetchStart, fetchEnd);
  }, [startKey, endKey, ensureScheduleRange, state.organization.id]);

  /** One-shot cleanup of legacy same-person/project day overlaps in view. */
  useEffect(() => {
    if (!canManage || isPublicShare) return;
    const { upserts, deletes } = cleanupOverlappingAssignments(
      state.assignments,
      startKey,
      endKey,
      newId,
    );
    if (upserts.length === 0 && deletes.length === 0) return;
    for (const id of deletes) {
      deleteAssignment(id);
    }
    for (const row of upserts) {
      upsertAssignment(row);
    }
    assignmentsRef.current = (() => {
      let next = assignmentsRef.current.filter((a) => !deletes.includes(a.id));
      for (const row of upserts) {
        const exists = next.some((a) => a.id === row.id);
        next = exists
          ? next.map((a) => (a.id === row.id ? row : a))
          : [...next, row];
      }
      return next;
    })();
  }, [
    canManage,
    isPublicShare,
    startKey,
    endKey,
    state.assignments,
    newId,
    deleteAssignment,
    upsertAssignment,
  ]);

  const headerGroups = useMemo(() => {
    // Day zoom: one month chip per weekday week (5 days). Do not span the
    // whole calendar month — that made Jul/Aug headers unreadable.
    type HeaderGroup = {
      label: string;
      width: number;
      groupIndex: number;
      startKey: string;
      isCurrent: boolean;
      weekOfYear: number | null;
      year: number;
      cornerLabel: string | null;
    };
    const groups: HeaderGroup[] = [];
    for (const col of columns) {
      const last = groups[groups.length - 1];
      if (
        last &&
        last.label === col.groupLabel &&
        last.groupIndex === col.groupIndex
      ) {
        last.width += col.width;
        if (zoom === "week") {
          last.isCurrent = last.isCurrent || col.isCurrentWeek;
        }
      } else if (last && last.label === col.groupLabel && zoom === "month") {
        // Month zoom: year label can span consecutive months in the same year.
        last.width += col.width;
      } else {
        groups.push({
          label: col.groupLabel,
          width: col.width,
          groupIndex: col.groupIndex,
          startKey: col.startKey,
          isCurrent: zoom === "week" ? col.isCurrentWeek : false,
          weekOfYear: col.weekOfYear,
          year: col.year,
          cornerLabel: null,
        });
      }
    }

    // Day: week-of-year on every week. Week: year only when it changes
    // (first visible week of that year). Month groups already show the year.
    let prevYear: number | null = null;
    for (const g of groups) {
      if (zoom === "day" && g.weekOfYear != null) {
        g.cornerLabel = String(g.weekOfYear);
      } else if (zoom === "week") {
        if (prevYear !== g.year) {
          g.cornerLabel = String(g.year);
          prevYear = g.year;
        }
      }
    }
    return groups;
  }, [columns, zoom]);

  const capacityBands = useMemo(() => {
    type Band = {
      id: string;
      startKey: string;
      endKey: string;
      width: number;
      groupIndex: number;
    };

    // Per-day capacity: one segment per working day, aligned to the grid.
    if (capacityGrain === "day") {
      if (zoom === "day") {
        return columns.map((c) => ({
          id: c.id,
          startKey: c.startKey,
          endKey: c.endKey,
          width: c.width,
          groupIndex: c.groupIndex,
        }));
      }
      const bands: Band[] = [];
      for (const c of columns) {
        const days = workingDaysBetween(c.startKey, c.endKey);
        if (days.length === 0) {
          bands.push({
            id: c.id,
            startKey: c.startKey,
            endKey: c.endKey,
            width: c.width,
            groupIndex: c.groupIndex,
          });
          continue;
        }
        const dayW = c.width / days.length;
        for (const day of days) {
          bands.push({
            id: day,
            startKey: day,
            endKey: day,
            width: dayW,
            groupIndex: c.groupIndex,
          });
        }
      }
      return bands;
    }

    // Per-week capacity (default): day-zoom columns roll up to week bands.
    if (zoom === "day") {
      const bands: Band[] = [];
      let i = 0;
      while (i < columns.length) {
        const g = columns[i].groupIndex;
        const start = columns[i].startKey;
        let end = columns[i].endKey;
        let width = 0;
        while (i < columns.length && columns[i].groupIndex === g) {
          width += columns[i].width;
          end = columns[i].endKey;
          i++;
        }
        bands.push({
          id: start,
          startKey: start,
          endKey: end,
          width,
          groupIndex: g,
        });
      }
      return bands;
    }
    return columns.map((c) => ({
      id: c.id,
      startKey: c.startKey,
      endKey: c.endKey,
      width: c.width,
      groupIndex: c.groupIndex,
    }));
  }, [columns, zoom, capacityGrain]);

  function shiftAnchor(delta: number) {
    if (zoom === "month") setAnchor((a) => shiftMonth(a, delta));
    else if (zoom === "week") {
      setAnchor((a) => shiftWeek(a, isPhone ? delta : delta * 4));
    } else setAnchor((a) => shiftWeek(a, delta));
  }

  function goToday() {
    setAnchor(
      scheduleAnchorForOffset(
        readUserViewPrefs(profile?.id).scheduleViewOffset,
      ),
    );
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }

  /** Collapsed person rows (util strip only). Empty = all expanded. */
  const [collapsedPeople, setCollapsedPeople] = useState<Set<string>>(
    () => new Set(),
  );
  /** Defer heavy body mount so the chevron can paint immediately. */
  const deferredCollapsedPeople = useDeferredValue(collapsedPeople);

  const togglePersonCollapsed = useCallback((personId: string) => {
    setCollapsedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (viewAsPersonId) setFilter("person", viewAsPersonId);
  }, [viewAsPersonId, setFilter]);

  const visiblePeople = useMemo(() => {
    if (viewAsPersonId) {
      const person = state.people.find((p) => p.id === viewAsPersonId);
      return person ? [person] : [];
    }
    const showAll = canManage || isPublicShare;
    const directory = state.people.filter((p) => !p.hide_from_schedule);
    const base = showAll ? directory : myPerson ? [myPerson] : [];
    const podScoped = showAll
      ? filterPeopleByPod(base, state.pods, state.pod_members, podFilter)
      : base;
    const filtered =
      showAll && personFilter !== "all"
        ? podScoped.filter((p) => p.id === personFilter)
        : podScoped;
    return sortPeopleByName(filtered);
  }, [
    viewAsPersonId,
    canManage,
    isPublicShare,
    state.people,
    state.pods,
    state.pod_members,
    myPerson,
    personFilter,
    podFilter,
  ]);

  const showPodFilter =
    (canManage || isPublicShare) &&
    !viewAsPersonId &&
    state.pods.length >= 1;

  const podSelectOptions = useMemo(
    () => [
      { value: "all", label: "All People" },
      ...sortPods(state.pods).map((pod) => ({
        value: pod.id,
        label: pod.name,
      })),
    ],
    [state.pods],
  );

  const scheduleProjectManagers = useMemo(
    () => scheduleProjectManagerPeople(visiblePeople, state.profiles),
    [visiblePeople, state.profiles],
  );

  const scheduleMembers = useMemo(() => {
    const pmIds = new Set(scheduleProjectManagers.map((p) => p.id));
    return visiblePeople.filter((p) => !pmIds.has(p.id));
  }, [visiblePeople, scheduleProjectManagers]);

  /** Members first, then Project Managers — same list `visiblePeople`
   * reorders into for rendering (a separator is inserted at the split). */
  const scheduleRenderOrder = useMemo(
    () => [...scheduleMembers, ...scheduleProjectManagers],
    [scheduleMembers, scheduleProjectManagers],
  );

  const peopleForFilter = useMemo(
    () =>
      sortPeopleByName(state.people.filter((p) => !p.hide_from_schedule)),
    [state.people],
  );

  const projectsById = useMemo(
    () => new Map(state.projects.map((p) => [p.id, p])),
    [state.projects],
  );
  const clientsById = useMemo(
    () => new Map(state.clients.map((c) => [c.id, c])),
    [state.clients],
  );

  const selectedProject =
    projectFilter === "all"
      ? null
      : (projectsById.get(projectFilter) ?? null);

  const assignmentsView = useMemo(() => {
    if (!pendingCreate) return state.assignments;
    return [
      ...state.assignments.filter((a) => a.id !== pendingCreate.id),
      pendingCreate,
    ];
  }, [state.assignments, pendingCreate]);
  assignmentsRef.current = assignmentsView;

  const selectedBurn = useMemo(
    () =>
      selectedProject
        ? budgetBurn(
            selectedProject,
            state.assignments,
            state.people,
            false,
            new Date(),
            state.project_members.filter(
              (m) => m.project_id === selectedProject.id,
            ),
            state.project_contractor_expenses.filter(
              (e) => e.project_id === selectedProject.id,
            ),
            state.organization_settings,
          )
        : null,
    [
      selectedProject,
      state.assignments,
      state.people,
      state.project_members,
      state.project_contractor_expenses,
      state.organization_settings,
    ],
  );

  const selected =
    assignmentsView.find((a) => a.id === selectedId) ?? null;

  const isPendingCreate = Boolean(
    pendingCreate && editForm && pendingCreate.id === editForm.id,
  );

  function assignmentById(id: string): Assignment | undefined {
    if (pendingCreate?.id === id) return pendingCreate;
    return state.assignments.find((a) => a.id === id);
  }

  function patchAssignmentDates(
    id: string,
    patch: Partial<Pick<Assignment, "start_date" | "end_date">>,
  ) {
    if (pendingCreate?.id === id) {
      setPendingCreate((prev) => (prev ? { ...prev, ...patch } : prev));
      setEditForm((prev) =>
        prev && prev.id === id ? { ...prev, ...patch } : prev,
      );
      return;
    }
    const current = state.assignments.find((a) => a.id === id);
    if (!current) return;
    upsertAssignment({ ...current, ...patch });
    setEditForm((prev) =>
      prev && prev.id === id ? { ...prev, ...patch } : prev,
    );
  }

  function assignmentsForPlacement(excludeId?: string | null): Assignment[] {
    if (!excludeId) return assignmentsView;
    return assignmentsView.filter((a) => a.id !== excludeId);
  }

  function revertBindInsertPunch() {
    const entry = bindInsertPunchPendingRef.current;
    if (!entry) return;
    bindInsertPunchPendingRef.current = null;
    applyingUndoRef.current = true;
    for (const id of entry.removeAssignmentIds) {
      deleteAssignment(id);
    }
    for (const assignment of entry.restoreAssignments) {
      upsertAssignment(assignment);
    }
    assignmentsRef.current = (() => {
      let next = assignmentsRef.current.filter(
        (a) => !entry.removeAssignmentIds.includes(a.id),
      );
      for (const assignment of entry.restoreAssignments) {
        const exists = next.some((a) => a.id === assignment.id);
        next = exists
          ? next.map((a) => (a.id === assignment.id ? assignment : a))
          : [...next, assignment];
      }
      return next;
    })();
    applyingUndoRef.current = false;
    const stack = undoStackRef.current;
    const top = stack[stack.length - 1];
    if (
      top?.kind === "assignments" &&
      top.removeAssignmentIds.length === entry.removeAssignmentIds.length &&
      top.removeAssignmentIds.every((id) =>
        entry.removeAssignmentIds.includes(id),
      )
    ) {
      stack.pop();
      setUndoDepth(stack.length);
    }
  }

  const sidebarProjectId =
    editForm?.project_id ?? selected?.project_id ?? null;
  const sidebarProject = sidebarProjectId
    ? (projectsById.get(sidebarProjectId) ?? null)
    : null;
  const sidebarColor = sidebarProject
    ? projectDisplayColor(sidebarProject, clientsById)
    : "var(--border)";
  const sidebarAssignerId = sidebarProject?.manager_person_id ?? null;
  const sidebarAssigner = sidebarAssignerId
    ? (state.people.find((p) => p.id === sidebarAssignerId) ?? null)
    : null;
  const showProductionHoursTab =
    canManage &&
    sidebarProject != null &&
    normalizeBudgetMode(
      sidebarProject.budget_mode,
      sidebarProject.budget_hours,
      sidebarProject.budget_amount,
    ) === "amount";

  useEffect(() => {
    if (sidebarPanelTab === "hours" && !showProductionHoursTab) {
      setSidebarPanelTab("edit");
    }
  }, [sidebarPanelTab, showProductionHoursTab]);

  const activeAssignmentId = editForm?.id ?? selected?.id ?? null;
  const boundTaskIdsForActive = useMemo(() => {
    if (!activeAssignmentId) return [] as string[];
    return state.assignment_bound_tasks
      .filter((r) => r.assignment_id === activeAssignmentId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => r.task_id);
  }, [state.assignment_bound_tasks, activeAssignmentId]);

  useEffect(() => {
    if (pendingCreate && activeAssignmentId === pendingCreate.id) {
      // Keep bind drafts seeded by finishProjectBindFlow / createAssignment.
      return;
    }
    const ids = !activeAssignmentId
      ? []
      : state.assignment_bound_tasks
          .filter((r) => r.assignment_id === activeAssignmentId)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((r) => r.task_id);
    setBindToAssignment(ids.length > 0);
    setBindEditingSelection(false);
    setBindDraftIds(new Set(ids));
    setBindConfirm(null);
    // Reset bind chrome when the selected assignment changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assignment switch only
  }, [activeAssignmentId, pendingCreate?.id]);

  function syncBoundTaskDatesFromAssignment(assignment: Assignment) {
    const boundIds = state.assignment_bound_tasks
      .filter((r) => r.assignment_id === assignment.id)
      .map((r) => r.task_id);
    if (boundIds.length === 0) return;
    const assignments = [
      ...state.assignments.filter((a) => a.id !== assignment.id),
      assignment,
    ];
    const patches = syncNonGanttTaskDatesFromBindings(
      state.assignment_bound_tasks,
      state.tasks,
      state.task_lists,
      assignments,
      boundIds,
    );
    for (const patch of patches) {
      const task = state.tasks.find((t) => t.id === patch.taskId);
      if (!task) continue;
      upsertTask({
        ...task,
        start_date: patch.start_date,
        due_date: patch.due_date,
      });
    }
  }

  function syncBoundTaskDateForTask(taskId: string) {
    const assignment = editForm ?? selected;
    if (!assignment || !canManage) return;
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || isGanttTask(task, state.task_lists)) return;
    // Apply this assignment's calendar dates to the project task (not the
    // multi-assignment span), then clear OOS when all bound dates match.
    const start = assignment.start_date;
    const end = assignment.end_date;
    const datesChanged =
      task.start_date !== start || task.due_date !== end;
    if (datesChanged) {
      upsertTask({
        ...task,
        start_date: start,
        due_date: end,
      });
    }
    const assignments = [
      ...state.assignments.filter((a) => a.id !== assignment.id),
      assignment,
    ];
    const nextTasks = state.tasks.map((t) =>
      t.id === taskId ? { ...t, start_date: start, due_date: end } : t,
    );
    const boundIds = state.assignment_bound_tasks
      .filter((r) => r.assignment_id === assignment.id)
      .map((r) => r.task_id);
    const oos = assignmentIsOutOfSync(
      state.assignment_bound_tasks,
      nextTasks,
      state.task_lists,
      assignments,
      assignment.id,
    );
    void setAssignmentBoundTasksOutOfSync(assignment.id, oos);
    refreshBoundAssignmentNotes(assignment, boundIds, oos);
    push(
      oos
        ? "Task date synced (other bound tasks still out of sync)"
        : "Task date synced to assignment",
    );
  }

  function assignmentNoteIconClass(
    notes: string | null | undefined,
    assignmentId: string,
  ): string {
    if (isTasksRemovedNote(notes)) {
      // Stroke color (fill set separately on StickyNote).
      return "text-white";
    }
    const hasBoundRows = state.assignment_bound_tasks.some(
      (r) => r.assignment_id === assignmentId,
    );
    if (hasBoundRows || isBoundTasksNotes(notes)) {
      return assignmentIsOutOfSync(
        state.assignment_bound_tasks,
        state.tasks,
        state.task_lists,
        state.assignments,
        assignmentId,
      )
        ? "text-[var(--status-near)]"
        : "text-[var(--status-healthy)]";
    }
    return "text-white/95";
  }

  function assignmentNoteStickyClass(
    notes: string | null | undefined,
    assignmentId?: string,
  ): string | undefined {
    if (isTasksRemovedNote(notes)) {
      return "fill-[var(--text-muted)] stroke-white";
    }
    const hasBoundRows = assignmentId
      ? state.assignment_bound_tasks.some(
          (r) => r.assignment_id === assignmentId,
        )
      : false;
    if (hasBoundRows || isBoundTasksNotes(notes)) {
      return "fill-current stroke-white";
    }
    return undefined;
  }

  function assignmentNotesTooltipContent(
    notes: string,
    assignmentId: string,
  ): ReactNode {
    if (isTasksRemovedNote(notes)) return <span>Tasks Removed</span>;
    if (isBoundTasksNotes(notes)) {
      return (
        <BoundAssignmentNotesTooltip
          assignmentId={assignmentId}
          notesHtml={notes}
          projectHref={projectHref}
        />
      );
    }
    return <RichNotesHtml html={notes} />;
  }

  function refreshBoundAssignmentNotes(
    assignment: Assignment,
    taskIds: string[],
    outOfSync = false,
  ) {
    const ordered = sortBoundTaskIdsByListOrder(
      taskIds,
      state.tasks,
      state.task_lists,
    );
    const titles = ordered
      .map((id) => state.tasks.find((t) => t.id === id)?.title ?? "")
      .filter(Boolean);
    const notes = boundTasksNotesHtml(
      titles,
      outOfSync ? "out_of_sync" : "in_sync",
    );
    const nextAssignment: Assignment = { ...assignment, notes };
    upsertAssignment(nextAssignment);
    setEditForm((prev) =>
      prev && prev.id === nextAssignment.id
        ? { ...prev, notes: nextAssignment.notes }
        : prev,
    );
    return nextAssignment;
  }

  async function applyAssignmentBind(
    taskIds: string[],
    boundSource: "project" | "schedule" = "schedule",
  ) {
    const assignment = editForm ?? selected;
    if (!assignment || !canManage) return;
    const unique = sortBoundTaskIdsByListOrder(
      [...new Set(taskIds)],
      state.tasks,
      state.task_lists,
    );
    const assignments = [
      ...state.assignments.filter((a) => a.id !== assignment.id),
      assignment,
    ];
    const bindsPreview = [
      ...state.assignment_bound_tasks.filter(
        (r) => r.assignment_id !== assignment.id,
      ),
      ...unique.map((task_id, sort_order) => ({
        assignment_id: assignment.id,
        task_id,
        organization_id: assignment.organization_id,
        sort_order,
        bound_source: boundSource,
        out_of_sync: false,
      })),
    ];
    const patches = syncNonGanttTaskDatesFromBindings(
      bindsPreview,
      state.tasks,
      state.task_lists,
      assignments,
      unique,
    );
    const tasksAfterSync = state.tasks.map((t) => {
      const patch = patches.find((p) => p.taskId === t.id);
      return patch
        ? { ...t, start_date: patch.start_date, due_date: patch.due_date }
        : t;
    });
    const bindRows = unique.map((task_id) => ({
      task_id,
      bound_source: boundSource,
      out_of_sync: !taskBoundDatesMatchSpan(
        task_id,
        bindsPreview,
        tasksAfterSync,
        assignments,
      ),
    }));
    await setAssignmentBoundTasks(assignment.id, bindRows);
    // One upsert per task: assignee (if missing) + non-Gantt date patches.
    // Never follow with a second upsert from a stale task snapshot.
    for (const taskId of unique) {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) continue;
      const patch = patches.find((p) => p.taskId === taskId);
      const needsAssignee = !task.assignee_person_id;
      if (!patch && !needsAssignee) continue;
      upsertTask({
        ...task,
        ...(needsAssignee
          ? { assignee_person_id: assignment.person_id }
          : {}),
        ...(patch
          ? { start_date: patch.start_date, due_date: patch.due_date }
          : {}),
      });
    }
    const finalBinds: AssignmentBoundTask[] = [
      ...state.assignment_bound_tasks.filter(
        (r) => r.assignment_id !== assignment.id,
      ),
      ...unique.map((task_id, sort_order) => ({
        assignment_id: assignment.id,
        task_id,
        organization_id: assignment.organization_id,
        sort_order,
        bound_source: boundSource,
        out_of_sync:
          bindRows.find((r) => r.task_id === task_id)?.out_of_sync ?? false,
      })),
    ];
    const outOfSync = assignmentIsOutOfSync(
      finalBinds,
      tasksAfterSync,
      state.task_lists,
      assignments,
      assignment.id,
    );
    refreshBoundAssignmentNotes(assignment, unique, outOfSync);
    setBindDraftIds(new Set(unique));
    setBindEditingSelection(false);
    setBindToAssignment(true);
    setBindConfirm(null);
    pendingProjectBindTaskIdRef.current = null;
    push(
      unique.length === 0
        ? "Assignment unbound from tasks"
        : `Bound ${unique.length} priority task${unique.length === 1 ? "" : "s"}`,
    );
  }

  async function clearAssignmentBindUi() {
    const assignment = editForm ?? selected;
    if (!assignment || !canManage) return;
    await clearAssignmentBoundTasks(assignment.id);
    if (isBoundTasksNotes(assignment.notes)) {
      const cleared = { ...assignment, notes: "" };
      upsertAssignment(cleared);
      setEditForm((prev) =>
        prev && prev.id === cleared.id ? { ...prev, notes: "" } : prev,
      );
    }
    setBindDraftIds(new Set());
    setBindEditingSelection(false);
    setBindToAssignment(false);
    setBindConfirm(null);
  }

  function beginBindSave() {
    const taskIds = [...bindDraftIds];
    const assignment = editForm ?? selected;
    if (!assignment) return;
    // Pending draft: keep selection local until assignment Save.
    if (pendingCreate?.id === assignment.id) {
      const ordered = sortBoundTaskIdsByListOrder(
        taskIds,
        state.tasks,
        state.task_lists,
      );
      const titles = ordered
        .map((id) => state.tasks.find((t) => t.id === id)?.title ?? "")
        .filter(Boolean);
      const notes =
        titles.length > 0 ? boundTasksNotesHtml(titles, "in_sync") : "";
      patchEditForm({ notes });
      setBindEditingSelection(false);
      setBindToAssignment(taskIds.length > 0);
      setBindConfirm(null);
      return;
    }
    const selectedTasks = taskIds
      .map((id) => state.tasks.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    const nonGantt = selectedTasks.filter(
      (t) => !isGanttTask(t, state.task_lists),
    );
    const hasGantt = selectedTasks.some((t) =>
      isGanttTask(t, state.task_lists),
    );

    // Gantt-only (or mixed with Gantt from Tasks tab): one Got it notice.
    // Schedule-source binds do not lock; show Gantt notice only for awareness
    // when any Gantt tasks are in the selection.
    if (hasGantt && nonGantt.length === 0) {
      setBindConfirm({ step: "gantt", taskIds });
      return;
    }
    if (hasGantt && nonGantt.length > 0) {
      // Mixed: show Gantt notice first; dates for non-Gantt handled after.
      setBindConfirm({ step: "gantt", taskIds });
      return;
    }

    // Non-Gantt only: skip no-op date warnings.
    const bindsPreview = [
      ...state.assignment_bound_tasks.filter(
        (r) => r.assignment_id !== assignment.id,
      ),
      ...taskIds.map((task_id, sort_order) => ({
        assignment_id: assignment.id,
        task_id,
        organization_id: assignment.organization_id,
        sort_order,
        bound_source: "schedule" as const,
        out_of_sync: false,
      })),
    ];
    const assignments = [
      ...state.assignments.filter((a) => a.id !== assignment.id),
      assignment,
    ];
    const wouldChange = nonGantt.some((t) => {
      const span = syncNonGanttTaskDatesFromBindings(
        bindsPreview,
        [t],
        state.task_lists,
        assignments,
        [t.id],
      );
      return span.length > 0;
    });
    if (!wouldChange) {
      void applyAssignmentBind(taskIds, "schedule");
      return;
    }
    const hasDifferingExisting = nonGantt.some((t) => {
      if (!t.start_date && !t.due_date) return false;
      const patches = syncNonGanttTaskDatesFromBindings(
        bindsPreview,
        [t],
        state.task_lists,
        assignments,
        [t.id],
      );
      return patches.length > 0;
    });
    // Always confirm date update when dates would change.
    setBindConfirm({
      step: hasDifferingExisting ? "overwrite" : "dates",
      taskIds,
    });
  }

  function advanceBindConfirm() {
    if (!bindConfirm) return;
    const { step, taskIds } = bindConfirm;
    const selectedTasks = taskIds
      .map((id) => state.tasks.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    const nonGantt = selectedTasks.filter(
      (t) => !isGanttTask(t, state.task_lists),
    );
    const hasGantt = selectedTasks.some((t) =>
      isGanttTask(t, state.task_lists),
    );
    const assignment = editForm ?? selected;

    if (step === "gantt") {
      // After Gantt notice, if there are non-Gantt tasks that need date confirm, continue.
      if (nonGantt.length > 0 && assignment) {
        const bindsPreview = [
          ...state.assignment_bound_tasks.filter(
            (r) => r.assignment_id !== assignment.id,
          ),
          ...taskIds.map((task_id, sort_order) => ({
            assignment_id: assignment.id,
            task_id,
            organization_id: assignment.organization_id,
            sort_order,
            bound_source: "schedule" as const,
            out_of_sync: false,
          })),
        ];
        const assignments = [
          ...state.assignments.filter((a) => a.id !== assignment.id),
          assignment,
        ];
        const wouldChange = nonGantt.some((t) => {
          const patches = syncNonGanttTaskDatesFromBindings(
            bindsPreview,
            [t],
            state.task_lists,
            assignments,
            [t.id],
          );
          return patches.length > 0;
        });
        if (wouldChange) {
          const hasDifferingExisting = nonGantt.some((t) => {
            if (!t.start_date && !t.due_date) return false;
            return (
              syncNonGanttTaskDatesFromBindings(
                bindsPreview,
                [t],
                state.task_lists,
                assignments,
                [t.id],
              ).length > 0
            );
          });
          setBindConfirm({
            step: hasDifferingExisting ? "overwrite" : "dates",
            taskIds,
          });
          return;
        }
      }
      void applyAssignmentBind(taskIds, "schedule");
      return;
    }
    if (step === "dates") {
      // Overwrite step only when dates differ from existing non-matching dates.
      // beginBindSave already chose overwrite vs dates; continue to apply.
      void applyAssignmentBind(taskIds, "schedule");
      return;
    }
    void applyAssignmentBind(taskIds, "schedule");
  }

  function isAssignmentScheduleLocked(assignmentId: string): boolean {
    return assignmentScheduleMoveLocked(
      state.assignment_bound_tasks,
      state.tasks,
      state.task_lists,
      state.assignments,
      assignmentId,
    );
  }

  function assignmentHasScheduleBoundGantt(assignmentId: string): boolean {
    return state.assignment_bound_tasks.some((r) => {
      if (r.assignment_id !== assignmentId) return false;
      if (r.bound_source !== "schedule") return false;
      const task = state.tasks.find((t) => t.id === r.task_id);
      return task ? isGanttTask(task, state.task_lists) : false;
    });
  }

  const assignmentMentionPeople = useMemo(() => {
    const projectId = editForm?.project_id ?? selected?.project_id ?? null;
    if (!projectId) {
      return sortPeopleByName(state.people).map((p) => ({
        id: p.id,
        name: p.name,
      }));
    }
    const ids = projectTeamPersonIds(
      projectId,
      state.project_members,
      state.assignments,
      state.tasks,
    );
    const project = projectsById.get(projectId);
    if (project?.manager_person_id) ids.add(project.manager_person_id);
    return sortPeopleByName(state.people.filter((p) => ids.has(p.id))).map(
      (p) => ({ id: p.id, name: p.name }),
    );
  }, [
    editForm?.project_id,
    selected?.project_id,
    state.project_members,
    state.assignments,
    state.tasks,
    state.people,
    projectsById,
  ]);

  const boundTaskHydrationKey = useMemo(
    () =>
      [...new Set(state.assignment_bound_tasks.map((r) => r.task_id))]
        .sort()
        .join(","),
    [state.assignment_bound_tasks],
  );

  useEffect(() => {
    void ensureBoundAssignmentTasks();
  }, [ensureBoundAssignmentTasks, boundTaskHydrationKey]);

  useEffect(() => {
    const loadIds = new Set<string>();
    if (projectFilter !== "all") loadIds.add(projectFilter);
    if (sidebarProjectId) loadIds.add(sidebarProjectId);
    for (const id of loadIds) {
      void ensureProjectData(id);
    }

    const realtimeId =
      sidebarPanelTab === "tasks"
        ? (sidebarProjectId ??
          (projectFilter !== "all" ? projectFilter : null))
        : null;
    setActiveRealtimeProjectIds(realtimeId ? [realtimeId] : []);
    return () => setActiveRealtimeProjectIds([]);
  }, [
    projectFilter,
    sidebarProjectId,
    sidebarPanelTab,
    ensureProjectData,
    setActiveRealtimeProjectIds,
  ]);

  // Local form draft — only persisted on Save; grid move/resize updates dates
  useEffect(() => {
    if (!selectedId) {
      setEditForm(null);
      return;
    }
    const a =
      (pendingCreate?.id === selectedId ? pendingCreate : null) ??
      state.assignments.find((x) => x.id === selectedId);
    if (!a) {
      setEditForm(null);
      return;
    }
    setEditForm((prev) => {
      if (!prev || prev.id !== a.id) return { ...a };
      if (
        prev.start_date !== a.start_date ||
        prev.end_date !== a.end_date
      ) {
        return {
          ...prev,
          start_date: a.start_date,
          end_date: a.end_date,
        };
      }
      return prev;
    });
  }, [selectedId, state.assignments, pendingCreate]);

  useEffect(() => {
    if (!editForm || focusHoursAfterCreateRef.current !== editForm.id) return;
    focusHoursAfterCreateRef.current = null;
    const scrollEl = scrollRef.current;
    const scrollLeft = scrollEl?.scrollLeft ?? 0;
    const scrollTop = scrollEl?.scrollTop ?? 0;
    const id = window.setTimeout(() => {
      const el = hoursInputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.select();
      if (scrollEl) {
        scrollEl.scrollLeft = scrollLeft;
        scrollEl.scrollTop = scrollTop;
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [editForm?.id]);

  const formDirty = Boolean(
    editForm &&
      selected &&
      (editForm.project_id !== selected.project_id ||
        editForm.status !== selected.status ||
        (editForm.recurrence ?? "none") !== (selected.recurrence ?? "none") ||
        (editForm.recurrence_end_date ?? null) !==
          (selected.recurrence_end_date ?? null) ||
        editForm.start_date !== selected.start_date ||
        editForm.end_date !== selected.end_date ||
        editForm.hours_per_day !== selected.hours_per_day ||
        editForm.notes !== selected.notes),
  );

  const sidebarExpandLabel = leaveEditForm
    ? "Time Off"
    : selected || isPendingCreate
      ? formDirty || isPendingCreate
        ? "Assignment · Unsaved"
        : "Assignment"
      : canManage
        ? "Budget"
        : isPublicShare
          ? "Plan"
          : "My Plan";

  const occurrences = useMemo(() => {
    const filtered = assignmentsView.filter(
      (a) => projectFilter === "all" || a.project_id === projectFilter,
    );
    const expanded = expandAssignmentsInRange(
      filtered,
      startKey,
      endKey,
      (projectId) => projectsById.get(projectId)?.end_date,
    );
    if (!dragPreview) return expanded;
    return expanded.map((occ) => {
      if (
        occ.assignmentId !== dragPreview.assignmentId ||
        occ.start_date !== dragPreview.originStart ||
        occ.end_date !== dragPreview.originEnd
      ) {
        return occ;
      }
      return {
        ...occ,
        start_date: dragPreview.previewStart,
        end_date: dragPreview.previewEnd,
      };
    });
  }, [assignmentsView, projectFilter, startKey, endKey, dragPreview, projectsById]);

  const bookedHoursByPersonDay = useMemo(
    () => buildBookedHoursByPersonDay(occurrences, state.leave_days),
    [occurrences, state.leave_days],
  );

  const utilByPersonId = useMemo(() => {
    const map = new Map<string, PersonUtilBand[]>();
    const capacityThresholds = capacityThresholdsFromSettings(
      state.organization_settings,
    );
    for (const person of visiblePeople) {
      const dayHours = bookedHoursByPersonDay.get(person.id);
      map.set(
        person.id,
        capacityBands.map((band) => {
          const booked = sumBookedHoursFromDayMap(
            dayHours,
            band.startKey,
            band.endKey,
            person.id,
            state.leave_days,
          );
          const available = availableHoursInRange(
            person,
            band.startKey,
            band.endKey,
            state.leave_days,
          );
          const pct = utilizationPct(booked, available);
          return {
            id: band.id,
            width: band.width,
            booked,
            available,
            pct,
            level: capacityLevel(
              booked,
              available,
              available <= 0,
              capacityThresholds,
            ),
          };
        }),
      );
    }
    return map;
  }, [
    visiblePeople,
    bookedHoursByPersonDay,
    capacityBands,
    state.leave_days,
    state.organization_settings,
  ]);

  const projectsByPersonId = useMemo(() => {
    // Keep assignment rows visible for every project status (on hold, archived,
    // completed, etc.) — only the "add project" picker is limited to active.
    const sorted = sortProjectsByClientThenName(state.projects, state.clients);
    const map = new Map<string, Project[]>();

    if (projectFilter !== "all") {
      const filtered = projectsById.get(projectFilter);
      const list = filtered ? [filtered] : EMPTY_PROJECTS;
      for (const person of visiblePeople) {
        map.set(person.id, list);
      }
      return map;
    }

    const assigned = new Map<string, Set<string>>();
    for (const a of state.assignments) {
      let set = assigned.get(a.person_id);
      if (!set) {
        set = new Set();
        assigned.set(a.person_id, set);
      }
      set.add(a.project_id);
    }

    for (const person of visiblePeople) {
      const fromAssignments = assigned.get(person.id) ?? new Set<string>();
      const extras = new Set(extraProjectsByPerson[person.id] ?? []);
      map.set(
        person.id,
        sorted.filter((p) => fromAssignments.has(p.id) || extras.has(p.id)),
      );
    }
    return map;
  }, [
    state.projects,
    state.clients,
    state.assignments,
    projectFilter,
    projectsById,
    visiblePeople,
    extraProjectsByPerson,
  ]);

  const occurrencesByPersonId = useMemo(() => {
    const map = new Map<string, AssignmentOccurrence[]>();
    for (const occ of occurrences) {
      const list = map.get(occ.person_id);
      if (list) list.push(occ);
      else map.set(occ.person_id, [occ]);
    }
    return map;
  }, [occurrences]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable ||
          !!target.closest("[contenteditable='true']"));

      if (e.key === "Escape") {
        e.preventDefault();
        closeSidePanelRef.current();
        if (target && typeof target.blur === "function") {
          target.blur();
        }
        return;
      }

      if (inField) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedAssignmentRef.current();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        performUndoRef.current();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setAnchor((a) => shiftWeek(a, -1));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setAnchor((a) => shiftWeek(a, 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (authError?.includes("recurrence")) {
      push(authError, "warning");
    }
  }, [authError, push]);

  function pushUndo(entry: UndoEntry) {
    if (applyingUndoRef.current) return;
    undoStackRef.current.push(entry);
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }
    setUndoDepth(undoStackRef.current.length);
  }

  function performUndo() {
    if (!canManage) return;
    const entry = undoStackRef.current.pop();
    setUndoDepth(undoStackRef.current.length);
    if (!entry) {
      push("Nothing to undo");
      return;
    }
    applyingUndoRef.current = true;
    if (entry.kind === "remove") {
      deleteAssignment(entry.id);
      setSelectedId((id) => (id === entry.id ? null : id));
      setEditForm((f) => (f?.id === entry.id ? null : f));
    } else if (entry.kind === "restore") {
      upsertAssignment(entry.assignment);
      setSelectedId(entry.assignment.id);
    } else if (entry.kind === "assignments") {
      for (const id of entry.removeAssignmentIds) {
        deleteAssignment(id);
      }
      for (const assignment of entry.restoreAssignments) {
        upsertAssignment(assignment);
      }
      assignmentsRef.current = (() => {
        let next = assignmentsRef.current.filter(
          (a) => !entry.removeAssignmentIds.includes(a.id),
        );
        for (const assignment of entry.restoreAssignments) {
          const exists = next.some((a) => a.id === assignment.id);
          next = exists
            ? next.map((a) => (a.id === assignment.id ? assignment : a))
            : [...next, assignment];
        }
        return next;
      })();
      const focus = entry.restoreAssignments[0];
      if (focus) {
        selectAssignment(focus.id, {
          start: focus.start_date,
          end: focus.end_date,
        });
      } else {
        selectAssignment(null);
      }
    } else {
      applyLeaveUndo({
        restoreLeaves: entry.restoreLeaves,
        removeLeaveIds: entry.removeLeaveIds,
        removeLeaveKeys: entry.removeLeaveKeys,
        restoreAssignments: entry.restoreAssignments,
        removeAssignmentIds: entry.removeAssignmentIds,
      });
      assignmentsRef.current = (() => {
        let next = assignmentsRef.current.filter(
          (a) => !entry.removeAssignmentIds.includes(a.id),
        );
        for (const assignment of entry.restoreAssignments) {
          const exists = next.some((a) => a.id === assignment.id);
          next = exists
            ? next.map((a) => (a.id === assignment.id ? assignment : a))
            : [...next, assignment];
        }
        return next;
      })();
      setSelectedLeaveBlockId(null);
      setLeaveEditForm(null);
      setSelectedId(null);
      setEditForm(null);
    }
    applyingUndoRef.current = false;
    push("Undone");
  }
  performUndoRef.current = performUndo;

  function trackedUpsert(next: Assignment, toast?: string) {
    const prev = assignmentsRef.current.find((a) => a.id === next.id);
    if (prev) {
      pushUndo({ kind: "restore", assignment: { ...prev } });
    } else {
      pushUndo({ kind: "remove", id: next.id });
    }
    upsertAssignment(next);
    if (toast) push(toast);
    assignmentsRef.current = (() => {
      const exists = assignmentsRef.current.some((a) => a.id === next.id);
      return exists
        ? assignmentsRef.current.map((a) => (a.id === next.id ? next : a))
        : [...assignmentsRef.current, next];
    })();
    if (next.status === "confirmed") {
      warnBudget(next.project_id, assignmentsRef.current);
    }
  }

  /** Multi-row assignment change as a single undo step. */
  function trackedAssignmentBatch(args: {
    upserts: Assignment[];
    deletes?: string[];
    /** Pre-change rows to put back on undo. */
    undoRestore: Assignment[];
    /** Rows created by this batch — removed on undo. */
    undoRemoveIds?: string[];
    toast?: string;
  }) {
    const deletes = args.deletes ?? [];
    const undoRemoveIds = args.undoRemoveIds ?? [];
    pushUndo({
      kind: "assignments",
      restoreAssignments: args.undoRestore.map((a) => ({ ...a })),
      removeAssignmentIds: [...undoRemoveIds],
    });
    for (const id of deletes) {
      deleteAssignment(id);
    }
    for (const next of args.upserts) {
      upsertAssignment(next);
    }
    assignmentsRef.current = (() => {
      let next = assignmentsRef.current.filter((a) => !deletes.includes(a.id));
      for (const row of args.upserts) {
        const exists = next.some((a) => a.id === row.id);
        next = exists
          ? next.map((a) => (a.id === row.id ? row : a))
          : [...next, row];
      }
      return next;
    })();
    if (args.toast) push(args.toast);
    for (const row of args.upserts) {
      if (row.status === "confirmed") {
        warnBudget(row.project_id, assignmentsRef.current);
      }
    }
  }

  function trackedDelete(id: string) {
    const prev = assignmentsRef.current.find((a) => a.id === id);
    if (prev) pushUndo({ kind: "restore", assignment: { ...prev } });
    deleteAssignment(id);
    assignmentsRef.current = assignmentsRef.current.filter((a) => a.id !== id);
  }

  function punchAssignmentLeaveHoles(
    rows: Assignment[],
    personId: string,
    rangeStart: string,
    rangeEnd: string,
  ): boolean {
    const leaveDates = fullDayLeaveDatesInRange(
      state.leave_days,
      personId,
      rangeStart,
      rangeEnd,
      (leave) =>
        isFullDayLeave({
          kind: leave.kind as LeaveKind,
          hours_per_day: leave.hours_per_day,
        }),
    );
    if (leaveDates.length === 0) return false;
    const { upserts, deletes } = applyFullDayLeaveOverrideForDates(
      rows,
      personId,
      leaveDates,
      newId,
    );
    if (deletes.length === 0 && upserts.length === 0) return false;
    for (const id of deletes) {
      deleteAssignment(id);
      assignmentsRef.current = assignmentsRef.current.filter((a) => a.id !== id);
    }
    for (const row of upserts) {
      upsertAssignment(row);
      const idx = assignmentsRef.current.findIndex((a) => a.id === row.id);
      if (idx >= 0) assignmentsRef.current[idx] = row;
      else assignmentsRef.current = [...assignmentsRef.current, row];
    }
    return true;
  }

  function assignmentRangeBounds(rows: Assignment[]): {
    start: string;
    end: string;
  } | null {
    if (rows.length === 0) return null;
    let start = rows[0].start_date;
    let end = rows[0].end_date;
    for (const row of rows) {
      if (row.start_date < start) start = row.start_date;
      const rowEnd =
        (row.recurrence ?? "none") === "weekly"
          ? weeklySeriesEndDate(
              row,
              projectsById.get(row.project_id)?.end_date,
            )
          : row.end_date;
      if (rowEnd > end) end = rowEnd;
    }
    return { start, end };
  }

  function trackedSetLeaveBlock(args: {
    personId: string;
    startDate: string;
    endDate: string;
    kind: LeaveKind;
    hours_per_day: number | null;
    notes: string;
    previousDayIds?: string[];
  }): LeaveDay[] {
    const previousDayIds = args.previousDayIds ?? [];
    const rangeStart =
      args.startDate <= args.endDate ? args.startDate : args.endDate;
    const rangeEnd =
      args.startDate <= args.endDate ? args.endDate : args.startDate;
    const dates = workingDaysBetween(rangeStart, rangeEnd);
    const dateSet = new Set(dates);
    const prevIdSet = new Set(previousDayIds);
    const restoreLeaves = state.leave_days
      .filter(
        (l) =>
          l.person_id === args.personId &&
          (prevIdSet.has(l.id) || dateSet.has(l.date)),
      )
      .map((l) => ({ ...l }));
    const beforeAsgById = new Map(
      state.assignments.map((a) => [a.id, { ...a }]),
    );

    const result = setLeaveBlock(args);

    const removeAssignmentIds = result.asgUpserts
      .filter((a) => !beforeAsgById.has(a.id))
      .map((a) => a.id);
    const restoreAssignments: Assignment[] = [];
    for (const id of result.asgDeletes) {
      const prev = beforeAsgById.get(id);
      if (prev) restoreAssignments.push(prev);
    }
    for (const a of result.asgUpserts) {
      const prev = beforeAsgById.get(a.id);
      if (prev) restoreAssignments.push(prev);
    }

    pushUndo({
      kind: "leave",
      restoreLeaves,
      removeLeaveIds: result.rows.map((r) => r.id),
      removeLeaveKeys: result.rows.map((r) => `${r.person_id}:${r.date}`),
      restoreAssignments,
      removeAssignmentIds,
    });

    if (result.asgUpserts.length > 0 || result.asgDeletes.length > 0) {
      assignmentsRef.current = (() => {
        let next = assignmentsRef.current.filter(
          (a) => !result.asgDeletes.includes(a.id),
        );
        for (const a of result.asgUpserts) {
          const exists = next.some((x) => x.id === a.id);
          next = exists
            ? next.map((x) => (x.id === a.id ? a : x))
            : [...next, a];
        }
        return next;
      })();
    }

    return result.rows;
  }

  function deleteSelectedAssignment() {
    if (!canManage || !editForm) return;
    if (pendingCreate?.id === editForm.id) {
      cancelPendingCreate();
      return;
    }
    const before = state.assignments.find((a) => a.id === editForm.id);
    if (
      before &&
      (before.recurrence ?? "none") === "weekly" &&
      selectedOccurrence
    ) {
      setDeletePrompt({
        assignment: before,
        occurrence: selectedOccurrence,
      });
      return;
    }
    const deletedId = editForm.id;
    const affectedTaskIds = state.assignment_bound_tasks
      .filter((r) => r.assignment_id === deletedId)
      .map((r) => r.task_id);
    trackedDelete(deletedId);
    if (affectedTaskIds.length > 0) {
      const remainingBinds = state.assignment_bound_tasks.filter(
        (r) => r.assignment_id !== deletedId,
      );
      const remainingAssignments = state.assignments.filter(
        (a) => a.id !== deletedId,
      );
      const patches = syncNonGanttTaskDatesFromBindings(
        remainingBinds,
        state.tasks,
        state.task_lists,
        remainingAssignments,
        affectedTaskIds,
      );
      for (const patch of patches) {
        const task = state.tasks.find((t) => t.id === patch.taskId);
        if (!task) continue;
        upsertTask({
          ...task,
          start_date: patch.start_date,
          due_date: patch.due_date,
        });
      }
    }
    selectAssignment(null);
    setEditForm(null);
    closeMobilePanel();
    push("Assignment deleted");
  }
  deleteSelectedAssignmentRef.current = deleteSelectedAssignment;

  function applyDeleteChoice(scope: "occurrence" | "future") {
    const pending = deletePrompt;
    if (!pending) return;
    setDeletePrompt(null);
    if (scope === "occurrence" && pending.occurrence) {
      commitAssignment(
        withRecurrenceException(
          pending.assignment,
          pending.occurrence.start,
        ),
        "Occurrence removed from series",
      );
      selectAssignment(null);
      setEditForm(null);
      closeMobilePanel();
      return;
    }
    // This and all future: trim series so past weeks remain, and remove
    // holiday-punch continuations / fragments from this date forward.
    if (pending.occurrence) {
      const fromKey = pending.occurrence.start;
      const seed = pending.assignment;
      const trimmed = endWeeklySeriesBeforeOccurrence(seed, fromKey);
      if (trimmed) {
        commitAssignment(trimmed, "Future occurrences removed");
      } else {
        trackedDelete(seed.id);
        push("Assignment deleted");
      }

      const related = state.assignments.filter(
        (a) =>
          a.id !== seed.id &&
          a.person_id === seed.person_id &&
          a.project_id === seed.project_id &&
          a.hours_per_day === seed.hours_per_day,
      );
      for (const a of related) {
        if (a.start_date >= fromKey) {
          trackedDelete(a.id);
          continue;
        }
        if ((a.recurrence ?? "none") === "weekly") {
          const contTrim = endWeeklySeriesBeforeOccurrence(a, fromKey);
          if (contTrim) {
            commitAssignment(contTrim);
          } else if (
            !a.recurrence_end_date ||
            a.recurrence_end_date >= fromKey
          ) {
            trackedDelete(a.id);
          }
        } else if (a.end_date >= fromKey) {
          // One-off fragment overlapping this week forward — drop it.
          trackedDelete(a.id);
        }
      }
    } else {
      trackedDelete(pending.assignment.id);
      push("Assignment deleted");
    }
    selectAssignment(null);
    setEditForm(null);
    closeMobilePanel();
  }

  function clearMobilePanelOpenTimer() {
    if (mobilePanelOpenTimerRef.current != null) {
      clearTimeout(mobilePanelOpenTimerRef.current);
      mobilePanelOpenTimerRef.current = null;
    }
  }

  /** Open the narrow assignment/leave sheet. Phones wait 200ms (matches sheet animation). */
  function openMobilePanel(opts?: { immediate?: boolean }) {
    if (!isNarrow) return;
    clearMobilePanelOpenTimer();
    if (opts?.immediate || !isPhone) {
      setMobilePanelOpen(true);
      return;
    }
    mobilePanelOpenTimerRef.current = setTimeout(() => {
      mobilePanelOpenTimerRef.current = null;
      setMobilePanelOpen(true);
    }, 200);
  }

  function closeMobilePanel() {
    clearMobilePanelOpenTimer();
    setMobilePanelOpen(false);
  }

  function selectAssignment(
    id: string | null,
    occurrence?: { start: string; end: string } | null,
  ) {
    setSelectedId(id);
    setSelectedOccurrence(occurrence ?? null);
    if (id) {
      setSelectedLeaveBlockId(null);
      setLeaveEditForm(null);
      const hasBoundTasks = state.assignment_bound_tasks.some(
        (r) => r.assignment_id === id,
      );
      if (hasBoundTasks && id !== selectedId) setSidebarPanelTab("tasks");
    }
    if (id) {
      if (isNarrow) openMobilePanel();
      else setSidebarMinimized(false);
    } else if (!isNarrow) {
      setSidebarMinimized(sidebarPreferMinimizedRef.current);
    } else {
      clearMobilePanelOpenTimer();
    }
  }

  // One-shot deep-link: /schedule?assignment=&tab=details&date=
  useEffect(() => {
    const assignmentId = filters.assignment?.trim();
    if (!assignmentId) {
      deepLinkAssignmentRef.current = null;
      return;
    }
    if (deepLinkAssignmentRef.current === assignmentId) return;

    const a = state.assignments.find((x) => x.id === assignmentId);
    if (!a) {
      const dateKey = filters.date?.trim();
      if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        void ensureScheduleRange(
          toDateKey(subWeeks(parseISO(dateKey), 2)),
          toDateKey(addWeeks(parseISO(dateKey), 2)),
        );
      }
      const projectId = filters.project?.trim();
      if (projectId && projectId !== "all") {
        void ensureProjectData(projectId);
      }
      return;
    }

    const dateKey = filters.date?.trim();
    if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      if (dateKey < startKey || dateKey > endKey) {
        setFilters({
          person: a.person_id,
          project: a.project_id,
        });
        setAnchor(
          scheduleAnchorForDateWithOffset(
            dateKey,
            readUserViewPrefs(profile?.id).scheduleViewOffset,
          ),
        );
        return;
      }
    }

    deepLinkAssignmentRef.current = assignmentId;
    const targetDate =
      dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : a.start_date;
    const occs = expandAssignmentInRange(a, targetDate, targetDate);
    const occ = occs.find((o) => occurrenceCoversDay(o, targetDate));
    setFilters({
      assignment: "",
      tab: "",
      date: "",
      person: a.person_id,
      project: a.project_id,
    });
    selectAssignment(
      a.id,
      occ
        ? { start: occ.start_date, end: occ.end_date }
        : { start: a.start_date, end: a.end_date },
    );
    const tabRaw = filters.tab?.trim().toLowerCase();
    if (tabRaw === "tasks") {
      setSidebarPanelTab("tasks");
    } else if (tabRaw === "hours") {
      setSidebarPanelTab("hours");
    } else if (tabRaw === "assigner") {
      setSidebarPanelTab("assigner");
    } else if (tabRaw === "details" || tabRaw === "edit") {
      setSidebarPanelTab("edit");
    } else {
      // No explicit tab: Tasks when bound, otherwise Edit.
      const hasBound = state.assignment_bound_tasks.some(
        (r) => r.assignment_id === a.id,
      );
      setSidebarPanelTab(hasBound ? "tasks" : "edit");
    }
    scrollScheduleToDateKey(targetDate);
  }, [
    filters.assignment,
    filters.tab,
    filters.date,
    filters.project,
    startKey,
    endKey,
    state.assignments,
    setFilters,
    isNarrow,
    ensureProjectData,
    ensureScheduleRange,
  ]);

  // bindTask deep-link effect is below createAssignment (uses finishProjectBindFlow).

  function applyRecurrenceChoice(scope: "instance" | "future") {
    const pending = recurrencePrompt;
    if (!pending) return;
    setRecurrencePrompt(null);
    setDragPreview(null);

    // Map template shift onto the occurrence span.
    const deltaStart = workingDayDelta(
      pending.before.start_date,
      pending.after.start_date,
    );
    const deltaEnd = workingDayDelta(
      pending.before.end_date,
      pending.after.end_date,
    );
    const instanceStart = shiftWorkingDays(
      pending.occurrenceStart,
      deltaStart,
    );
    const instanceEnd = shiftWorkingDays(pending.occurrenceEnd, deltaEnd);

    const {
      id: _seriesId,
      organization_id: _orgId,
      ...afterFields
    } = pending.after;

    if (scope === "future") {
      // Do not remote-upsert `before` first — that races the exception/split
      // writes and can wipe recurrence_exceptions for other clients (looks like
      // a copy). Series is still at `before` in the DB when the prompt opens.
      const split = splitWeeklySeriesForFuture({
        series: pending.before,
        occurrenceStart: pending.occurrenceStart,
        occurrenceEnd: pending.occurrenceEnd,
        future: {
          ...afterFields,
          start_date: instanceStart,
          end_date: instanceEnd,
        },
        newId,
        organizationId: state.organization.id,
      });
      const upserts = split.keepSeries
        ? [split.keepSeries, split.futureSeries]
        : [split.futureSeries];
      const undoRemoveIds =
        split.futureSeries.id === pending.before.id
          ? []
          : [split.futureSeries.id];
      trackedAssignmentBatch({
        upserts,
        undoRestore: [pending.before],
        undoRemoveIds,
        toast: "Updated this and all future",
      });
      for (const row of upserts) {
        syncBoundTaskDatesFromAssignment(row);
      }
      const bounds = assignmentRangeBounds(upserts);
      if (
        bounds &&
        punchAssignmentLeaveHoles(
          upserts,
          pending.after.person_id,
          bounds.start,
          bounds.end,
        )
      ) {
        push("Trimmed around time off to avoid overlap", "warning");
      } else if (pending.leaveTrimmed) {
        push("Trimmed around time off to avoid overlap", "warning");
      }
      selectAssignment(split.futureSeries.id, {
        start: split.futureSeries.start_date,
        end: split.futureSeries.end_date,
      });
      return;
    }

    // Just this one: detach week (exception) + one-off instance.
    const split = splitWeeklySeriesForInstance({
      series: pending.before,
      occurrenceStart: pending.occurrenceStart,
      occurrenceEnd: pending.occurrenceEnd,
      instance: {
        ...afterFields,
        start_date: instanceStart,
        end_date: instanceEnd,
        hours_per_day: pending.after.hours_per_day,
        status: pending.after.status,
        notes: pending.after.notes,
        person_id: pending.after.person_id,
        project_id: pending.after.project_id,
        allocation_pct: pending.after.allocation_pct,
      },
      newId,
      organizationId: state.organization.id,
    });
    const finalizeUpserts = (
      upserts: Assignment[],
      selectId: string,
      selectStart: string,
      selectEnd: string,
    ) => {
      for (const row of upserts) {
        syncBoundTaskDatesFromAssignment(row);
      }
      const bounds = assignmentRangeBounds(upserts);
      if (
        bounds &&
        punchAssignmentLeaveHoles(
          upserts,
          pending.after.person_id,
          bounds.start,
          bounds.end,
        )
      ) {
        push("Trimmed around time off to avoid overlap", "warning");
      } else if (pending.leaveTrimmed) {
        push("Trimmed around time off to avoid overlap", "warning");
      }
      selectAssignment(selectId, { start: selectStart, end: selectEnd });
    };

    if (split.keepSeries) {
      trackedAssignmentBatch({
        upserts: [
          split.keepSeries,
          ...(split.continuation ? [split.continuation] : []),
          split.instance,
        ],
        undoRestore: [pending.before],
        undoRemoveIds: [
          ...(split.continuation ? [split.continuation.id] : []),
          split.instance.id,
        ],
        toast: "Updated this instance only",
      });
      finalizeUpserts(
        [
          split.keepSeries,
          ...(split.continuation ? [split.continuation] : []),
          split.instance,
        ],
        split.instance.id,
        split.instance.start_date,
        split.instance.end_date,
      );
    } else {
      trackedAssignmentBatch({
        upserts: [
          ...(split.continuation ? [split.continuation] : []),
          split.instance,
        ],
        deletes: [pending.before.id],
        undoRestore: [pending.before],
        undoRemoveIds: [
          ...(split.continuation ? [split.continuation.id] : []),
          split.instance.id,
        ],
        toast: "Updated this instance only",
      });
      finalizeUpserts(
        [
          ...(split.continuation ? [split.continuation] : []),
          split.instance,
        ],
        split.instance.id,
        split.instance.start_date,
        split.instance.end_date,
      );
    }
  }

  /** Clear assignment/leave selection (keeps project filter & toolbar state). */
  function deselectScheduleItem() {
    if (pendingCreate) {
      cancelPendingCreate();
      return;
    }
    setSelectedId(null);
    setEditForm(null);
    setSelectedLeaveBlockId(null);
    setLeaveEditForm(null);
    setDragPreview(null);
    if (isNarrow) closeMobilePanel();
    else setSidebarMinimized(sidebarPreferMinimizedRef.current);
  }

  /**
   * Click empty schedule chrome (not a block, not the sidebar) clears
   * selection. Blocks stopPropagation so a re-click stays selected.
   */
  function onScheduleBackgroundPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    if (isPhone) {
      weekSwipeRef.current = { x: e.clientX, y: e.clientY };
    }
    if (dragSnapshot.current || leaveDragSnapshot.current) return;
    if (draft || leaveDraft) return;
    if (!selectedId && !leaveEditForm && !selectedLeaveBlockId) return;
    const target = e.target as Element | null;
    if (target?.closest("[data-schedule-block]")) return;
    deselectScheduleItem();
  }

  function onScheduleWeekSwipeEnd(e: ReactPointerEvent) {
    const start = weekSwipeRef.current;
    weekSwipeRef.current = null;
    if (!isPhone || !start) return;
    if (gridDragging || draft || leaveDraft) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    ignoreNextScheduleClickRef.current = true;
    shiftAnchor(dx < 0 ? 1 : -1);
  }

  function selectLeaveBlock(block: LeaveBlock | null) {
    if (!block) {
      setSelectedLeaveBlockId(null);
      setLeaveEditForm(null);
      clearMobilePanelOpenTimer();
      if (!isNarrow) setSidebarMinimized(sidebarPreferMinimizedRef.current);
      return;
    }
    setSelectedId(null);
    setEditForm(null);
    setSelectedLeaveBlockId(block.id);
    setLeaveEditForm({
      blockId: block.id,
      person_id: block.person_id,
      start_date: block.start_date,
      end_date: block.end_date,
      kind: block.kind,
      hours_per_day: block.hours_per_day,
      notes: block.notes,
      dayIds: block.dayIds,
    });
    if (isNarrow) openMobilePanel();
    else setSidebarMinimized(false);
  }

  /** Hide the sidebar and clear the current assignment/leave selection. */
  function minimizeSidePanel() {
    if (pendingCreate) cancelPendingCreate();
    setSelectedId(null);
    setEditForm(null);
    setSelectedLeaveBlockId(null);
    setLeaveEditForm(null);
    if (isNarrow) {
      closeMobilePanel();
      return;
    }
    setSidebarPreferMinimized(true);
    setSidebarMinimized(true);
  }

  function expandSidePanel() {
    setSidebarPreferMinimized(false);
    setSidebarMinimized(false);
  }

  /** Return to the default Budget / plan sidebar (clear assignment + project filter). */
  function closeSidePanel() {
    if (pendingCreate) cancelPendingCreate();
    setSelectedId(null);
    setEditForm(null);
    setSelectedLeaveBlockId(null);
    setLeaveEditForm(null);
    setDraft(null);
    setLeaveDraft(null);
    setFilters({ project: "all", person: "all" });
    closeMobilePanel();
    setSidebarMinimized(sidebarPreferMinimizedRef.current);
    dragSnapshot.current = null;
  }
  closeSidePanelRef.current = closeSidePanel;

  function warnBudget(projectId: string, assignments: Assignment[]) {
    const project = projectsById.get(projectId);
    if (!project) return;
    const burn = budgetBurn(
      project,
      assignments,
      state.people,
      false,
      new Date(),
      state.project_members.filter((m) => m.project_id === project.id),
      state.project_contractor_expenses.filter(
        (e) => e.project_id === project.id,
      ),
      state.organization_settings,
    );
    if (burn.overBy > 0) {
      push(`Over total budget by ${formatHours(burn.overBy)}`, "warning");
    }
  }

  function createAssignment(
    personId: string,
    projectId: string,
    start: string,
    end: string,
    opts?: { bindTaskIds?: string[] },
  ) {
    if (!canManage) return;
    const startDate = start <= end ? start : end;
    const endDate = start <= end ? end : start;
    const origin = startDate;
    // Clip against live ref (includes same-tick punches); ignore any prior pending draft.
    const forClip = assignmentsRef.current.filter(
      (a) => a.id !== pendingCreate?.id,
    );
    const clipped = clipRangeToFreeDays(
      personId,
      projectId,
      origin,
      startDate,
      endDate,
      forClip,
    );
    if (!clipped) {
      push("That day is already booked", "warning");
      return;
    }
    const bindTaskIds = opts?.bindTaskIds ?? [];
    const orderedBindIds = sortBoundTaskIdsByListOrder(
      bindTaskIds,
      state.tasks,
      state.task_lists,
    );
    const notes =
      orderedBindIds.length > 0
        ? boundTasksNotesHtml(
            orderedBindIds
              .map((id) => state.tasks.find((t) => t.id === id)?.title ?? "")
              .filter(Boolean),
            "in_sync",
          )
        : "";
    const row: Assignment = {
      id: newId("asg"),
      organization_id: state.organization.id,
      person_id: personId,
      project_id: projectId,
      start_date: clipped.start,
      end_date: clipped.end,
      hours_per_day: 4,
      allocation_pct: 50,
      status: "confirmed",
      notes,
      recurrence: "none",
      recurrence_end_date: null,
      recurrence_exceptions: [],
      created_at: new Date().toISOString(),
      edited_at: null,
      edited_by_profile_id: null,
    };
    setPendingCreate(row);
    setEditForm({ ...row });
    focusHoursAfterCreateRef.current = row.id;
    setSidebarPanelTab("edit");
    selectAssignment(row.id, {
      start: row.start_date,
      end: row.end_date,
    });
    if (bindTaskIds.length > 0) {
      setBindToAssignment(true);
      setBindEditingSelection(true);
      setBindDraftIds(new Set(orderedBindIds));
    }
  }

  function cancelPendingCreate() {
    if (!pendingCreate) return;
    const id = pendingCreate.id;
    revertBindInsertPunch();
    setPendingCreate(null);
    pendingProjectBindTaskIdRef.current = null;
    setBindToAssignment(false);
    setBindEditingSelection(false);
    setBindDraftIds(new Set());
    setBindConfirm(null);
    if (selectedId === id) {
      setSelectedId(null);
      setEditForm(null);
      setSelectedOccurrence(null);
    }
  }

  function finishProjectBindFlow(
    taskId: string,
    personId: string,
    projectId: string,
    rangeStart: string,
    rangeEnd: string,
  ) {
    pendingProjectBindTaskIdRef.current = taskId;
    setFilters({
      bindTask: "",
      date: "",
      person: personId,
      project: projectId,
    });
    createAssignment(personId, projectId, rangeStart, rangeEnd, {
      bindTaskIds: [taskId],
    });
    scrollScheduleToDateKey(rangeStart);
  }

  function applyProjectRowPunchForInsert(
    personId: string,
    projectId: string,
    rangeStart: string,
    rangeEnd: string,
    opts?: { trackBindInsertUndo?: boolean },
  ) {
    const boundAssignmentIds = new Set(
      state.assignment_bound_tasks.map((r) => r.assignment_id),
    );
    const before = assignmentsRef.current;
    const preIds = new Set(before.map((a) => a.id));
    const { upserts, deletes } = punchProjectRowForInsertRange(
      before,
      personId,
      projectId,
      rangeStart,
      rangeEnd,
      newId,
      boundAssignmentIds,
    );
    if (deletes.length === 0 && upserts.length === 0) return;
    const undoRestore = before.filter(
      (a) =>
        deletes.includes(a.id) || upserts.some((u) => u.id === a.id),
    );
    const undoRemoveIds = upserts
      .filter((u) => !preIds.has(u.id))
      .map((u) => u.id);
    trackedAssignmentBatch({
      upserts,
      deletes,
      undoRestore,
      undoRemoveIds,
    });
    if (opts?.trackBindInsertUndo) {
      bindInsertPunchPendingRef.current = {
        kind: "assignments",
        restoreAssignments: undoRestore.map((a) => ({ ...a })),
        removeAssignmentIds: undoRemoveIds,
      };
    }
  }

  // One-shot: /schedule?bindTask=&person=&project=&date= — create assignment + preselect task
  useEffect(() => {
    if (!canManage || bindCollisionConfirm) return;
    const taskId = filters.bindTask?.trim();
    if (!taskId) {
      deepLinkBindTaskRef.current = null;
      return;
    }
    if (deepLinkBindTaskRef.current === taskId) return;
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) {
      void ensureProjectData(filters.project?.trim() || "");
      return;
    }
    const personId =
      filters.person?.trim() && filters.person !== "all"
        ? filters.person.trim()
        : (task.assignee_person_id ?? "");
    const projectId =
      filters.project?.trim() && filters.project !== "all"
        ? filters.project.trim()
        : task.project_id;
    if (!personId || !projectId) return;

    const dateKey = filters.date?.trim();
    if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      if (dateKey < startKey || dateKey > endKey) {
        setAnchor(
          scheduleAnchorForDateWithOffset(
            dateKey,
            readUserViewPrefs(profile?.id).scheduleViewOffset,
          ),
        );
        return;
      }
    }

    const hasPredefinedDates = Boolean(task.start_date || task.due_date);
    if (hasPredefinedDates) {
      const desiredStart = task.start_date || task.due_date!;
      const desiredEnd = task.due_date || task.start_date!;
      const collides = desiredRangeCollidesOnProjectRow({
        personId,
        projectId,
        start: desiredStart,
        end: desiredEnd,
        assignments: state.assignments,
        leaveDays: state.leave_days,
      });
      deepLinkBindTaskRef.current = taskId;
      if (collides) {
        setFilters({
          bindTask: "",
          date: "",
          person: personId,
          project: projectId,
        });
        const allowSlice = !rangeOverlapsAssignmentWithBoundTasks({
          personId,
          projectId,
          start: desiredStart,
          end: desiredEnd,
          assignments: state.assignments,
          binds: state.assignment_bound_tasks,
        });
        setBindCollisionConfirm({
          taskId,
          personId,
          projectId,
          desiredStart,
          desiredEnd,
          allowSlice,
        });
        scrollScheduleToDateKey(desiredStart);
        return;
      }
      finishProjectBindFlow(
        taskId,
        personId,
        projectId,
        desiredStart,
        desiredEnd,
      );
      return;
    }

    deepLinkBindTaskRef.current = taskId;
    const start =
      task.start_date ||
      (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
        ? dateKey
        : toDateKey(new Date()));
    const end = task.due_date || start;
    const available = nextAvailableScheduleRange({
      personId,
      projectId,
      start,
      end,
      assignments: state.assignments,
      leaveDays: state.leave_days,
    });
    finishProjectBindFlow(
      taskId,
      personId,
      projectId,
      available?.start ?? start,
      available?.end ?? end,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep link
  }, [
    filters.bindTask,
    filters.person,
    filters.project,
    filters.date,
    canManage,
    bindCollisionConfirm,
    startKey,
    endKey,
    state.tasks,
    state.assignments,
    state.leave_days,
  ]);

  function commitAssignment(next: Assignment, toast?: string) {
    let row = next;
    const before = state.assignments.find((a) => a.id === row.id);
    if (
      before &&
      before.person_id !== row.person_id &&
      state.assignment_bound_tasks.some((r) => r.assignment_id === row.id)
    ) {
      push(
        "Unbind tasks before changing the assignment’s person",
        "warning",
      );
      return;
    }
    if (
      before &&
      (before.start_date !== row.start_date ||
        before.end_date !== row.end_date) &&
      isAssignmentScheduleLocked(row.id)
    ) {
      setGanttMoveLockedNotice(true);
      return;
    }
    const checkStart =
      row.start_date < startKey ? row.start_date : startKey;
    const checkEnd = row.end_date > endKey ? row.end_date : endKey;
    const padStart = shiftWorkingDays(checkStart, -20);
    const padEnd = shiftWorkingDays(checkEnd, 60);
    if (
      assignmentPlacementConflicts(
        row,
        state.assignments,
        padStart,
        padEnd,
      )
    ) {
      const clipped = clipRangeToFreeDays(
        row.person_id,
        row.project_id,
        row.start_date,
        row.start_date,
        row.end_date,
        state.assignments,
        row.id,
      );
      if (!clipped) {
        push("That range overlaps another block on this project", "warning");
        return;
      }
      if (
        clipped.start !== row.start_date ||
        clipped.end !== row.end_date
      ) {
        row = {
          ...row,
          start_date: clipped.start,
          end_date: clipped.end,
        };
        if (
          assignmentPlacementConflicts(
            row,
            state.assignments,
            padStart,
            padEnd,
          )
        ) {
          push("That range overlaps another block on this project", "warning");
          return;
        }
      } else {
        push("That range overlaps another block on this project", "warning");
        return;
      }
    }
    const datesChanged =
      !before ||
      before.start_date !== row.start_date ||
      before.end_date !== row.end_date;
    if (
      datesChanged &&
      before &&
      assignmentHasScheduleBoundGantt(row.id)
    ) {
      setGanttScheduleMoveNotice(true);
    }
    trackedUpsert(row, toast);
    const wasPending = pendingCreate?.id === row.id;
    if (wasPending) {
      setPendingCreate(null);
      bindInsertPunchPendingRef.current = null;
    }
    const assignments = [
      ...state.assignments.filter((a) => a.id !== row.id),
      row,
    ];
    const boundIds = state.assignment_bound_tasks
      .filter((r) => r.assignment_id === row.id)
      .map((r) => r.task_id);
    if (datesChanged) {
      const datePatches = syncNonGanttTaskDatesFromBindings(
        state.assignment_bound_tasks,
        state.tasks,
        state.task_lists,
        assignments,
        boundIds,
      );
      syncBoundTaskDatesFromAssignment(row);
      const nextTasks = state.tasks.map((t) => {
        const patch = datePatches.find((p) => p.taskId === t.id);
        return patch
          ? { ...t, start_date: patch.start_date, due_date: patch.due_date }
          : t;
      });
      const oos = assignmentIsOutOfSync(
        state.assignment_bound_tasks,
        nextTasks,
        state.task_lists,
        assignments,
        row.id,
      );
      void setAssignmentBoundTasksOutOfSync(row.id, oos);
      if (boundIds.length > 0) {
        refreshBoundAssignmentNotes(row, boundIds, oos);
      }
    } else if (boundIds.length > 0) {
      const oos = assignmentIsOutOfSync(
        state.assignment_bound_tasks,
        state.tasks,
        state.task_lists,
        assignments,
        row.id,
      );
      refreshBoundAssignmentNotes(row, boundIds, oos);
    }
    const bounds = assignmentRangeBounds([row]);
    if (
      bounds &&
      punchAssignmentLeaveHoles(
        [row],
        row.person_id,
        bounds.start,
        bounds.end,
      )
    ) {
      push("Trimmed around time off to avoid overlap", "warning");
    }
    if (editForm?.id === row.id) {
      setEditForm({
        ...row,
        edited_at: new Date().toISOString(),
        edited_by_profile_id: profile?.id ?? null,
      });
    }
    const pendingBind = pendingProjectBindTaskIdRef.current;
    if (pendingBind && canManage) {
      const ids = new Set(bindDraftIds);
      ids.add(pendingBind);
      void applyAssignmentBind([...ids], "project");
    } else if (
      wasPending &&
      canManage &&
      bindToAssignment &&
      bindDraftIds.size > 0
    ) {
      void applyAssignmentBind([...bindDraftIds], "schedule");
    }
  }

  function patchEditForm(patch: Partial<Assignment>) {
    setEditForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setPendingCreate((prev) =>
      prev && editForm && prev.id === editForm.id
        ? { ...prev, ...patch }
        : prev,
    );
  }

  function saveEditForm() {
    if (!canManage || !editForm) return;
    const next: Assignment = {
      ...editForm,
      hours_per_day: Math.max(
        0.01,
        roundAssignmentHours(editForm.hours_per_day),
      ),
    };
    if ((next.recurrence ?? "none") === "weekly") {
      next.recurrence_end_date = weeklySeriesEndDate(
        next,
        projectsById.get(next.project_id)?.end_date,
      );
    }
    const isPending = pendingCreate?.id === editForm.id;
    const before = state.assignments.find((a) => a.id === editForm.id);
    if (
      !isPending &&
      before &&
      (before.recurrence ?? "none") === "weekly" &&
      selectedOccurrence
    ) {
      setRecurrencePrompt({
        before,
        after: next,
        occurrenceStart: selectedOccurrence.start,
        occurrenceEnd: selectedOccurrence.end,
      });
      return;
    }
    commitAssignment(
      next,
      isPending ? "Assignment created" : "Assignment saved",
    );
  }

  function createLeaveRange(
    personId: string,
    start: string,
    end: string,
  ) {
    if (!canManage) return;
    const startDate = start <= end ? start : end;
    const endDate = start <= end ? end : start;
    // New paints default to Partial Day — keep other assignments intact.
    const defaultHours = 4;
    const kind: LeaveKind = "vacation";
    const rows = trackedSetLeaveBlock({
      personId,
      startDate,
      endDate,
      kind,
      hours_per_day: defaultHours,
      notes: "",
    });
    if (rows.length === 0) return;
    push(
      rows.length === 1
        ? "Partial Day added"
        : `${rows.length} Partial Day days added`,
    );
    setSelectedId(null);
    setEditForm(null);
    setSelectedLeaveBlockId(rows[0].id);
    setLeaveEditForm({
      blockId: rows[0].id,
      person_id: personId,
      start_date: startDate,
      end_date: endDate,
      kind,
      hours_per_day: defaultHours,
      notes: "",
      dayIds: rows.map((r) => r.id),
    });
    if (isNarrow) openMobilePanel();
    else setSidebarMinimized(false);
  }

  function saveLeaveEditForm() {
    if (!canManage || !leaveEditForm) return;
    const fullDay = isFullDayLeave({
      kind: leaveEditForm.kind,
      hours_per_day: leaveEditForm.hours_per_day,
    });
    const hours = fullDay
      ? null
      : Math.max(
          0.01,
          roundAssignmentHours(leaveEditForm.hours_per_day ?? 4),
        );
    const startDate =
      leaveEditForm.start_date <= leaveEditForm.end_date
        ? leaveEditForm.start_date
        : leaveEditForm.end_date;
    const endDate =
      leaveEditForm.start_date <= leaveEditForm.end_date
        ? leaveEditForm.end_date
        : leaveEditForm.start_date;
    const rows = trackedSetLeaveBlock({
      personId: leaveEditForm.person_id,
      startDate,
      endDate,
      kind: leaveEditForm.kind,
      hours_per_day: hours,
      notes: leaveEditForm.notes,
      previousDayIds: leaveEditForm.dayIds,
    });
    if (rows.length === 0) {
      push("No working days in that range");
      return;
    }
    setLeaveEditForm({
      ...leaveEditForm,
      start_date: startDate,
      end_date: endDate,
      hours_per_day: hours,
      dayIds: rows.map((r) => r.id),
      blockId: rows[0].id,
    });
    setSelectedLeaveBlockId(rows[0].id);
    push(fullDay ? "Full-day time off saved" : "Time off saved");
  }

  function applyLeaveResizeToColumn(colStart: string, colEnd: string) {
    const snap = leaveDragSnapshot.current;
    if (!snap) return;
    let start = snap.originStart;
    let end = snap.originEnd;
    if (snap.mode === "resize-end") {
      end = colEnd >= snap.originStart ? colEnd : snap.originStart;
    } else if (snap.mode === "resize-start") {
      start = colStart <= snap.originEnd ? colStart : snap.originEnd;
    } else {
      const desiredDelta = workingDayDelta(snap.grabDateKey, colStart);
      start = shiftWorkingDays(snap.originStart, desiredDelta);
      end = shiftWorkingDays(snap.originEnd, desiredDelta);
    }
    if (start === snap.currentStart && end === snap.currentEnd) {
      return;
    }
    snap.dirty = true;
    snap.currentStart = start;
    snap.currentEnd = end;
    setLeaveEditForm((prev) =>
      prev && prev.person_id === snap.personId
        ? { ...prev, start_date: start, end_date: end }
        : prev,
    );
  }

  function finishPointer() {
    if (leaveDraft) {
      createLeaveRange(
        leaveDraft.personId,
        leaveDraft.start,
        leaveDraft.end,
      );
      setLeaveDraft(null);
    }
    if (draft) {
      createAssignment(
        draft.personId,
        draft.projectId,
        draft.start,
        draft.end,
      );
      setDraft(null);
    }
    if (leaveDragSnapshot.current) {
      const snap = leaveDragSnapshot.current;
      leaveDragSnapshot.current = null;
      if (snap.dirty) {
        const rows = trackedSetLeaveBlock({
          personId: snap.personId,
          startDate: snap.currentStart,
          endDate: snap.currentEnd,
          kind: snap.kind,
          hours_per_day: snap.hours_per_day,
          notes: snap.notes,
          previousDayIds: snap.previousDayIds,
        });
        if (rows.length > 0) {
          setSelectedLeaveBlockId(rows[0].id);
          setLeaveEditForm({
            blockId: rows[0].id,
            person_id: snap.personId,
            start_date: snap.currentStart <= snap.currentEnd
              ? snap.currentStart
              : snap.currentEnd,
            end_date: snap.currentStart <= snap.currentEnd
              ? snap.currentEnd
              : snap.currentStart,
            kind: snap.kind,
            hours_per_day: snap.hours_per_day,
            notes: snap.notes,
            dayIds: rows.map((r) => r.id),
          });
          push("Time off saved");
        }
      }
    }
    if (dragSnapshot.current) {
      const snap = dragSnapshot.current;
      if (snap.dirty) {
        if (snap.weeklyInstance) {
          const previewStart = snap.previewStart;
          const previewEnd = snap.previewEnd;
          const deltaStart = workingDayDelta(
            snap.occurrenceStart,
            previewStart,
          );
          const deltaEnd = workingDayDelta(snap.occurrenceEnd, previewEnd);
          const after: Assignment = {
            ...snap.before,
            start_date: shiftWorkingDays(snap.before.start_date, deltaStart),
            end_date: shiftWorkingDays(snap.before.end_date, deltaEnd),
          };
          // Keep dragPreview until scope is chosen so only this instance stays
          // visually offset while the prompt is open.
          dragSnapshot.current = null;
          setRecurrencePrompt({
            before: snap.before,
            after,
            occurrenceStart: snap.occurrenceStart,
            occurrenceEnd: snap.occurrenceEnd,
            leaveTrimmed: snap.leaveTrimmed,
          });
          if (snap.leaveTrimmed) {
            push("Trimmed around time off to avoid overlap", "warning");
          }
          setGridDragging(false);
          return;
        }
        const after = assignmentById(snap.id);
        const isPendingDrag = pendingCreate?.id === snap.id;
        if (
          after &&
          !isPendingDrag &&
          (snap.before.recurrence ?? "none") === "weekly"
        ) {
          // Revert live drag mutation until the user chooses scope.
          upsertAssignment(snap.before);
          assignmentsRef.current = assignmentsRef.current.map((a) =>
            a.id === snap.before.id ? snap.before : a,
          );
          setRecurrencePrompt({
            before: snap.before,
            after,
            occurrenceStart: snap.occurrenceStart,
            occurrenceEnd: snap.occurrenceEnd,
            leaveTrimmed: snap.leaveTrimmed,
          });
          if (snap.leaveTrimmed) {
            push("Trimmed around time off to avoid overlap", "warning");
          }
        } else if (after && isPendingDrag) {
          if (snap.leaveTrimmed) {
            push("Trimmed around time off to avoid overlap", "warning");
          }
        } else if (after) {
          pushUndo({ kind: "restore", assignment: { ...snap.before } });
          if (
            after.start_date !== snap.before.start_date ||
            after.end_date !== snap.before.end_date
          ) {
            syncBoundTaskDatesFromAssignment(after);
          }
          const bounds = assignmentRangeBounds([after]);
          if (
            bounds &&
            punchAssignmentLeaveHoles(
              [after],
              after.person_id,
              bounds.start,
              bounds.end,
            )
          ) {
            push("Trimmed around time off to avoid overlap", "warning");
          } else if (snap.leaveTrimmed) {
            push("Trimmed around time off to avoid overlap", "warning");
          } else {
            push("Assignment saved");
          }
          warnBudget(snap.before.project_id, assignmentsRef.current);
        }
      } else {
        setDragPreview(null);
      }
      dragSnapshot.current = null;
    }
    setGridDragging(false);
  }

  // projectsByPersonId replaces per-render projectsForPerson scans.

  function sliceAssignmentAt(
    assignmentId: string,
    cutDate: string,
    opts?: {
      confirmed?: boolean;
      occurrenceStart?: string;
      occurrenceEnd?: string;
    },
  ) {
    const base = state.assignments.find((a) => a.id === assignmentId);
    if (!base) return;
    const occStart = opts?.occurrenceStart ?? base.start_date;
    const occEnd = opts?.occurrenceEnd ?? base.end_date;
    if (occStart >= occEnd) return;
    if (cutDate < occStart || cutDate >= occEnd) return;
    const days = workingDaysBetween(occStart, occEnd);
    if (!days.includes(cutDate)) return;
    const cutIndex = days.indexOf(cutDate);
    if (cutIndex < 0 || cutIndex >= days.length - 1) return;
    const hasBound = state.assignment_bound_tasks.some(
      (r) => r.assignment_id === assignmentId,
    );
    if (hasBound && !opts?.confirmed) {
      setCutBoundConfirm({
        assignmentId,
        cutDate,
        occurrenceStart: opts?.occurrenceStart,
        occurrenceEnd: opts?.occurrenceEnd,
      });
      return;
    }
    setCutBoundConfirm(null);
    const boundRows = state.assignment_bound_tasks
      .filter((r) => r.assignment_id === assignmentId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const recurrence = base.recurrence ?? "none";

    if (recurrence === "weekly") {
      const { upserts, deletes } = sliceWeeklyOccurrenceAt(
        base,
        cutDate,
        occStart,
        occEnd,
        newId,
      );
      if (upserts.length === 0 && deletes.length === 0) return;

      const leftFrag = upserts.find(
        (a) =>
          a.recurrence === "none" &&
          a.start_date === days[0] &&
          a.end_date === cutDate,
      );
      const rightFrag = upserts.find(
        (a) =>
          a.recurrence === "none" &&
          a.start_date === days[cutIndex + 1] &&
          a.end_date === days[days.length - 1],
      );
      const newIds = upserts
        .filter((row) => row.id !== base.id)
        .map((row) => row.id);

      pushUndo({
        kind: "assignments",
        restoreAssignments: [{ ...base }],
        removeAssignmentIds: newIds,
      });

      for (const row of upserts) {
        upsertAssignment(row);
      }

      const finishWeeklySlice = () => {
        for (const id of deletes) {
          deleteAssignment(id);
        }
        selectAssignment(leftFrag?.id ?? assignmentId);
        setSliceMode(false);
        push("Assignment sliced");
      };

      if (boundRows.length > 0 && leftFrag && rightFrag) {
        void (async () => {
          await copyAssignmentBoundTasks(assignmentId, leftFrag.id);
          await copyAssignmentBoundTasks(assignmentId, rightFrag.id);
          if (!deletes.includes(assignmentId)) {
            await clearAssignmentBoundTasks(assignmentId);
          }
          const nextAssignments = state.assignments
            .filter((a) => !deletes.includes(a.id))
            .concat(upserts);
          const nextBinds = [
            ...state.assignment_bound_tasks.filter(
              (r) => r.assignment_id !== assignmentId,
            ),
            ...boundRows.map((r) => ({
              ...r,
              assignment_id: leftFrag.id,
            })),
            ...boundRows.map((r) => ({
              ...r,
              assignment_id: rightFrag.id,
            })),
          ];
          const taskIds = [...new Set(boundRows.map((r) => r.task_id))];
          const patches = syncNonGanttTaskDatesFromBindings(
            nextBinds,
            state.tasks,
            state.task_lists,
            nextAssignments,
            taskIds,
          );
          for (const patch of patches) {
            const task = state.tasks.find((t) => t.id === patch.taskId);
            if (!task) continue;
            upsertTask({
              ...task,
              start_date: patch.start_date,
              due_date: patch.due_date,
            });
          }
          finishWeeklySlice();
        })();
      } else {
        finishWeeklySlice();
      }
      return;
    }

    const leftEnd = cutDate;
    const rightStart = days[cutIndex + 1];
    const left: Assignment = {
      ...base,
      end_date: leftEnd,
    };
    const right: Assignment = {
      ...base,
      id: newId("asg"),
      start_date: rightStart,
    };
    pushUndo({
      kind: "assignments",
      restoreAssignments: [{ ...base }],
      removeAssignmentIds: [right.id],
    });
    upsertAssignment(left);
    upsertAssignment(right);
    if (boundRows.length > 0) {
      void copyAssignmentBoundTasks(assignmentId, right.id).then(() => {
        // Left keeps its existing binds; recompute span across both.
        const nextAssignments = state.assignments
          .filter((a) => a.id !== base.id)
          .concat([left, right]);
        const nextBinds = [
          ...state.assignment_bound_tasks.filter(
            (r) => r.assignment_id !== assignmentId,
          ),
          ...boundRows,
          ...boundRows.map((r) => ({
            ...r,
            assignment_id: right.id,
          })),
        ];
        const taskIds = [...new Set(boundRows.map((r) => r.task_id))];
        const patches = syncNonGanttTaskDatesFromBindings(
          nextBinds,
          state.tasks,
          state.task_lists,
          nextAssignments,
          taskIds,
        );
        for (const patch of patches) {
          const task = state.tasks.find((t) => t.id === patch.taskId);
          if (!task) continue;
          upsertTask({
            ...task,
            start_date: patch.start_date,
            due_date: patch.due_date,
          });
        }
      });
    }
    selectAssignment(left.id);
    setSliceMode(false);
    push("Assignment sliced");
  }

  function dateKeyAtBlockX(
    clientX: number,
    blockLeft: number,
    occStart: string,
    occEnd: string,
  ): string | null {
    const days = workingDaysBetween(occStart, occEnd);
    if (days.length === 0) return null;
    const dayWidth = columns[0]?.width ?? DAY_W;
    const offset = Math.max(0, clientX - blockLeft);
    const index = Math.min(days.length - 1, Math.floor(offset / dayWidth));
    return days[index] ?? null;
  }

  const sortedProjects = useMemo(
    () => sortProjectsByClientThenName(state.projects, state.clients),
    [state.projects, state.clients],
  );
  const sortedClients = useMemo(
    () => sortClientsByName(state.clients),
    [state.clients],
  );

  /** Sidebar budget list — projects with assignments for visible people in range. */
  const sidebarProjectBurns = useMemo(() => {
    if (!canManage) return [];
    const visibleIds = new Set(visiblePeople.map((p) => p.id));
    const projectIds = new Set<string>();
    for (const a of assignmentsView) {
      if (!visibleIds.has(a.person_id)) continue;
      if (!assignmentOverlapsDateRange(a, startKey, endKey, projectsById.get(a.project_id)?.end_date)) continue;
      projectIds.add(a.project_id);
    }
    return sortedProjects
      .filter((p) => p.status === "active" && projectIds.has(p.id))
      .map((project) => ({
        project,
        client: project.client_id
          ? clientsById.get(project.client_id)
          : undefined,
        burn: budgetBurn(
          project,
          state.assignments,
          state.people,
          false,
          new Date(),
          state.project_members.filter((m) => m.project_id === project.id),
          state.project_contractor_expenses.filter(
            (e) => e.project_id === project.id,
          ),
          state.organization_settings,
        ),
      }));
  }, [
    canManage,
    sortedProjects,
    clientsById,
    assignmentsView,
    state.assignments,
    state.people,
    state.project_members,
    state.project_contractor_expenses,
    state.organization_settings,
    visiblePeople,
    startKey,
    endKey,
  ]);

  const addableProjectsForPerson = useMemo(() => {
    if (!addProjectForPerson) return [];
    // Use person assignments + extras only — ignore the global project filter so
    // “already shown” is accurate for the add dialog.
    const shown = new Set<string>([
      ...state.assignments
        .filter((a) => a.person_id === addProjectForPerson)
        .map((a) => a.project_id),
      ...(extraProjectsByPerson[addProjectForPerson] ?? []),
    ]);
    return sortedProjects.filter(
      (p) => p.status === "active" && !shown.has(p.id),
    );
  }, [
    addProjectForPerson,
    sortedProjects,
    state.assignments,
    extraProjectsByPerson,
  ]);

  const addProjectClientOptions = useMemo(() => {
    return {
      // Full client list (not only those with remaining projects) so the
      // first select is never mysteriously blank.
      withClient: sortedClients,
      addableCount: addableProjectsForPerson.length,
    };
  }, [addableProjectsForPerson, sortedClients]);

  const addableProjectsForSelectedClient = useMemo(() => {
    if (!addProjectClientId) return [];
    return addableProjectsForPerson.filter(
      (p) => p.client_id === addProjectClientId,
    );
  }, [addableProjectsForPerson, addProjectClientId]);

  function closeAddProjectModal() {
    setAddProjectForPerson(null);
    setAddProjectClientId("");
    setAddProjectId("");
  }

  function confirmAddProjectRow() {
    if (!addProjectForPerson || !addProjectId) return;
    setExtraProjectsByPerson((prev) => {
      const list = prev[addProjectForPerson] ?? [];
      if (list.includes(addProjectId)) return prev;
      return {
        ...prev,
        [addProjectForPerson]: [...list, addProjectId],
      };
    });
    closeAddProjectModal();
    push("Project row added");
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col bg-[var(--bg)] lg:flex-row"
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={cn(
            "border-b border-[var(--border)] px-3 py-2 sm:px-5 sm:py-3",
            isPhone
              ? "flex flex-col gap-2"
              : "flex flex-wrap items-center gap-2",
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <NavBtn onClick={() => shiftAnchor(-1)} label="Prev">
                <ChevronLeft size={16} />
              </NavBtn>
              <button
                type="button"
                className="h-8 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
                onClick={goToday}
              >
                Today
              </button>
              <NavBtn onClick={() => shiftAnchor(1)} label="Next">
                <ChevronRight size={16} />
              </NavBtn>
            </div>
            <p
              className={cn(
                "min-w-0 text-sm font-medium",
                isPhone && "flex-1 truncate",
              )}
            >
              {rangeLabel}
            </p>
            {isPhone ? (
              <button
                type="button"
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-sm text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                onClick={() => setPhoneFiltersExpanded((v) => !v)}
                aria-expanded={phoneFiltersExpanded}
                aria-controls="schedule-phone-filters"
                title={
                  phoneFiltersExpanded
                    ? "Hide filters and tools"
                    : "Show filters and tools"
                }
              >
                <ChevronDown
                  size={16}
                  className={cn(
                    "transition-transform",
                    phoneFiltersExpanded && "rotate-180",
                  )}
                />
                {phoneFiltersExpanded ? "Less" : "Filters"}
              </button>
            ) : null}
            {isPhone && isNarrow ? (
              <button
                type="button"
                className="h-8 shrink-0 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
                onClick={() => openMobilePanel({ immediate: true })}
              >
                {sidebarExpandLabel}
              </button>
            ) : null}
          </div>
          <div
            id="schedule-phone-filters"
            className={cn(
              "flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto",
              isPhone && !phoneFiltersExpanded && "hidden",
            )}
          >
            <Select
              value={zoom}
              onChange={(v) => setFilter("zoom", v)}
              className="mt-0 h-8 w-[7.25rem] shrink-0"
              aria-label="Schedule zoom"
              options={[
                { value: "day", label: "By day" },
                { value: "week", label: "By week" },
                { value: "month", label: "By month" },
              ]}
            />
            {zoom === "day" && !isPhone ? (
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
            ) : null}
            <Select
              value={capacityGrain}
              onChange={(v) => setFilter("capacity", v)}
              className="mt-0 h-8 w-[9.5rem] shrink-0"
              aria-label="Capacity view"
              options={[
                { value: "week", label: "Capacity / week" },
                { value: "day", label: "Capacity / day" },
              ]}
            />
            {(canManage || isPublicShare) && (
              <>
                <Select
                  value={projectFilter}
                  onChange={(v) => setFilter("project", v)}
                  searchable
                  className="mt-0 h-8 w-full min-w-0 max-w-full shrink sm:w-auto sm:min-w-[13rem] sm:max-w-[22rem] sm:shrink-0"
                  aria-label="Filter by project"
                  options={[
                    { value: "all", label: "All projects" },
                    ...sortedProjects.map((p) => ({
                      value: p.id,
                      label: projectLabelWithClient(p, state.clients),
                    })),
                  ]}
                />
                <Select
                  value={viewAsPersonId ?? personFilter}
                  onChange={(v) => setFilter("person", v)}
                  searchable
                  disabled={Boolean(viewAsPersonId)}
                  className="mt-0 h-8 w-full min-w-0 max-w-full shrink sm:w-auto sm:min-w-[10rem] sm:max-w-[16rem] sm:shrink-0"
                  aria-label="Filter by person"
                  options={[
                    { value: "all", label: "All people" },
                    ...peopleForFilter.map((p) => ({
                      value: p.id,
                      label: p.name,
                    })),
                  ]}
                />
                {canManage ? (
                  <>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-md border",
                        sliceMode
                          ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
                      )}
                      onClick={() => setSliceMode((v) => !v)}
                      title="Slice: click a day on a multi-day block to split it"
                      aria-label="Slice"
                      aria-pressed={sliceMode}
                    >
                      <Scissors size={14} />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => performUndo()}
                      disabled={undoDepth === 0}
                      title="Undo (Ctrl+Z)"
                      aria-label="Undo"
                    >
                      <Undo2 size={14} />
                    </button>
                  </>
                ) : null}
              </>
            )}
            {!isPhone && isNarrow ? (
              <button
                type="button"
                className="h-8 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
                onClick={() => openMobilePanel({ immediate: true })}
              >
                {sidebarExpandLabel}
              </button>
            ) : !isPhone ? (
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-[var(--row-hover)]",
                  formDirty
                    ? "border-[var(--status-near)]/50 text-[var(--status-near)]"
                    : "border-[var(--border)]",
                )}
                onClick={
                  sidebarMinimized ? expandSidePanel : minimizeSidePanel
                }
                aria-pressed={!sidebarMinimized}
                title={
                  sidebarMinimized
                    ? `Open ${sidebarExpandLabel}`
                    : "Minimize sidebar"
                }
              >
                {sidebarMinimized ? (
                  <PanelRightOpen size={14} strokeWidth={1.75} />
                ) : (
                  <PanelRightClose size={14} strokeWidth={1.75} />
                )}
                {sidebarExpandLabel}
              </button>
            ) : null}
          </div>
        </div>

        {canManage && selectedBurn && selectedProject && (
          <div className="border-b border-[var(--border)] px-3 py-2 sm:px-5">
            <BurnBar burn={selectedBurn} settings={state.organization_settings} />
          </div>
        )}

        <div
          ref={scrollRef}
          className={cn(
            "min-h-0 flex-1 overflow-auto overscroll-contain",
            isPhone ? "touch-pan-y" : "touch-pan-x touch-pan-y",
          )}
          onPointerDown={onScheduleBackgroundPointerDown}
          onPointerUp={onScheduleWeekSwipeEnd}
          onPointerCancel={() => {
            weekSwipeRef.current = null;
          }}
        >
          <div style={{ width: LABEL_PX + tw, minWidth: "100%" }}>
            <div className="sticky top-0 z-30 bg-[var(--bg)]">
              {/* Group labels (month / year) */}
              <div className="flex border-b border-[var(--border)]">
                <div
                  className="sticky left-0 z-40 shrink-0 border-r border-[var(--border)] bg-[var(--bg)]"
                  style={{ width: LABEL_PX }}
                />
                <div className="flex min-w-0 flex-1">
                  {headerGroups.map((g, i) => (
                    <div
                      key={`${g.label}-${g.startKey}-${i}`}
                      className={cn(
                        "relative flex items-center justify-center py-1.5 text-xs font-semibold leading-none text-[var(--text-muted)]",
                        zoom === "month"
                          ? "border-r border-[var(--schedule-day-border)]"
                          : "border-r-2 border-[var(--schedule-week-border)]",
                        g.isCurrent && "bg-[var(--today-col)]",
                      )}
                      style={{ width: g.width }}
                    >
                      {g.isCurrent ? (
                        <span
                          className="absolute inset-x-0 top-0 h-px bg-[var(--accent)]"
                          aria-hidden
                        />
                      ) : null}
                      {g.cornerLabel ? (
                        <span
                          className={cn(
                            "absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-medium tabular-nums",
                            g.isCurrent
                              ? "text-[var(--accent)]"
                              : "text-[var(--text-muted)] opacity-70",
                          )}
                        >
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

              {/* Column labels */}
              <div className="flex border-b border-[var(--border)]">
                <div
                  className="sticky left-0 z-40 flex shrink-0 items-center border-r border-[var(--border)] bg-[var(--bg)] px-1.5 sm:px-2"
                  style={{ width: LABEL_PX, height: DAY_H }}
                >
                  {showPodFilter ? (
                    <Select
                      value={podFilter}
                      onChange={(v) => setPodFilter(v as PodFilter)}
                      options={podSelectOptions}
                      searchable={state.pods.length > 6}
                      className="mt-0 h-7 w-full min-w-0 py-0 text-xs"
                      aria-label="Filter schedule by pod"
                    />
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-1">
                  {columns.map((col) => (
                    <div
                      key={col.id}
                      className={cn(
                        "relative flex items-center justify-center text-xs",
                        col.isWeekBoundaryEnd
                          ? "border-r-2 border-[var(--schedule-week-border)]"
                          : "border-r border-[var(--schedule-day-border)]",
                        zoom === "day" &&
                          col.isToday &&
                          "bg-[var(--today-col)] font-semibold text-[var(--accent)]",
                        zoom === "week" &&
                          col.isCurrentWeek &&
                          "bg-[var(--today-col)]",
                        zoom === "week" &&
                          col.isToday &&
                          "font-semibold text-[var(--accent)]",
                        zoom === "month" &&
                          col.isToday &&
                          "bg-[var(--today-col)]",
                      )}
                      style={{
                        width: col.width,
                        height: DAY_H,
                      }}
                    >
                      {col.isToday && zoom === "month" ? (
                        <span
                          className="absolute inset-x-0 top-0 h-px bg-[var(--accent)]"
                          aria-hidden
                        />
                      ) : null}
                      {col.isToday && zoom === "day" ? (
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

            {scheduleRenderOrder.map((person, personIndex) => {
              const showPmSeparator =
                scheduleProjectManagers.length > 0 &&
                personIndex === scheduleMembers.length;
              const personProjects =
                projectsByPersonId.get(person.id) ?? EMPTY_PROJECTS;
              const collapsed = collapsedPeople.has(person.id);
              const bodyCollapsed = deferredCollapsedPeople.has(person.id);
              const utilBands = utilByPersonId.get(person.id) ?? EMPTY_UTIL;
              const personOccs =
                occurrencesByPersonId.get(person.id) ?? EMPTY_OCCS;
              const personDraft =
                draft?.personId === person.id ? draft : null;
              const personLeaveDraft =
                leaveDraft?.personId === person.id ? leaveDraft : null;
              const personLeaveEditPreview =
                leaveEditForm?.person_id === person.id
                  ? {
                      start: leaveEditForm.start_date,
                      end: leaveEditForm.end_date,
                    }
                  : null;
              const selectedAssignmentId =
                selected?.person_id === person.id ? selectedId : null;
              const personSelectedOccurrence =
                selectedAssignmentId && selectedOccurrence
                  ? selectedOccurrence
                  : null;

              const personLeaveDays = state.leave_days.filter(
                (l) => l.person_id === person.id,
              );
              const leaveSignature = personLeaveDays
                .map((l) => `${l.id}:${l.date}:${l.kind}:${l.hours_per_day ?? ""}`)
                .join("|");

              return (
                <Fragment key={person.id}>
                  {showPmSeparator && (
                    <div className="flex border-b border-t border-[var(--border)] bg-[var(--bg-elevated)]/60">
                      <div
                        className="sticky left-0 z-20 flex items-center px-3 py-1.5"
                        style={{ width: LABEL_PX }}
                      >
                        <ManagerTag>Project Managers</ManagerTag>
                      </div>
                    </div>
                  )}
                <PersonScheduleSection
                  person={person}
                  collapsed={collapsed}
                  bodyCollapsed={bodyCollapsed}
                  personProjects={personProjects}
                  utilBands={utilBands}
                  personOccs={personOccs}
                  leaveSignature={leaveSignature}
                  labelPx={LABEL_PX}
                  zoom={zoom}
                  canManage={canManage}
                  tw={tw}
                  startKey={startKey}
                  endKey={endKey}
                  columns={columns}
                  personDraft={personDraft}
                  personLeaveDraft={personLeaveDraft}
                  personLeaveEditPreview={personLeaveEditPreview}
                  selectedAssignmentId={selectedAssignmentId}
                  selectedOccurrence={personSelectedOccurrence}
                  selectedLeaveBlockId={
                    leaveEditForm?.person_id === person.id
                      ? selectedLeaveBlockId
                      : null
                  }
                  gridDragging={gridDragging}
                  sliceMode={sliceMode}
                  capacityGrain={capacityGrain}
                  scrollRef={scrollRef}
                  onToggleCollapsed={togglePersonCollapsed}
                  onAddProject={() => {
                    setAddProjectClientId("");
                    setAddProjectId("");
                    setAddProjectForPerson(person.id);
                  }}
                >
                  {(blocksReady) => (
                  <>
                  {/* Assignments body: Time off + projects, with full-height leave overlay */}
                  {(() => {
                    const leaveBlocks = leaveBlocksInRange(
                      state.leave_days,
                      person.id,
                      startKey,
                      endKey,
                    );
                    // Only saved Full Day expands / washes — Type in the
                    // sidebar is pending until Save.
                    const partialLeaveBlocks = leaveBlocks.filter(
                      (b) => !isFullDayLeave(b),
                    );
                    const fullLeaveBlocks = leaveBlocks.filter((b) =>
                      isFullDayLeave(b),
                    );
                    const leaveDraftGeo =
                      leaveDraft && leaveDraft.personId === person.id
                        ? spanColumnsPx(
                            columns,
                            leaveDraft.start,
                            leaveDraft.end,
                          )
                        : null;

                    const projectLeaveFills =
                      zoom === "day"
                        ? []
                        : columns
                            .filter(
                              (col) =>
                                availableHoursInRange(
                                  person,
                                  col.startKey,
                                  col.endKey,
                                  state.leave_days,
                                ) <= 0,
                            )
                            .map((col) => ({
                              start: col.startKey,
                              end: col.endKey,
                            }));

                    function leaveBlockEditors(
                      block: LeaveBlock,
                      fullHeight: boolean,
                    ) {
                      const isSelected = selectedLeaveBlockId === block.id;
                      const preview =
                        isSelected && leaveEditForm ? leaveEditForm : null;
                      const blockStart =
                        preview?.start_date ?? block.start_date;
                      const blockEnd = preview?.end_date ?? block.end_date;
                      const geo = spanColumnsPx(
                        columns,
                        blockStart,
                        blockEnd,
                      );
                      if (!geo) return null;
                      const spanDays = workingDaysBetween(
                        blockStart,
                        blockEnd,
                      );
                      // Label follows sidebar Type before Save; height /
                      // wipe still use saved hours until Save.
                      const typeLabel = leaveBlockLabel(
                        preview?.kind ?? block.kind,
                        preview ? preview.hours_per_day : block.hours_per_day,
                      );
                      const hoursLabel =
                        (preview?.hours_per_day ?? block.hours_per_day) ==
                        null
                          ? null
                          : (preview?.hours_per_day ??
                              block.hours_per_day);
                      const label =
                        hoursLabel == null
                          ? typeLabel
                          : spanDays.length > 1
                            ? `${typeLabel} · ${formatHours(hoursLabel)}/d · ${formatHours(hoursLabel * spanDays.length)}`
                            : `${typeLabel} · ${formatHours(hoursLabel)}`;
                      const beginLeaveDrag = (
                        mode: "move" | "resize-end" | "resize-start",
                        grabDateKey: string,
                      ) => {
                        selectLeaveBlock(block);
                        leaveDragSnapshot.current = {
                          mode,
                          personId: block.person_id,
                          // Keep saved type/hours — pending Full Day
                          // only applies via Save time off.
                          kind: block.kind,
                          hours_per_day: block.hours_per_day,
                          notes: preview?.notes ?? block.notes,
                          previousDayIds: preview?.dayIds ?? block.dayIds,
                          originStart: blockStart,
                          originEnd: blockEnd,
                          currentStart: blockStart,
                          currentEnd: blockEnd,
                          grabDateKey,
                          dirty: false,
                        };
                        // selectLeaveBlock resets the form to saved days —
                        // restore the visual span we're dragging from.
                        setLeaveEditForm((prev) =>
                          prev && prev.person_id === block.person_id
                            ? {
                                ...prev,
                                start_date: blockStart,
                                end_date: blockEnd,
                                notes: preview?.notes ?? block.notes,
                                dayIds: preview?.dayIds ?? block.dayIds,
                              }
                            : prev,
                        );
                        setGridDragging(true);
                      };
                      return (
                        <div
                          key={block.id}
                          data-schedule-block
                          className={cn(
                            "pointer-events-auto absolute z-10 flex items-center rounded-sm border border-[var(--leave-block)]/50 px-1 text-[10px] font-medium leading-none",
                            "text-[var(--leave-block-fg)]",
                            canManage && "cursor-grab",
                            gridDragging && "pointer-events-none",
                            isSelected &&
                              "ring-2 ring-[var(--leave-block)] ring-offset-1 ring-offset-[var(--bg)]",
                            fullHeight && "inset-y-0 z-[12] flex-col rounded-sm",
                          )}
                          style={{
                            left: geo.left,
                            width: geo.width,
                            backgroundColor: "var(--leave-block-wash)",
                            backgroundImage:
                              "repeating-linear-gradient(-45deg, transparent, transparent 4px, var(--leave-block-hatch) 4px, var(--leave-block-hatch) 8px)",
                            ...(fullHeight
                              ? {}
                              : {
                                  top: DAY_PAD_Y,
                                  height: DAY_H,
                                }),
                          }}
                          title={label}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            e.preventDefault();
                            if (!canManage) {
                              selectLeaveBlock(block);
                              return;
                            }
                            if (isCoarse || e.pointerType === "touch") {
                              selectLeaveBlock(block);
                              return;
                            }
                            const rect = (
                              e.currentTarget as HTMLElement
                            ).getBoundingClientRect();
                            const dayKey = dateKeyAtBlockX(
                              e.clientX,
                              rect.left,
                              blockStart,
                              blockEnd,
                            );
                            const grabDays = workingDaysBetween(
                              blockStart,
                              blockEnd,
                            );
                            const grabDateKey =
                              dayKey && grabDays.includes(dayKey)
                                ? dayKey
                                : blockStart;
                            beginLeaveDrag("move", grabDateKey);
                          }}
                        >
                          <div
                            className={cn(
                              "relative flex w-full items-center gap-0.5",
                              fullHeight && "px-0",
                            )}
                            style={
                              fullHeight
                                ? {
                                    height: DAY_H,
                                    marginTop: DAY_PAD_Y,
                                  }
                                : undefined
                            }
                          >
                            <span className="truncate">{label}</span>
                            {notesHasContent(
                              preview?.notes ?? block.notes,
                            ) ? (
                              <Tooltip
                                content={
                                  <RichNotesHtml
                                    html={preview?.notes ?? block.notes}
                                  />
                                }
                                className="ml-0.5 inline-flex shrink-0"
                              >
                                <span
                                  className="inline-flex cursor-default opacity-90"
                                  aria-label="Notes"
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  <StickyNote size={13} strokeWidth={2.5} />
                                </span>
                              </Tooltip>
                            ) : null}
                          </div>
                          {canManage ? (
                            <>
                              <span
                                className="absolute left-0 top-0 z-20 h-full w-2 cursor-ew-resize"
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return;
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (
                                    isCoarse ||
                                    e.pointerType === "touch"
                                  ) {
                                    selectLeaveBlock(block);
                                    return;
                                  }
                                  beginLeaveDrag("resize-start", blockStart);
                                }}
                              />
                              <span
                                className="absolute right-0 top-0 z-20 h-full w-2 cursor-ew-resize"
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return;
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (
                                    isCoarse ||
                                    e.pointerType === "touch"
                                  ) {
                                    selectLeaveBlock(block);
                                    return;
                                  }
                                  beginLeaveDrag("resize-end", blockEnd);
                                }}
                              />
                            </>
                          ) : null}
                        </div>
                      );
                    }

                    return (
                  <div className="relative">
                  {/* Time off row — managers paint partial-day leave here */}
                  <div
                    className="flex shrink-0"
                    style={{ height: ROW_H }}
                  >
                    <div
                      className="sticky left-0 z-20 flex min-h-0 shrink-0 items-center justify-end gap-2 border-r border-[var(--border)] bg-[var(--bg)] px-3"
                      style={{ width: LABEL_PX, height: ROW_H }}
                    >
                      <span className="truncate text-[11px] font-medium leading-none text-[var(--text-muted)]">
                        Time Off
                      </span>
                      <ProjectColorBar
                        color="var(--leave-block)"
                        size="lg"
                        className="opacity-70"
                      />
                    </div>
                    <div
                      className="relative min-h-0 shrink-0"
                      style={{ width: tw, height: ROW_H }}
                    >
                      <ScheduleRowHitLayer
                        columns={columns}
                        width={tw}
                        height={ROW_H}
                        rangeStart={
                          leaveDraft?.personId === person.id
                            ? leaveDraft.start
                            : null
                        }
                        rangeEnd={
                          leaveDraft?.personId === person.id
                            ? leaveDraft.end
                            : null
                        }
                        rangeClassName="bg-[var(--leave-block-draft)]"
                        hoverClassName="bg-[var(--leave-block-draft)]"
                        interactive={canManage}
                        cursorClassName="cursor-pointer"
                        title={canManage ? "Paint Partial Day" : undefined}
                        onColumnPointerEnter={(col) => {
                          if (
                            leaveDragSnapshot.current &&
                            leaveDragSnapshot.current.personId === person.id
                          ) {
                            applyLeaveResizeToColumn(
                              col.startKey,
                              col.endKey,
                            );
                            return;
                          }
                          if (
                            leaveDraft &&
                            leaveDraft.personId === person.id
                          ) {
                            setLeaveDraft({
                              ...leaveDraft,
                              start:
                                col.startKey < leaveDraft.originStart
                                  ? col.startKey
                                  : leaveDraft.originStart,
                              end:
                                col.endKey > leaveDraft.originEnd
                                  ? col.endKey
                                  : leaveDraft.originEnd,
                            });
                          }
                        }}
                        onColumnPointerDown={(col, e) => {
                          if (e.button !== 0) return;
                          if (!canManage) return;
                          const leaveInBand =
                            zoom === "day"
                              ? isOnLeave(
                                  person.id,
                                  col.startKey,
                                  state.leave_days,
                                )
                              : state.leave_days.find(
                                  (l) =>
                                    l.person_id === person.id &&
                                    l.status === "approved" &&
                                    l.date >= col.startKey &&
                                    l.date <= col.endKey,
                                );
                          if (leaveInBand) return;
                          if (isCoarse || e.pointerType === "touch") return;
                          e.preventDefault();
                          (e.currentTarget as HTMLElement).setPointerCapture?.(
                            e.pointerId,
                          );
                          setDraft(null);
                          setLeaveDraft({
                            personId: person.id,
                            start: col.startKey,
                            end: col.endKey,
                            originStart: col.startKey,
                            originEnd: col.endKey,
                          });
                        }}
                        onColumnClick={(col) => {
                          if (ignoreNextScheduleClickRef.current) {
                            ignoreNextScheduleClickRef.current = false;
                            return;
                          }
                          if (!canManage) return;
                          const leaveInBand =
                            zoom === "day"
                              ? isOnLeave(
                                  person.id,
                                  col.startKey,
                                  state.leave_days,
                                )
                              : state.leave_days.find(
                                  (l) =>
                                    l.person_id === person.id &&
                                    l.status === "approved" &&
                                    l.date >= col.startKey &&
                                    l.date <= col.endKey,
                                );
                          if (leaveInBand) return;
                          if (
                            !(
                              isCoarse ||
                              matchMedia("(pointer: coarse)").matches
                            )
                          ) {
                            return;
                          }
                          createLeaveRange(
                            person.id,
                            col.startKey,
                            col.endKey,
                          );
                        }}
                      />
                      {leaveDraftGeo ? (
                        <div
                          className="pointer-events-none absolute z-[11] rounded-sm border border-[var(--leave-block)]/40"
                          style={{
                            left: leaveDraftGeo.left,
                            width: leaveDraftGeo.width,
                            top: DAY_PAD_Y,
                            height: DAY_H,
                            background: "var(--leave-block-draft)",
                          }}
                        />
                      ) : null}
                      {(zoom === "day"
                        ? partialLeaveBlocks
                        : leaveBlocks
                      ).map((block) => leaveBlockEditors(block, false))}
                    </div>
                  </div>

                  {/* Project rows — blocks live here (no empty gap) */}
                  {!collapsed &&
                    personProjects.map((project) => {
                    const rowOccs = personOccs.filter(
                      (o) => o.project_id === project.id,
                    );
                    const clientName = project.client_id
                      ? clientsById.get(project.client_id)?.name
                      : null;
                    return (
                      <div
                        key={project.id}
                        className="flex shrink-0"
                        style={{ height: ROW_H }}
                      >
                        <div
                          className="sticky left-0 z-20 flex min-h-0 shrink-0 items-center justify-end gap-2 border-r border-[var(--border)] bg-[var(--bg)] px-3"
                          style={{ width: LABEL_PX, height: ROW_H }}
                        >
                          <div className="min-w-0 text-right">
                            {clientName ? (
                              <div className="truncate text-xs leading-tight text-[var(--text-muted)]">
                                {clientName}
                              </div>
                            ) : null}
                            {canManage ? (
                              <Link
                                href={projectHref(project)}
                                className={cn(
                                  "block min-w-0 truncate text-[11px] leading-none text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline",
                                  clientName && "mt-0.5",
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {project.name}
                              </Link>
                            ) : (
                              <span
                                className={cn(
                                  "block min-w-0 truncate text-[11px] leading-none text-[var(--text-muted)]",
                                  clientName && "mt-0.5",
                                )}
                              >
                                {project.name}
                              </span>
                            )}
                          </div>
                          <ProjectColorBar
                            color={projectDisplayColor(project, clientsById)}
                            size="lg"
                          />
                        </div>
                        <div
                          className="relative min-h-0 shrink-0"
                          style={{
                            width: tw,
                            height: ROW_H,
                          }}
                        >
                          <ScheduleRowHitLayer
                            columns={columns}
                            width={tw}
                            height={ROW_H}
                            rangeStart={
                              draft?.personId === person.id &&
                              draft?.projectId === project.id
                                ? draft.start
                                : null
                            }
                            rangeEnd={
                              draft?.personId === person.id &&
                              draft?.projectId === project.id
                                ? draft.end
                                : null
                            }
                            fillRanges={projectLeaveFills}
                            interactive={canManage}
                            cursorClassName="cursor-pointer"
                            onColumnPointerEnter={(col) => {
                              if (
                                leaveDragSnapshot.current &&
                                leaveDragSnapshot.current.personId ===
                                  person.id
                              ) {
                                applyLeaveResizeToColumn(
                                  col.startKey,
                                  col.endKey,
                                );
                                return;
                              }
                              if (
                                draft &&
                                draft.personId === person.id &&
                                draft.projectId === project.id
                              ) {
                                const rawStart =
                                  col.startKey < draft.originStart
                                    ? col.startKey
                                    : draft.originStart;
                                const rawEnd =
                                  col.endKey > draft.originEnd
                                    ? col.endKey
                                    : draft.originEnd;
                                const clipped = clipRangeToFreeDays(
                                  person.id,
                                  project.id,
                                  draft.originStart,
                                  rawStart,
                                  rawEnd,
                                  state.assignments,
                                );
                                if (clipped) {
                                  setDraft({
                                    ...draft,
                                    start: clipped.start,
                                    end: clipped.end,
                                  });
                                }
                              }
                              const snap = dragSnapshot.current;
                              if (!snap || !canManage) return;
                              const current = assignmentById(snap.id);
                              if (
                                !current ||
                                current.person_id !== person.id
                              ) {
                                return;
                              }
                              const placementAssignments = assignmentsForPlacement(
                                pendingCreate?.id === snap.id ? snap.id : null,
                              );
                              if (snap.weeklyInstance) {
                                const vacated = withRecurrenceException(
                                  snap.before,
                                  snap.occurrenceStart,
                                );
                                const checkAssignments =
                                  placementAssignments.map((a) =>
                                    a.id === snap.id ? vacated : a,
                                  );
                                if (snap.mode === "resize-end") {
                                  const minEnd = snap.occurrenceStart;
                                  const desiredEnd =
                                    col.endKey >= minEnd
                                      ? col.endKey
                                      : minEnd;
                                  const endResult = clampResizeEnd(
                                    current.person_id,
                                    current.project_id,
                                    snap.occurrenceStart,
                                    desiredEnd,
                                    checkAssignments,
                                    "__weekly_preview__",
                                    state.leave_days,
                                  );
                                  const end = endResult.value;
                                  if (endResult.leaveTrimmed) {
                                    snap.leaveTrimmed = true;
                                  }
                                  if (end !== snap.previewEnd) {
                                    snap.dirty = true;
                                    snap.previewStart = snap.occurrenceStart;
                                    snap.previewEnd = end;
                                    setDragPreview({
                                      assignmentId: snap.id,
                                      originStart: snap.occurrenceStart,
                                      originEnd: snap.occurrenceEnd,
                                      previewStart: snap.occurrenceStart,
                                      previewEnd: end,
                                    });
                                  }
                                } else if (snap.mode === "resize-start") {
                                  const maxStart = snap.occurrenceEnd;
                                  const desiredStart =
                                    col.startKey <= maxStart
                                      ? col.startKey
                                      : maxStart;
                                  const startResult = clampResizeStart(
                                    current.person_id,
                                    current.project_id,
                                    desiredStart,
                                    snap.occurrenceEnd,
                                    checkAssignments,
                                    "__weekly_preview__",
                                    state.leave_days,
                                  );
                                  const start = startResult.value;
                                  if (startResult.leaveTrimmed) {
                                    snap.leaveTrimmed = true;
                                  }
                                  if (start !== snap.previewStart) {
                                    snap.dirty = true;
                                    snap.previewStart = start;
                                    snap.previewEnd = snap.occurrenceEnd;
                                    setDragPreview({
                                      assignmentId: snap.id,
                                      originStart: snap.occurrenceStart,
                                      originEnd: snap.occurrenceEnd,
                                      previewStart: start,
                                      previewEnd: snap.occurrenceEnd,
                                    });
                                  }
                                } else {
                                  const hoverKey = col.startKey;
                                  const desiredDelta = workingDayDelta(
                                    snap.grabDateKey,
                                    hoverKey,
                                  );
                                  const { start, end } =
                                    resolveOccurrenceMovePlacement(
                                      snap.before,
                                      snap.occurrenceStart,
                                      snap.occurrenceEnd,
                                      desiredDelta,
                                      checkAssignments,
                                      startKey,
                                      endKey,
                                    );
                                  if (
                                    start !== snap.previewStart ||
                                    end !== snap.previewEnd
                                  ) {
                                    snap.dirty = true;
                                    snap.previewStart = start;
                                    snap.previewEnd = end;
                                    setDragPreview({
                                      assignmentId: snap.id,
                                      originStart: snap.occurrenceStart,
                                      originEnd: snap.occurrenceEnd,
                                      previewStart: start,
                                      previewEnd: end,
                                    });
                                  }
                                }
                                return;
                              }
                              if (snap.mode === "resize-end") {
                                const minEnd = snap.before.start_date;
                                const desiredEnd =
                                  col.endKey >= minEnd
                                    ? col.endKey
                                    : minEnd;
                                const endResult = clampResizeEnd(
                                  current.person_id,
                                  current.project_id,
                                  snap.before.start_date,
                                  desiredEnd,
                                  placementAssignments,
                                  snap.id,
                                  state.leave_days,
                                );
                                const end = endResult.value;
                                if (endResult.leaveTrimmed) {
                                  snap.leaveTrimmed = true;
                                }
                                if (end !== current.end_date) {
                                  snap.dirty = true;
                                  patchAssignmentDates(snap.id, {
                                    end_date: end,
                                  });
                                }
                              } else if (snap.mode === "resize-start") {
                                const maxStart = snap.before.end_date;
                                const desiredStart =
                                  col.startKey <= maxStart
                                    ? col.startKey
                                    : maxStart;
                                const startResult = clampResizeStart(
                                  current.person_id,
                                  current.project_id,
                                  desiredStart,
                                  snap.before.end_date,
                                  placementAssignments,
                                  snap.id,
                                  state.leave_days,
                                );
                                const start = startResult.value;
                                if (startResult.leaveTrimmed) {
                                  snap.leaveTrimmed = true;
                                }
                                if (start !== current.start_date) {
                                  snap.dirty = true;
                                  patchAssignmentDates(snap.id, {
                                    start_date: start,
                                  });
                                }
                              } else {
                                const hoverKey = col.startKey;
                                const desiredDelta = workingDayDelta(
                                  snap.grabDateKey,
                                  hoverKey,
                                );
                                const { start, end } = resolveMovePlacement(
                                  snap.before,
                                  desiredDelta,
                                  placementAssignments,
                                  startKey,
                                  endKey,
                                );
                                if (
                                  start !== current.start_date ||
                                  end !== current.end_date
                                ) {
                                  snap.dirty = true;
                                  patchAssignmentDates(snap.id, {
                                    start_date: start,
                                    end_date: end,
                                  });
                                }
                              }
                            }}
                            onColumnPointerDown={(col, e) => {
                              if (e.button !== 0) return;
                              const leaveBlocked =
                                zoom === "day"
                                  ? !!isOnFullDayLeave(
                                      person.id,
                                      col.startKey,
                                      state.leave_days,
                                    )
                                  : availableHoursInRange(
                                      person,
                                      col.startKey,
                                      col.endKey,
                                      state.leave_days,
                                    ) <= 0;
                              if (!canManage || leaveBlocked) return;
                              const occupied = occupiedDaysForRow(
                                person.id,
                                project.id,
                                col.startKey,
                                col.endKey,
                                state.assignments,
                              );
                              const paintDays = workingDaysBetween(
                                col.startKey,
                                col.endKey,
                              );
                              const originDay =
                                paintDays.find((d) => !occupied.has(d)) ?? null;
                              if (!originDay) return;
                              if (isCoarse || e.pointerType === "touch") {
                                return;
                              }
                              e.preventDefault();
                              (e.currentTarget as HTMLElement).setPointerCapture?.(
                                e.pointerId,
                              );
                              setDraft({
                                personId: person.id,
                                projectId: project.id,
                                start: originDay,
                                end: originDay,
                                originStart: originDay,
                                originEnd: originDay,
                              });
                            }}
                            onColumnClick={(col) => {
                              if (ignoreNextScheduleClickRef.current) {
                                ignoreNextScheduleClickRef.current = false;
                                return;
                              }
                              const leaveBlocked =
                                zoom === "day"
                                  ? !!isOnFullDayLeave(
                                      person.id,
                                      col.startKey,
                                      state.leave_days,
                                    )
                                  : availableHoursInRange(
                                      person,
                                      col.startKey,
                                      col.endKey,
                                      state.leave_days,
                                    ) <= 0;
                              if (!canManage || leaveBlocked) return;
                              if (
                                !(
                                  isCoarse ||
                                  matchMedia("(pointer: coarse)").matches
                                )
                              ) {
                                return;
                              }
                              createAssignment(
                                person.id,
                                project.id,
                                col.startKey,
                                col.endKey,
                              );
                            }}
                          />

                          {/* Blocks — painted once this person row has been revealed */}
                          {blocksReady &&
                            (zoom === "day"
                              ? rowOccs.map((occ) => {
                                  const geo = spanColumnsPx(
                                    columns,
                                    occ.start_date,
                                    occ.end_date,
                                  );
                                  if (!geo) return null;
                                  const isDragPreview =
                                    !!dragPreview &&
                                    dragPreview.assignmentId ===
                                      occ.assignmentId &&
                                    dragPreview.previewStart ===
                                      occ.start_date &&
                                    dragPreview.previewEnd === occ.end_date;
                                  const isSelected =
                                    selectedId === occ.assignmentId &&
                                    (isDragPreview ||
                                      !selectedOccurrence ||
                                      (selectedOccurrence.start ===
                                        occ.start_date &&
                                        selectedOccurrence.end ===
                                          occ.end_date));
                                  const spanDays = workingDaysBetween(
                                    occ.start_date,
                                    occ.end_date,
                                  );
                                  const totalHours =
                                    occ.hours_per_day * spanDays.length;
                                  const hoursLabel =
                                    spanDays.length > 1
                                      ? `${formatHours(occ.hours_per_day)} Daily / ${formatHours(totalHours)} Total`
                                      : formatHours(occ.hours_per_day);
                                  return (
                                    <div
                                      key={`${occ.assignmentId}-${occ.weekOffset}`}
                                      data-schedule-block
                                      className={cn(
                                        "absolute z-10 flex items-center overflow-hidden rounded px-1 text-[10px] font-medium leading-none text-white",
                                        canManage &&
                                          (sliceMode
                                            ? "cursor-crosshair"
                                            : "cursor-grab"),
                                        gridDragging && "pointer-events-none",
                                        isSelected &&
                                          "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]",
                                      )}
                                      style={{
                                        left: geo.left,
                                        width: geo.width,
                                        top: DAY_PAD_Y,
                                        height: DAY_H,
                                        background: projectDisplayColor(project, clientsById),
                                      }}
                                      onPointerDown={(e) => {
                                        if (e.button !== 0) return;
                                        e.stopPropagation();
                                        e.preventDefault();
                                        selectAssignment(occ.assignmentId, {
                                          start: occ.start_date,
                                          end: occ.end_date,
                                        });
                                        if (!canManage) return;
                                        if (
                                          isCoarse ||
                                          e.pointerType === "touch"
                                        ) {
                                          return;
                                        }
                                        const base = assignmentById(occ.assignmentId);
                                        if (!base) return;
                                        const rect = (
                                          e.currentTarget as HTMLElement
                                        ).getBoundingClientRect();
                                        const dayKey = dateKeyAtBlockX(
                                          e.clientX,
                                          rect.left,
                                          occ.start_date,
                                          occ.end_date,
                                        );
                                        if (
                                          sliceMode &&
                                          dayKey &&
                                          dayKey !== occ.end_date
                                        ) {
                                          sliceAssignmentAt(base.id, dayKey, {
                                            occurrenceStart: occ.start_date,
                                            occurrenceEnd: occ.end_date,
                                          });
                                          return;
                                        }
                                        if (isAssignmentScheduleLocked(base.id)) {
                                          setGanttMoveLockedNotice(true);
                                          return;
                                        }
                                        const grabDays = workingDaysBetween(
                                          occ.start_date,
                                          occ.end_date,
                                        );
                                        const grabDateKey =
                                          dayKey && grabDays.includes(dayKey)
                                            ? dayKey
                                            : occ.start_date;
                                        const weeklyInstance =
                                          (base.recurrence ?? "none") ===
                                          "weekly";
                                        dragSnapshot.current = {
                                          id: base.id,
                                          mode: "move",
                                          before: { ...base },
                                          dirty: false,
                                          grabDateKey,
                                          occurrenceStart: occ.start_date,
                                          occurrenceEnd: occ.end_date,
                                          weeklyInstance,
                                          previewStart: occ.start_date,
                                          previewEnd: occ.end_date,
                                          leaveTrimmed: false,
                                        };
                                        if (weeklyInstance) {
                                          setDragPreview({
                                            assignmentId: base.id,
                                            originStart: occ.start_date,
                                            originEnd: occ.end_date,
                                            previewStart: occ.start_date,
                                            previewEnd: occ.end_date,
                                          });
                                        }
                                        setGridDragging(true);
                                      }}
                                      title={`${project.name} · ${hoursLabel}${occ.recurrence === "weekly" ? " · Weekly" : ""}${showsTentativeHatch(occ.status, project.status) ? (project.status === "on_hold" ? ` · ${projectStatusLabel("on_hold")}` : " · Tentative") : ""}`}
                                    >
                                      {showsTentativeHatch(
                                        occ.status,
                                        project.status,
                                      ) ? (
                                        <span
                                          className="pointer-events-none absolute inset-0 z-0"
                                          style={TENTATIVE_HATCH_STYLE}
                                          aria-hidden
                                        />
                                      ) : null}
                                      <span className="relative z-[1] truncate">
                                        {spanDays.length > 1
                                          ? `${formatHours(occ.hours_per_day)}/d · ${formatHours(totalHours)}`
                                          : formatHours(occ.hours_per_day)}
                                        {occ.recurrence === "weekly"
                                          ? " ↻"
                                          : ""}
                                      </span>
                                      {notesHasContent(occ.notes) ? (
                                        <Tooltip
                                          content={assignmentNotesTooltipContent(
                                            occ.notes!,
                                            occ.assignmentId,
                                          )}
                                          className="relative z-[1] ml-0.5 inline-flex shrink-0"
                                        >
                                          <span
                                            className={cn(
                                              "inline-flex cursor-default",
                                              assignmentNoteIconClass(
                                                occ.notes,
                                                occ.assignmentId,
                                              ),
                                            )}
                                            aria-label="Notes"
                                            onMouseDown={(e) =>
                                              e.stopPropagation()
                                            }
                                          >
                                            <StickyNote
                                              size={13}
                                              strokeWidth={2.5}
                                              className={assignmentNoteStickyClass(
                                                occ.notes,
                                                occ.assignmentId,
                                              )}
                                            />
                                          </span>
                                        </Tooltip>
                                      ) : null}
                                      {canManage && (
                                        <>
                                          <span
                                            className="absolute left-0 top-0 z-20 h-full w-2 cursor-ew-resize"
                                            onPointerDown={(e) => {
                                              if (e.button !== 0) return;
                                              e.stopPropagation();
                                              e.preventDefault();
                                              if (
                                                isCoarse ||
                                                e.pointerType === "touch"
                                              ) {
                                                selectAssignment(
                                                  occ.assignmentId,
                                                  {
                                                    start: occ.start_date,
                                                    end: occ.end_date,
                                                  },
                                                );
                                                return;
                                              }
                                              const base =
                                                assignmentById(occ.assignmentId);
                                              if (!base) return;
                                              if (isAssignmentScheduleLocked(base.id)) {
                                                setGanttMoveLockedNotice(true);
                                                return;
                                              }
                                              selectAssignment(base.id, {
                                                start: occ.start_date,
                                                end: occ.end_date,
                                              });
                                              const weeklyInstance =
                                                (base.recurrence ?? "none") ===
                                                "weekly";
                                              dragSnapshot.current = {
                                                id: base.id,
                                                mode: "resize-start",
                                                before: { ...base },
                                                dirty: false,
                                                grabDateKey: occ.start_date,
                                                occurrenceStart: occ.start_date,
                                                occurrenceEnd: occ.end_date,
                                                weeklyInstance,
                                                previewStart: occ.start_date,
                                                previewEnd: occ.end_date,
                                                leaveTrimmed: false,
                                              };
                                              if (weeklyInstance) {
                                                setDragPreview({
                                                  assignmentId: base.id,
                                                  originStart: occ.start_date,
                                                  originEnd: occ.end_date,
                                                  previewStart: occ.start_date,
                                                  previewEnd: occ.end_date,
                                                });
                                              }
                                              setGridDragging(true);
                                            }}
                                          />
                                          <span
                                            className="absolute right-0 top-0 z-20 h-full w-2 cursor-ew-resize"
                                            onPointerDown={(e) => {
                                              if (e.button !== 0) return;
                                              e.stopPropagation();
                                              e.preventDefault();
                                              if (
                                                isCoarse ||
                                                e.pointerType === "touch"
                                              ) {
                                                selectAssignment(
                                                  occ.assignmentId,
                                                  {
                                                    start: occ.start_date,
                                                    end: occ.end_date,
                                                  },
                                                );
                                                return;
                                              }
                                              const base =
                                                assignmentById(occ.assignmentId);
                                              if (!base) return;
                                              if (isAssignmentScheduleLocked(base.id)) {
                                                setGanttMoveLockedNotice(true);
                                                return;
                                              }
                                              selectAssignment(base.id, {
                                                start: occ.start_date,
                                                end: occ.end_date,
                                              });
                                              const weeklyInstance =
                                                (base.recurrence ?? "none") ===
                                                "weekly";
                                              dragSnapshot.current = {
                                                id: base.id,
                                                mode: "resize-end",
                                                before: { ...base },
                                                dirty: false,
                                                grabDateKey: occ.end_date,
                                                occurrenceStart: occ.start_date,
                                                occurrenceEnd: occ.end_date,
                                                weeklyInstance,
                                                previewStart: occ.start_date,
                                                previewEnd: occ.end_date,
                                                leaveTrimmed: false,
                                              };
                                              if (weeklyInstance) {
                                                setDragPreview({
                                                  assignmentId: base.id,
                                                  originStart: occ.start_date,
                                                  originEnd: occ.end_date,
                                                  previewStart: occ.start_date,
                                                  previewEnd: occ.end_date,
                                                });
                                              }
                                              setGridDragging(true);
                                            }}
                                          />
                                        </>
                                      )}
                                    </div>
                                  );
                                })
                              : columns.flatMap((col, colIndex) => {
                                  const overlapping = rowOccs.filter((occ) =>
                                    columnsOverlapRange(
                                      col,
                                      occ.start_date,
                                      occ.end_date,
                                    ),
                                  );
                                  if (overlapping.length === 0) return [];

                                  const blockHours = overlapping.reduce(
                                    (sum, occ) =>
                                      sum +
                                      overlapWorkingDays(
                                        occ.start_date,
                                        occ.end_date,
                                        col,
                                      ).length *
                                        occ.hours_per_day,
                                    0,
                                  );
                                  if (blockHours <= 0) return [];

                                  // Prefer the longest overlapping occurrence for selection/drag.
                                  const primary = [...overlapping].sort(
                                    (a, b) =>
                                      overlapWorkingDays(
                                        b.start_date,
                                        b.end_date,
                                        col,
                                      ).length -
                                      overlapWorkingDays(
                                        a.start_date,
                                        a.end_date,
                                        col,
                                      ).length,
                                  )[0];
                                  const isSelected = overlapping.some(
                                    (o) =>
                                      o.assignmentId === selectedId &&
                                      (!selectedOccurrence ||
                                        (selectedOccurrence.start ===
                                          o.start_date &&
                                          selectedOccurrence.end ===
                                            o.end_date)),
                                  );
                                  const hoursLabel = formatHours(blockHours);
                                  const left =
                                    columnOffsetPx(columns, colIndex) + 2;
                                  const width = Math.max(col.width - 4, 8);
                                  const hasWeekly = overlapping.some(
                                    (o) => o.recurrence === "weekly",
                                  );
                                  const projectOnHold =
                                    project.status === "on_hold";
                                  const tentative =
                                    projectOnHold ||
                                    overlapping.every(
                                      (o) => o.status === "tentative",
                                    );
                                  const noteOccurrences = overlapping.filter(
                                    (o) => notesHasContent(o.notes),
                                  );
                                  const boundNoteOcc = overlapping.find(
                                    (o) =>
                                      isBoundTasksNotes(o.notes) ||
                                      isTasksRemovedNote(o.notes),
                                  );

                                  return [
                                    <div
                                      key={`${project.id}-${col.id}-agg`}
                                      data-schedule-block
                                      className={cn(
                                        "absolute z-10 flex items-center overflow-hidden rounded px-1 text-[10px] font-medium leading-none text-white",
                                        canManage &&
                                          (sliceMode
                                            ? "cursor-crosshair"
                                            : "cursor-pointer"),
                                        gridDragging && "pointer-events-none",
                                        isSelected &&
                                          "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]",
                                      )}
                                      style={{
                                        left,
                                        width,
                                        top: DAY_PAD_Y,
                                        height: DAY_H,
                                        background: projectDisplayColor(project, clientsById),
                                      }}
                                      onPointerDown={(e) => {
                                        if (e.button !== 0) return;
                                        e.stopPropagation();
                                        e.preventDefault();
                                        selectAssignment(primary.assignmentId, {
                                          start: primary.start_date,
                                          end: primary.end_date,
                                        });
                                        if (!canManage) return;
                                        // Drag/resize in week/month still edits the primary assignment.
                                        if (
                                          isCoarse ||
                                          e.pointerType === "touch"
                                        ) {
                                          return;
                                        }
                                        const base = state.assignments.find(
                                          (a) => a.id === primary.assignmentId,
                                        );
                                        if (!base) return;
                                        if (isAssignmentScheduleLocked(base.id)) {
                                          setGanttMoveLockedNotice(true);
                                          return;
                                        }
                                        const weeklyInstance =
                                          (base.recurrence ?? "none") ===
                                          "weekly";
                                        dragSnapshot.current = {
                                          id: base.id,
                                          mode: "move",
                                          before: { ...base },
                                          dirty: false,
                                          grabDateKey: primary.start_date,
                                          occurrenceStart: primary.start_date,
                                          occurrenceEnd: primary.end_date,
                                          weeklyInstance,
                                          previewStart: primary.start_date,
                                          previewEnd: primary.end_date,
                                          leaveTrimmed: false,
                                        };
                                        if (weeklyInstance) {
                                          setDragPreview({
                                            assignmentId: base.id,
                                            originStart: primary.start_date,
                                            originEnd: primary.end_date,
                                            previewStart: primary.start_date,
                                            previewEnd: primary.end_date,
                                          });
                                        }
                                        setGridDragging(true);
                                      }}
                                      title={`${project.name} · ${hoursLabel}${overlapping.length > 1 ? ` · ${overlapping.length} Blocks` : ""}${hasWeekly ? " · Weekly" : ""}${tentative ? (projectOnHold ? ` · ${projectStatusLabel("on_hold")}` : " · Tentative") : ""}`}
                                    >
                                      {tentative ? (
                                        <span
                                          className="pointer-events-none absolute inset-0 z-0"
                                          style={TENTATIVE_HATCH_STYLE}
                                          aria-hidden
                                        />
                                      ) : null}
                                      <span className="relative z-[1] truncate">
                                        {hoursLabel}
                                        {hasWeekly ? " ↻" : ""}
                                      </span>
                                      {noteOccurrences.length > 0 ? (
                                        <Tooltip
                                          content={
                                            <span className="flex flex-col gap-1.5">
                                              {noteOccurrences.map((o) => (
                                                <Fragment
                                                  key={o.assignmentId}
                                                >
                                                  {assignmentNotesTooltipContent(
                                                    o.notes!,
                                                    o.assignmentId,
                                                  )}
                                                </Fragment>
                                              ))}
                                            </span>
                                          }
                                          className="relative z-[1] ml-0.5 inline-flex shrink-0"
                                        >
                                          <span
                                            className={cn(
                                              "inline-flex cursor-default",
                                              boundNoteOcc
                                                ? assignmentNoteIconClass(
                                                    boundNoteOcc.notes,
                                                    boundNoteOcc.assignmentId,
                                                  )
                                                : "text-white/95",
                                            )}
                                            aria-label="Notes"
                                            onMouseDown={(e) =>
                                              e.stopPropagation()
                                            }
                                          >
                                            <StickyNote
                                              size={13}
                                              strokeWidth={2.5}
                                              className={
                                                boundNoteOcc
                                                  ? assignmentNoteStickyClass(
                                                      boundNoteOcc.notes,
                                                      boundNoteOcc.assignmentId,
                                                    )
                                                  : undefined
                                              }
                                            />
                                          </span>
                                        </Tooltip>
                                      ) : null}
                                    </div>,
                                  ];
                                }))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Full-height wash for Full Day / Statutory / Sick / Training (day view only) */}
                  {zoom === "day" ? (
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 z-[12]"
                      style={{ left: LABEL_PX, width: tw }}
                    >
                      {fullLeaveBlocks.map((block) =>
                        leaveBlockEditors(block, true),
                      )}
                    </div>
                  ) : null}
                  </div>
                    );
                  })()}
                  </>
                  )}
                </PersonScheduleSection>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {isNarrow && mobilePanelOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Close details"
          onClick={closeSidePanel}
        />
      ) : null}

      <aside
        className={cn(
          "flex flex-col border-[var(--border)] bg-[var(--bg)]",
          isNarrow
            ? cn(
                "fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] rounded-t-xl border-t shadow-2xl transition-transform duration-200",
                mobilePanelOpen ? "translate-y-0" : "translate-y-full pointer-events-none",
              )
            : cn(
                "absolute inset-y-0 right-0 z-30 w-80 border-l shadow-[-8px_0_24px_rgba(0,0,0,0.06)] transition-transform duration-200 ease-out",
                sidebarMinimized
                  ? "pointer-events-none translate-x-full"
                  : "translate-x-0",
              ),
        )}
        aria-hidden={!isNarrow && sidebarMinimized}
      >
        <div className="flex h-[57px] shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-4">
          <h2 className="text-sm font-semibold">
            {leaveEditForm
              ? "Time Off"
              : selected
                ? "Assignment"
                : canManage
                  ? "Budget"
                  : "Your Plan"}
          </h2>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            onClick={minimizeSidePanel}
            aria-label={isNarrow ? "Close sidebar" : "Minimize sidebar"}
            title={isNarrow ? "Close sidebar" : "Minimize sidebar"}
          >
            <PanelRightClose size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {canManage && leaveEditForm ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <Field label="Type">
              <Select
                value={leaveTypeFromLeave(
                  leaveEditForm.kind,
                  leaveEditForm.hours_per_day,
                )}
                onChange={(v) => {
                  const next = leaveFromTypeOption(
                    v as LeaveTypeOption,
                    leaveEditForm.hours_per_day,
                  );
                  setLeaveEditForm({
                    ...leaveEditForm,
                    kind: next.kind,
                    hours_per_day: next.hours_per_day,
                  });
                }}
                options={[
                  { value: "partial", label: "Partial Day" },
                  { value: "full", label: "Full Day" },
                  { value: "holiday", label: "Statutory holiday" },
                  { value: "sick", label: "Sick" },
                  { value: "training", label: "Training" },
                ]}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start">
                <DateInput
                  className={inputClass}
                  value={leaveEditForm.start_date}
                  onChange={(e) =>
                    setLeaveEditForm({
                      ...leaveEditForm,
                      start_date: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="End">
                <DateInput
                  className={inputClass}
                  value={leaveEditForm.end_date}
                  onChange={(e) =>
                    setLeaveEditForm({
                      ...leaveEditForm,
                      end_date: e.target.value,
                    })
                  }
                />
              </Field>
            </div>
            {leaveEditForm.hours_per_day != null &&
            leaveEditForm.kind === "vacation" ? (
              <Field label="Hours / day">
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  className={inputClass}
                  value={leaveEditForm.hours_per_day}
                  onChange={(e) =>
                    setLeaveEditForm({
                      ...leaveEditForm,
                      hours_per_day: Number(e.target.value) || 0,
                    })
                  }
                  onBlur={() =>
                    setLeaveEditForm({
                      ...leaveEditForm,
                      hours_per_day: Math.max(
                        0.01,
                        roundAssignmentHours(
                          leaveEditForm.hours_per_day ?? 4,
                        ),
                      ),
                    })
                  }
                />
              </Field>
            ) : null}
            <div className="block text-xs text-[var(--text-muted)]">
              Notes
              <SimpleRichTextEditor
                value={leaveEditForm.notes}
                onChange={(notes) =>
                  setLeaveEditForm({ ...leaveEditForm, notes })
                }
              />
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] text-sm font-medium text-[var(--accent-fg)]"
              onClick={saveLeaveEditForm}
            >
              <Save size={14} />
              Save time off
            </button>
            <button
              type="button"
              className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-[var(--status-over)]/40 text-sm text-[var(--status-over)]"
              onClick={() => {
                const restoreLeaves = state.leave_days
                  .filter((l) => leaveEditForm.dayIds.includes(l.id))
                  .map((l) => ({ ...l }));
                pushUndo({
                  kind: "leave",
                  restoreLeaves,
                  removeLeaveIds: [],
                  removeLeaveKeys: [],
                  restoreAssignments: [],
                  removeAssignmentIds: [],
                });
                for (const id of leaveEditForm.dayIds) {
                  deleteLeave(id);
                }
                selectLeaveBlock(null);
                push("Time off removed");
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        ) : canManage && editForm ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-stretch border-b border-[var(--border)]">
              <div className="flex items-center py-2 pl-3 pr-1">
                <ProjectColorBar color={sidebarColor} size="stretch" className="min-h-6" />
              </div>
              <div className="flex min-w-0 flex-1">
                <button
                  type="button"
                  className={cn(
                    "cursor-pointer border-b-2 px-3 py-2 text-xs font-medium",
                    sidebarPanelTab === "edit"
                      ? "border-[var(--accent)] text-[var(--text)]"
                      : "border-transparent text-[var(--text-muted)]",
                  )}
                  onClick={() => setSidebarPanelTab("edit")}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={cn(
                    "cursor-pointer border-b-2 px-3 py-2 text-xs font-medium",
                    sidebarPanelTab === "tasks"
                      ? "border-[var(--accent)] text-[var(--text)]"
                      : "border-transparent text-[var(--text-muted)]",
                  )}
                  onClick={() => setSidebarPanelTab("tasks")}
                >
                  Tasks
                </button>
                {showProductionHoursTab ? (
                  <button
                    type="button"
                    className={cn(
                      "cursor-pointer border-b-2 px-3 py-2 text-xs font-medium",
                      sidebarPanelTab === "hours"
                        ? "border-[var(--accent)] text-[var(--text)]"
                        : "border-transparent text-[var(--text-muted)]",
                    )}
                    onClick={() => setSidebarPanelTab("hours")}
                  >
                    Hours
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cn(
                    "cursor-pointer border-b-2 px-3 py-2 text-xs font-medium",
                    sidebarPanelTab === "assigner"
                      ? "border-[var(--accent)] text-[var(--text)]"
                      : "border-transparent text-[var(--text-muted)]",
                  )}
                  onClick={() => setSidebarPanelTab("assigner")}
                >
                  Assigner
                </button>
              </div>
            </div>
            <div className="border-b border-[var(--border)] px-4 py-2">
              <Link
                href={
                  projectsById.get(editForm.project_id)
                    ? projectHref(projectsById.get(editForm.project_id)!)
                    : appHref("/projects")
                }
                className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
              >
                Open Project Hub
              </Link>
            </div>
            {sidebarPanelTab === "tasks" ? (
              <div className="p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-xs font-semibold">Tasks</h3>
                  {canManage && !isPublicShare ? (
                    <>
                      <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs text-[var(--text-muted)]">
                        <Checkbox
                          size="sm"
                          checked={bindToAssignment}
                          onChange={(e) => {
                            const on = e.target.checked;
                            if (!on) {
                              void clearAssignmentBindUi();
                              return;
                            }
                            setBindToAssignment(true);
                            setBindEditingSelection(
                              boundTaskIdsForActive.length > 0,
                            );
                            setBindDraftIds(new Set(boundTaskIdsForActive));
                          }}
                        />
                        Bind to Assignment
                      </label>
                      {bindToAssignment &&
                      boundTaskIdsForActive.length > 0 &&
                      !bindEditingSelection ? (
                        <button
                          type="button"
                          className="inline-flex h-7 cursor-pointer items-center rounded-md border border-[var(--border)] px-2 text-xs hover:bg-[var(--row-hover)]"
                          onClick={() => {
                            setBindEditingSelection(true);
                            setBindDraftIds(new Set(boundTaskIdsForActive));
                          }}
                        >
                          Edit selection
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <ProjectTaskBoard
                  projectId={editForm.project_id}
                  readOnly
                  compact
                  hideHeader
                  allowSelect={false}
                  omitYearFromTaskDates
                  scheduleBindPersonId={editForm.person_id}
                  showBoundAssignmentIcon
                  boundAssignmentLinkEnabled={false}
                  onSyncBoundTaskDate={syncBoundTaskDateForTask}
                  showAssigneeAvatarInCompact
                  hideDescriptionIcon
                  assigneePersonId={
                    canManage ||
                    Boolean(
                      projectsById.get(editForm.project_id)?.sandbox_mode,
                    )
                      ? null
                      : (viewAs?.effectivePersonId ?? myPerson?.id ?? null)
                  }
                  bindSelectMode={
                    canManage &&
                    bindToAssignment &&
                    (bindEditingSelection ||
                      boundTaskIdsForActive.length === 0)
                  }
                  bindSelectedIds={bindDraftIds}
                  onBindToggleTask={(taskId) => {
                    const task = state.tasks.find((t) => t.id === taskId);
                    if (
                      task?.assignee_person_id &&
                      task.assignee_person_id !== editForm.person_id
                    ) {
                      return;
                    }
                    setBindDraftIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(taskId)) next.delete(taskId);
                      else next.add(taskId);
                      return next;
                    });
                  }}
                  priorityOnlyTaskIds={
                    bindToAssignment &&
                    boundTaskIdsForActive.length > 0 &&
                    !bindEditingSelection
                      ? boundTaskIdsForActive
                      : !canManage && boundTaskIdsForActive.length > 0
                        ? boundTaskIdsForActive
                        : null
                  }
                />
                {canManage &&
                bindToAssignment &&
                (bindEditingSelection ||
                  boundTaskIdsForActive.length === 0) ? (
                  <div className="mt-3 flex justify-end gap-2">
                    {bindEditingSelection ? (
                      <button
                        type="button"
                        className="inline-flex h-8 cursor-pointer items-center rounded-md border border-[var(--border)] px-3 text-xs hover:bg-[var(--row-hover)]"
                        onClick={() => {
                          setBindEditingSelection(false);
                          setBindDraftIds(new Set(boundTaskIdsForActive));
                        }}
                      >
                        Cancel
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-[var(--accent)] px-3 text-xs font-medium text-[var(--accent-fg)] hover:opacity-90"
                      onClick={beginBindSave}
                    >
                      <Save size={12} />
                      Save
                    </button>
                  </div>
                ) : null}
              </div>
            ) : sidebarPanelTab === "hours" && sidebarProject ? (
              <div className="p-4">
                <ProductionHoursPanel
                  project={sidebarProject}
                  assignments={assignmentsView}
                  people={state.people}
                  members={state.project_members.filter(
                    (m) => m.project_id === sidebarProject.id,
                  )}
                  expenses={state.project_contractor_expenses.filter(
                    (e) => e.project_id === sidebarProject.id,
                  )}
                  settings={state.organization_settings}
                  compact
                />
              </div>
            ) : sidebarPanelTab === "assigner" ? (
              <AssignmentAssignerDetails
                person={sidebarAssigner}
                pods={state.pods}
                podMembers={state.pod_members}
                createdAt={editForm.created_at}
                editedAt={editForm.edited_at}
              />
            ) : (
          <div className="space-y-3 p-4">
            <Field label="Project">
              <Select
                searchable
                value={editForm.project_id}
                onChange={(v) => patchEditForm({ project_id: v })}
                options={sortedProjects.map((p) => ({
                  value: p.id,
                  label: projectLabelWithClient(p, state.clients),
                }))}
              />
            </Field>
            <Field label="Status">
              {projectsById.get(editForm.project_id)?.status === "on_hold" ? (
                <div className="mt-1">
                  <ProjectStatusTag status="on_hold" />
                </div>
              ) : (
                <Select
                  value={editForm.status}
                  onChange={(v) =>
                    patchEditForm({
                      status: v as AssignmentStatus,
                    })
                  }
                  options={[
                    { value: "confirmed", label: "Confirmed" },
                    { value: "tentative", label: "Tentative" },
                  ]}
                />
              )}
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={(editForm.recurrence ?? "none") === "weekly"}
                onChange={(e) =>
                  patchEditForm({
                    recurrence: e.target.checked ? "weekly" : "none",
                    recurrence_end_date: e.target.checked
                      ? weeklySeriesEndDate(
                          {
                            ...editForm,
                            recurrence: "weekly",
                            recurrence_end_date:
                              editForm.recurrence_end_date,
                          },
                          projectsById.get(editForm.project_id)?.end_date,
                        )
                      : null,
                    recurrence_exceptions: e.target.checked
                      ? (editForm.recurrence_exceptions ?? [])
                      : [],
                  })
                }
              />
              <span>
                Recurring weekly
                <span className="block text-xs text-[var(--text-muted)]">
                  Same weekdays & hours every week until the series end date
                </span>
              </span>
            </label>
            {(editForm.recurrence ?? "none") === "weekly" && (
              <Field label="Series end date">
                <DateInput
                  className={inputClass}
                  value={editForm.recurrence_end_date ?? ""}
                  onChange={(e) =>
                    patchEditForm({
                      recurrence_end_date: weeklySeriesEndDate(
                        {
                          ...editForm,
                          recurrence: "weekly",
                          recurrence_end_date: e.target.value || null,
                        },
                        projectsById.get(editForm.project_id)?.end_date,
                      ),
                    })
                  }
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start">
                <DateInput
                  className={cn(
                    inputClass,
                    isAssignmentScheduleLocked(editForm.id) &&
                      "opacity-60 cursor-not-allowed",
                  )}
                  value={editForm.start_date}
                  disabled={isAssignmentScheduleLocked(editForm.id)}
                  onChange={(e) =>
                    patchEditForm({ start_date: e.target.value })
                  }
                />
              </Field>
              <Field label="End">
                <DateInput
                  className={cn(
                    inputClass,
                    isAssignmentScheduleLocked(editForm.id) &&
                      "opacity-60 cursor-not-allowed",
                  )}
                  value={editForm.end_date}
                  disabled={isAssignmentScheduleLocked(editForm.id)}
                  onChange={(e) => patchEditForm({ end_date: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Hours / day">
              <input
                ref={hoursInputRef}
                type="number"
                min={0.01}
                step={0.01}
                className={inputClass}
                value={editForm.hours_per_day}
                onChange={(e) =>
                  patchEditForm({
                    hours_per_day: Number(e.target.value) || 0,
                  })
                }
                onBlur={() =>
                  patchEditForm({
                    hours_per_day: Math.max(
                      0.01,
                      roundAssignmentHours(editForm.hours_per_day),
                    ),
                  })
                }
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (!canManage) return;
                  saveEditForm();
                }}
              />
            </Field>
            <div className="block text-xs text-[var(--text-muted)]">
              Notes
              <SimpleRichTextEditor
                value={editForm.notes}
                onChange={(notes) => patchEditForm({ notes })}
                placeholder="Add a note… Use @ to mention"
                mentionPeople={assignmentMentionPeople}
                readOnly={
                  boundTaskIdsForActive.length > 0 ||
                  (isPendingCreate && bindDraftIds.size > 0)
                }
              />
            </div>
            {(() => {
              const project = projectsById.get(editForm.project_id);
              if (!project) return null;
              const burn = budgetBurn(
                project,
                assignmentsView,
                state.people,
                false,
                new Date(),
                state.project_members.filter((m) => m.project_id === project.id),
                state.project_contractor_expenses.filter(
                  (e) => e.project_id === project.id,
                ),
                state.organization_settings,
              );
              const settings = state.organization_settings;
              const moneyCur = projectCurrency(
                project,
                settings.currency_enabled,
              );
              const showCurrencyChip =
                settings.currency_enabled &&
                (burn.mode === "amount" || burn.mode === "hours");
              return (
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <Link
                      href={projectHref(project)}
                      className="min-w-0 truncate font-medium hover:text-[var(--accent)] hover:underline"
                    >
                      {project.name}
                    </Link>
                    <span className="inline-flex shrink-0 items-center gap-1.5">
                      {showCurrencyChip ? (
                        <CurrencyChip currency={moneyCur} />
                      ) : null}
                      <span
                        className={cn(
                          budgetHealth(burn, settings) === "over" &&
                            "text-[var(--status-over)]",
                        )}
                      >
                        {burn.mode === "none"
                          ? "No budget"
                          : burn.mode === "amount"
                            ? `${formatMoney(Math.max(0, burn.remainingAmount ?? 0))} left`
                            : `${formatHours(Math.max(0, burn.remainingHours))} left`}
                      </span>
                    </span>
                  </div>
                  <BurnBar burn={burn} settings={settings} />
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-2">
              {isPendingCreate ? (
                <>
                  <button
                    type="button"
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] text-sm font-medium text-[var(--accent-fg)] hover:opacity-90"
                    onClick={saveEditForm}
                  >
                    <Save size={14} />
                    Save
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-[var(--border)] text-sm text-[var(--text-muted)] hover:bg-[var(--row-hover)]"
                    onClick={cancelPendingCreate}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!formDirty}
                    className={cn(
                      "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium",
                      formDirty
                        ? "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90"
                        : "cursor-not-allowed bg-[var(--bg-elevated)] text-[var(--text-muted)]",
                    )}
                    onClick={saveEditForm}
                  >
                    <Save size={14} />
                    {formDirty ? "Save changes" : "Saved"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-[var(--status-over)]/40 text-sm text-[var(--status-over)]"
                    onClick={deleteSelectedAssignment}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </>
              )}
            </div>
            {(() => {
              const name = assignmentEditorName(
                editForm.edited_by_profile_id,
                state.profiles,
                state.people,
              );
              if (!editForm.edited_at && !name) return null;
              return (
                <p className="text-xs text-[var(--text-muted)]">
                  {formatLastEditedBy(name, editForm.edited_at)}
                </p>
              );
            })()}
            </div>
            )}
            </div>
          </div>
        ) : selected ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-stretch border-b border-[var(--border)]">
              <div className="flex items-center py-2 pl-3 pr-1">
                <ProjectColorBar color={sidebarColor} size="stretch" className="min-h-6" />
              </div>
              <div className="flex min-w-0 flex-1">
                <button
                  type="button"
                  className={cn(
                    "cursor-pointer border-b-2 px-3 py-2 text-xs font-medium",
                    sidebarPanelTab === "edit"
                      ? "border-[var(--accent)] text-[var(--text)]"
                      : "border-transparent text-[var(--text-muted)]",
                  )}
                  onClick={() => setSidebarPanelTab("edit")}
                >
                  Details
                </button>
                <button
                  type="button"
                  className={cn(
                    "cursor-pointer border-b-2 px-3 py-2 text-xs font-medium",
                    sidebarPanelTab === "tasks"
                      ? "border-[var(--accent)] text-[var(--text)]"
                      : "border-transparent text-[var(--text-muted)]",
                  )}
                  onClick={() => setSidebarPanelTab("tasks")}
                >
                  Tasks
                </button>
                <button
                  type="button"
                  className={cn(
                    "cursor-pointer border-b-2 px-3 py-2 text-xs font-medium",
                    sidebarPanelTab === "assigner"
                      ? "border-[var(--accent)] text-[var(--text)]"
                      : "border-transparent text-[var(--text-muted)]",
                  )}
                  onClick={() => setSidebarPanelTab("assigner")}
                >
                  Assigner
                </button>
              </div>
            </div>
            <div className="border-b border-[var(--border)] px-4 py-2">
              <Link
                href={
                  projectsById.get(selected.project_id)
                    ? projectHref(projectsById.get(selected.project_id)!)
                    : appHref("/projects")
                }
                className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
              >
                Open Project Hub
              </Link>
            </div>
            {sidebarPanelTab === "tasks" ? (
              <div className="p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-xs font-semibold">Tasks</h3>
                </div>
                <ProjectTaskBoard
                  projectId={selected.project_id}
                  readOnly
                  compact
                  hideHeader
                  allowSelect={false}
                  omitYearFromTaskDates
                  assigneePersonId={
                    canManage ||
                    Boolean(
                      projectsById.get(selected.project_id)?.sandbox_mode,
                    )
                      ? null
                      : (viewAs?.effectivePersonId ?? myPerson?.id ?? null)
                  }
                  priorityOnlyTaskIds={
                    boundTaskIdsForActive.length > 0
                      ? boundTaskIdsForActive
                      : null
                  }
                />
              </div>
            ) : sidebarPanelTab === "assigner" ? (
              <AssignmentAssignerDetails
                person={sidebarAssigner}
                pods={state.pods}
                podMembers={state.pod_members}
                createdAt={selected.created_at}
                editedAt={selected.edited_at}
              />
            ) : (
          <ReadOnlyAssignmentDetails
            assignment={selected}
            project={projectsById.get(selected.project_id)}
            color={
              projectsById.get(selected.project_id)
                ? projectDisplayColor(
                    projectsById.get(selected.project_id)!,
                    clientsById,
                  )
                : "#64748B"
            }
            editorName={assignmentEditorName(
              selected.edited_by_profile_id,
              state.profiles,
              state.people,
            )}
          />
            )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm text-[var(--text-muted)]">
            {canManage ? (
              sidebarProjectBurns.map(({ project, client, burn }) => {
                  const settings = state.organization_settings;
                  const moneyCur = projectCurrency(
                    project,
                    settings.currency_enabled,
                  );
                  const showCurrencyChip =
                    settings.currency_enabled &&
                    (burn.mode === "amount" || burn.mode === "hours");
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setFilter("project", project.id)}
                      className="w-full rounded-md border border-[var(--border)] p-3 text-left hover:bg-[var(--row-hover)]"
                    >
                      <div className="mb-2 flex items-start gap-2 text-[var(--text)]">
                        <ProjectColorBar
                          color={projectDisplayColor(project, clientsById)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold leading-tight">
                            {client?.name ?? "No client"}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                            {project.name}
                          </div>
                        </div>
                        {showCurrencyChip ? (
                          <CurrencyChip currency={moneyCur} />
                        ) : null}
                      </div>
                      <BurnBar burn={burn} settings={settings} />
                    </button>
                  );
                })
            ) : (
              <MemberTodaySummary
                myPerson={myPerson}
                todayKey={todayKey}
                assignments={state.assignments}
                leaveDays={state.leave_days}
                projectsById={projectsById}
                clientsById={clientsById}
                capacityThresholds={capacityThresholdsFromSettings(
                  state.organization_settings,
                )}
                onSelectAssignment={selectAssignment}
              />
            )}
          </div>
        )}
        </div>
      </aside>

      {addProjectForPerson && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-xl sm:rounded-md">
            <h3 className="text-sm font-semibold">Add Project Row</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Choose a client, then a project to show under this person.
            </p>
            <label className="mt-3 block text-xs text-[var(--text-muted)]">
              Client
              <Select
                searchable
                className={inputClass}
                value={addProjectClientId}
                onChange={(v) => {
                  setAddProjectClientId(v);
                  setAddProjectId("");
                }}
                placeholder="Select a client…"
                options={[
                  { value: "", label: "Select a client…" },
                  ...addProjectClientOptions.withClient.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                ]}
              />
            </label>
            {addProjectClientOptions.addableCount === 0 ? (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Every active project is already on this person.
              </p>
            ) : null}
            {addProjectClientId ? (
              <label className="mt-3 block text-xs text-[var(--text-muted)]">
                Project
                <Select
                  searchable
                  className={inputClass}
                  value={addProjectId}
                  onChange={setAddProjectId}
                  placeholder={
                    addableProjectsForSelectedClient.length === 0
                      ? "No projects left for this client"
                      : "Select a project…"
                  }
                  options={[
                    {
                      value: "",
                      label:
                        addableProjectsForSelectedClient.length === 0
                          ? "No projects left for this client"
                          : "Select a project…",
                    },
                    ...addableProjectsForSelectedClient.map((p) => ({
                      value: p.id,
                      label: p.name,
                    })),
                  ]}
                />
              </label>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="h-9 flex-1 rounded-md border border-[var(--border)] text-sm"
                onClick={closeAddProjectModal}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!addProjectId}
                className={cn(
                  "h-9 flex-1 rounded-md text-sm font-medium",
                  addProjectId
                    ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                    : "cursor-not-allowed bg-[var(--bg-elevated)] text-[var(--text-muted)]",
                )}
                onClick={confirmAddProjectRow}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
      {recurrencePrompt ? (
        <Modal
          title="Update recurring assignment"
          onClose={() => {
            setRecurrencePrompt(null);
            setDragPreview(null);
          }}
        >
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            This is part of a weekly series. Apply your change to just this
            occurrence, or to this and all future occurrences? Past assignments
            stay as they are.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="h-9 cursor-pointer rounded-md bg-[var(--accent)] text-sm font-medium text-[var(--accent-fg)]"
              onClick={() => applyRecurrenceChoice("instance")}
            >
              Just This One
            </button>
            <button
              type="button"
              className="h-9 cursor-pointer rounded-md border border-[var(--border)] text-sm hover:bg-[var(--row-hover)]"
              onClick={() => applyRecurrenceChoice("future")}
            >
              This and All Future
            </button>
            <button
              type="button"
              className="h-9 cursor-pointer text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={() => {
                setRecurrencePrompt(null);
                setDragPreview(null);
              }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}
      {deletePrompt ? (
        <Modal
          title="Delete recurring assignment"
          onClose={() => setDeletePrompt(null)}
        >
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            Remove just this occurrence, or this and all future occurrences?
            Past assignments stay as they are.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="h-9 cursor-pointer rounded-md bg-[var(--accent)] text-sm font-medium text-[var(--accent-fg)]"
              onClick={() => applyDeleteChoice("occurrence")}
            >
              Just This One
            </button>
            <button
              type="button"
              className="h-9 cursor-pointer rounded-md border border-[var(--status-over)]/40 text-sm text-[var(--status-over)] hover:bg-[var(--row-hover)]"
              onClick={() => applyDeleteChoice("future")}
            >
              This and All Future
            </button>
            <button
              type="button"
              className="h-9 cursor-pointer text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
              onClick={() => setDeletePrompt(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}
      {bindConfirm ? (
        <ConfirmDialog
          title={
            bindConfirm.step === "dates"
              ? "Update Task Dates?"
              : bindConfirm.step === "overwrite"
                ? "Overwrite Existing Dates?"
                : "Gant List Tasks"
          }
          message={
            bindConfirm.step === "dates"
              ? "Selected tasks will use this assignment’s start and end dates."
              : bindConfirm.step === "overwrite"
                ? "One or more selected tasks already have a start or due date. Binding will overwrite the dates already assigned in the project."
                : "Some of the selected Tasks are on Gantt-enabled Lists. They can be bound as Assignment Tasks, but their dates must be changed in the project in Gantt view."
          }
          mode={bindConfirm.step === "gantt" ? "notice" : "confirm"}
          tone="accent"
          confirmLabel={bindConfirm.step === "gantt" ? "Got it" : "Continue"}
          onConfirm={() => advanceBindConfirm()}
          onCancel={() => setBindConfirm(null)}
        />
      ) : null}
      {ganttMoveLockedNotice ? (
        <ConfirmDialog
          title="Assignment Locked"
          message="This assignment is bound to Gantt-controlled tasks. Unbind the tasks or move them in the Gantt to change the Schedule time."
          mode="notice"
          tone="accent"
          confirmLabel="Got it"
          onConfirm={() => setGanttMoveLockedNotice(false)}
          onCancel={() => setGanttMoveLockedNotice(false)}
        />
      ) : null}
      {ganttScheduleMoveNotice ? (
        <ConfirmDialog
          title="Gantt Task Dates"
          message="Moving this assignment will not change the Start or End dates of the Tasks. Task dates may only be updated in the Gantt."
          mode="notice"
          tone="accent"
          confirmLabel="Got it"
          onConfirm={() => setGanttScheduleMoveNotice(false)}
          onCancel={() => setGanttScheduleMoveNotice(false)}
        />
      ) : null}
      {cutBoundConfirm ? (
        <ConfirmDialog
          title="Spread Bound Task Dates?"
          message="Cutting this assignment will keep the same bound tasks on both pieces. Task start and due dates will span across the resulting assignments."
          mode="confirm"
          tone="accent"
          confirmLabel="Cut Assignment"
          onConfirm={() => {
            const pending = cutBoundConfirm;
            setCutBoundConfirm(null);
            if (pending) {
              sliceAssignmentAt(pending.assignmentId, pending.cutDate, {
                confirmed: true,
                occurrenceStart: pending.occurrenceStart,
                occurrenceEnd: pending.occurrenceEnd,
              });
            }
          }}
          onCancel={() => setCutBoundConfirm(null)}
        />
      ) : null}
      {bindCollisionConfirm ? (
        <ConfirmDialog
          title="Assignment Already Booked!"
          message="An existing assignment blocks this tasks chosen dates. You can slice the existing assignment to insert this task at the requested dates (the blocking assignment continues before and after if applicable), use the next available slot, or cancel this request."
          mode="confirm"
          tone="accent"
          panelClassName="max-w-xl"
          actionsClassName="mt-4 flex flex-nowrap justify-end gap-2"
          confirmClassName="whitespace-nowrap min-h-9 h-auto py-2 leading-snug"
          altConfirmClassName="whitespace-nowrap min-h-9 h-auto py-2 leading-snug"
          confirmLabel={
            bindCollisionConfirm.allowSlice
              ? "Slice and Insert"
              : "Use Next Available"
          }
          altConfirmLabel={
            bindCollisionConfirm.allowSlice
              ? "Use Next Available"
              : undefined
          }
          onConfirm={() => {
            const pending = bindCollisionConfirm;
            setBindCollisionConfirm(null);
            if (!pending) return;
            if (pending.allowSlice) {
              applyProjectRowPunchForInsert(
                pending.personId,
                pending.projectId,
                pending.desiredStart,
                pending.desiredEnd,
                { trackBindInsertUndo: true },
              );
              finishProjectBindFlow(
                pending.taskId,
                pending.personId,
                pending.projectId,
                pending.desiredStart,
                pending.desiredEnd,
              );
              return;
            }
            const available = nextAvailableScheduleRange({
              personId: pending.personId,
              projectId: pending.projectId,
              start: pending.desiredStart,
              end: pending.desiredEnd,
              assignments: assignmentsRef.current,
              leaveDays: state.leave_days,
            });
            finishProjectBindFlow(
              pending.taskId,
              pending.personId,
              pending.projectId,
              available?.start ?? pending.desiredStart,
              available?.end ?? pending.desiredEnd,
            );
          }}
          onAltConfirm={
            bindCollisionConfirm.allowSlice
              ? () => {
                  const pending = bindCollisionConfirm;
                  setBindCollisionConfirm(null);
                  if (!pending) return;
                  const available = nextAvailableScheduleRange({
                    personId: pending.personId,
                    projectId: pending.projectId,
                    start: pending.desiredStart,
                    end: pending.desiredEnd,
                    assignments: assignmentsRef.current,
                    leaveDays: state.leave_days,
                  });
                  finishProjectBindFlow(
                    pending.taskId,
                    pending.personId,
                    pending.projectId,
                    available?.start ?? pending.desiredStart,
                    available?.end ?? pending.desiredEnd,
                  );
                }
              : undefined
          }
          onCancel={() => {
            setBindCollisionConfirm(null);
            deepLinkBindTaskRef.current = null;
            pendingProjectBindTaskIdRef.current = null;
          }}
        />
      ) : null}
    </div>
  );
}

function personSectionPropsEqual(
  prev: PersonScheduleSectionProps,
  next: PersonScheduleSectionProps,
): boolean {
  // Ignore `children` — parent always passes a new function. Body updates are
  // driven by the person-scoped props below so siblings don't re-render on expand.
  return (
    prev.person === next.person &&
    prev.collapsed === next.collapsed &&
    prev.bodyCollapsed === next.bodyCollapsed &&
    prev.personProjects === next.personProjects &&
    prev.utilBands === next.utilBands &&
    prev.personOccs === next.personOccs &&
    prev.leaveSignature === next.leaveSignature &&
    prev.labelPx === next.labelPx &&
    prev.zoom === next.zoom &&
    prev.canManage === next.canManage &&
    prev.tw === next.tw &&
    prev.startKey === next.startKey &&
    prev.endKey === next.endKey &&
    prev.columns === next.columns &&
    prev.personDraft === next.personDraft &&
    prev.personLeaveDraft === next.personLeaveDraft &&
    prev.personLeaveEditPreview?.start ===
      next.personLeaveEditPreview?.start &&
    prev.personLeaveEditPreview?.end === next.personLeaveEditPreview?.end &&
    prev.selectedAssignmentId === next.selectedAssignmentId &&
    prev.selectedOccurrence === next.selectedOccurrence &&
    prev.selectedLeaveBlockId === next.selectedLeaveBlockId &&
    prev.gridDragging === next.gridDragging &&
    prev.sliceMode === next.sliceMode &&
    prev.capacityGrain === next.capacityGrain
  );
}

type PersonDraft = {
  personId: string;
  projectId: string;
  start: string;
  end: string;
  originStart: string;
  originEnd: string;
};

type PersonLeaveDraft = {
  personId: string;
  start: string;
  end: string;
  originStart: string;
  originEnd: string;
};

type PersonLeaveEditPreview = {
  start: string;
  end: string;
};

type PersonScheduleSectionProps = {
  person: Person;
  collapsed: boolean;
  /** When true, skip mounting Time Off / project rows (may lag chevron via useDeferredValue). */
  bodyCollapsed: boolean;
  personProjects: Project[];
  utilBands: PersonUtilBand[];
  personOccs: AssignmentOccurrence[];
  /** Changes when this person's leave rows change — busts memo so blocks clear on undo. */
  leaveSignature: string;
  labelPx: number;
  zoom: ScheduleZoom;
  canManage: boolean;
  tw: number;
  startKey: string;
  endKey: string;
  columns: import("@/lib/domain/schedule-zoom").ScheduleColumn[];
  personDraft: PersonDraft | null;
  personLeaveDraft: PersonLeaveDraft | null;
  /** Live sidebar/drag dates for the selected leave block on this person. */
  personLeaveEditPreview: PersonLeaveEditPreview | null;
  selectedAssignmentId: string | null;
  selectedOccurrence: { start: string; end: string } | null;
  selectedLeaveBlockId: string | null;
  gridDragging: boolean;
  sliceMode: boolean;
  capacityGrain: "week" | "day";
  scrollRef: RefObject<HTMLDivElement | null>;
  onToggleCollapsed: (personId: string) => void;
  onAddProject: () => void;
  children: (blocksReady: boolean) => ReactNode;
};

const PersonScheduleSection = memo(function PersonScheduleSection({
  person,
  collapsed,
  bodyCollapsed,
  personProjects,
  utilBands,
  labelPx,
  zoom,
  capacityGrain,
  canManage,
  scrollRef,
  onToggleCollapsed,
  onAddProject,
  children,
}: PersonScheduleSectionProps) {
  return (
    <PersonReveal
      personId={person.id}
      rootRef={scrollRef}
      className="border-b-2 border-[var(--border)] [content-visibility:auto] [contain-intrinsic-size:auto_120px]"
    >
      {(blocksReady) => (
        <>
          <div className="flex items-stretch">
            <div
              className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 sm:px-3"
              style={{ width: labelPx }}
            >
              <button
                type="button"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)] disabled:opacity-30"
                aria-label={
                  collapsed
                    ? `Expand assignments for ${person.name}`
                    : `Collapse assignments for ${person.name}`
                }
                aria-expanded={!collapsed}
                onClick={() => onToggleCollapsed(person.id)}
              >
                {collapsed ? (
                  <ChevronRight size={14} strokeWidth={2} />
                ) : (
                  <ChevronDown size={14} strokeWidth={2} />
                )}
              </button>
              <PersonAvatar
                avatarUrl={person.avatar_url}
                avatarAttachmentId={person.avatar_attachment_id}
                name={person.name}
                size="row"
                fallback="initials"
                personId={person.id}
                color={personAvatarColor(person)}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium leading-tight">
                  {person.name}
                </div>
                <div className="truncate text-[10px] text-[var(--text-muted)]">
                  {person.role_title || "—"}
                  {collapsed && personProjects.length > 0
                    ? ` · ${personProjects.length} project${personProjects.length === 1 ? "" : "s"}`
                    : ""}
                </div>
              </div>
              {canManage && (
                <button
                  type="button"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                  aria-label={`Add Project row for ${person.name}`}
                  title="Add Project row"
                  onClick={onAddProject}
                >
                  <Plus size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>
            <div className="flex min-h-0 flex-1 items-center self-stretch">
              {utilBands.map((band) => (
                <div
                  key={band.id}
                  className={cn(
                    "flex items-center px-0.5 text-[10px] font-medium",
                    capacityGrain === "day" || zoom === "month"
                      ? "border-r border-[var(--schedule-day-border)]"
                      : "border-r-2 border-[var(--schedule-week-border)]",
                    band.level === "healthy" &&
                      "bg-[var(--status-healthy)]/25 text-[var(--status-healthy)]",
                    band.level === "near" &&
                      "bg-[var(--status-near)]/25 text-[var(--status-near)]",
                    band.level === "over" &&
                      "bg-[var(--status-over)]/30 text-[var(--status-over)]",
                    (band.level === "unavailable" || band.level === "low") &&
                      "bg-[var(--status-unavailable)]/20 text-[var(--text-muted)]",
                  )}
                  style={{
                    width: band.width,
                    height: "calc(100% - 8px)",
                  }}
                  title={
                    band.available <= 0
                      ? "Unavailable"
                      : `${Math.round(band.pct)}% · ${formatHours(band.booked)} booked / ${formatHours(band.available)} available`
                  }
                >
                  <span className="truncate">
                    {band.available <= 0
                      ? "—"
                      : capacityGrain === "day"
                        ? `${Math.round(band.pct)}%`
                        : `${Math.round(band.pct)}% | ${formatHours(band.booked)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {!bodyCollapsed ? children(blocksReady) : null}
        </>
      )}
    </PersonReveal>
  );
}, personSectionPropsEqual);

function PersonReveal({
  personId,
  rootRef,
  className,
  children,
}: {
  personId: string;
  rootRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: (blocksReady: boolean) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [blocksReady, setBlocksReady] = useState(false);
  const revealedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || revealedRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || revealedRef.current) return;
        revealedRef.current = true;
        startTransition(() => setBlocksReady(true));
        io.disconnect();
      },
      {
        root: rootRef.current,
        rootMargin: "200px 0px",
        threshold: 0,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [personId, rootRef]);

  return (
    <div ref={ref} className={className}>
      {children(blocksReady)}
    </div>
  );
}

function NavBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--row-hover)]"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs text-[var(--text-muted)]">
      {label}
      {children}
    </label>
  );
}

function MemberTodaySummary({
  myPerson,
  todayKey,
  assignments,
  leaveDays,
  projectsById,
  clientsById,
  capacityThresholds,
  onSelectAssignment,
}: {
  myPerson: Person | null;
  todayKey: string;
  assignments: Assignment[];
  leaveDays: LeaveDay[];
  projectsById: Map<string, Project>;
  clientsById: Map<string, Client>;
  capacityThresholds: ReturnType<typeof capacityThresholdsFromSettings>;
  onSelectAssignment: (id: string) => void;
}) {
  const summary = useMemo(() => {
    if (!myPerson) return null;
    const dayDate = parseISO(todayKey);
    const weekend = isWeekend(dayDate);
    const leave = isOnLeave(myPerson.id, todayKey, leaveDays);
    const assignmentsToday = expandAssignmentsInRange(
      assignments.filter((a) => a.person_id === myPerson.id),
      todayKey,
      todayKey,
      (projectId) => projectsById.get(projectId)?.end_date,
    )
      .filter((o) => occurrenceCoversDay(o, todayKey))
      .sort((a, b) => {
        const pa = projectsById.get(a.project_id);
        const pb = projectsById.get(b.project_id);
        if (!pa && !pb) return 0;
        if (!pa) return 1;
        if (!pb) return -1;
        const ca = clientNameOf(pa, clientsById);
        const cb = clientNameOf(pb, clientsById);
        const aBlank = !ca;
        const bBlank = !cb;
        if (aBlank !== bBlank) return aBlank ? 1 : -1;
        const byClient = ca.localeCompare(cb, undefined, {
          sensitivity: "base",
        });
        if (byClient !== 0) return byClient;
        return pa.name.localeCompare(pb.name, undefined, { sensitivity: "base" });
      });
    const bookedHours = personBookedHoursOnDay(
      myPerson.id,
      todayKey,
      assignments,
      leaveDays,
      true,
      (projectId) => projectsById.get(projectId)?.end_date,
    );
    const capacity = dailyCapacityHours(myPerson);
    return { dayDate, weekend, leave, assignmentsToday, bookedHours, capacity };
  }, [myPerson, todayKey, assignments, leaveDays, projectsById, clientsById]);

  if (!myPerson) {
    return (
      <p>
        Your account is not linked to a person record. Ask an admin to link your
        profile in Settings.
      </p>
    );
  }

  if (!summary) return null;

  const { dayDate, weekend, leave, assignmentsToday, bookedHours, capacity } =
    summary;
  const dateLabel = format(dayDate, "EEEE, MMM d");
  const fullDayOff = leave != null && isFullDayLeave(leave);
  const level = capacityLevel(
    bookedHours,
    capacity,
    fullDayOff,
    capacityThresholds,
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
          Today
        </p>
        <p className="mt-0.5 text-sm font-semibold text-[var(--text)]">
          {dateLabel}
        </p>
      </div>

      {weekend ? (
        <p>Weekend — no work scheduled.</p>
      ) : (
        <>
          {leave ? (
            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[var(--text)]">
              <div className="text-sm font-medium">
                {leaveBlockLabel(leave.kind, leave.hours_per_day)}
              </div>
              {leave.hours_per_day != null && !isFullDayLeave(leave) ? (
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {formatHours(leave.hours_per_day)} off
                </div>
              ) : null}
            </div>
          ) : null}

          {assignmentsToday.length > 0 ? (
            <ul className="space-y-2">
              {assignmentsToday.map((occ) => {
                const project = projectsById.get(occ.project_id);
                const client = project?.client_id
                  ? clientsById.get(project.client_id)
                  : undefined;
                const color = project
                  ? projectDisplayColor(project, clientsById)
                  : "#64748B";
                return (
                  <li key={`${occ.assignmentId}-${occ.weekOffset}`}>
                    <button
                      type="button"
                      onClick={() => onSelectAssignment(occ.assignmentId)}
                      className="w-full cursor-pointer rounded-md border border-[var(--border)] p-3 text-left hover:bg-[var(--row-hover)]"
                    >
                      <div className="flex items-start gap-2 text-[var(--text)]">
                        <ProjectColorBar color={color} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold leading-tight">
                            {client?.name ?? "No client"}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                            {project?.name ?? "Project"}
                          </div>
                          <div className="mt-1.5 text-xs capitalize text-[var(--text-muted)]">
                            {formatHours(occ.hours_per_day)} · {occ.status}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : !leave ? (
            <p>Nothing scheduled today.</p>
          ) : null}

          {fullDayOff ? (
            <p className="border-t border-[var(--border)] pt-3 text-xs">
              Full day off
            </p>
          ) : capacity > 0 ? (
            <p
              className={cn(
                "border-t border-[var(--border)] pt-3 text-xs",
                level === "over" && "text-[var(--status-over)]",
                level === "near" && "text-[var(--status-near)]",
                (level === "healthy" ||
                  level === "low" ||
                  level === "unavailable") &&
                  "text-[var(--text-muted)]",
              )}
            >
              {formatHours(bookedHours)} booked of {formatHours(capacity)}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function assignmentEditorName(
  profileId: string | null | undefined,
  profiles: { id: string; full_name: string }[],
  people: { name: string; profile_id: string | null }[],
): string | null {
  if (!profileId) return null;
  const author = profiles.find((p) => p.id === profileId);
  const authorPerson = people.find((p) => p.profile_id === profileId);
  return author?.full_name || authorPerson?.name || null;
}

function ReadOnlyAssignmentDetails({
  assignment,
  project,
  color,
  editorName,
}: {
  assignment: Assignment;
  project?: Project;
  color: string;
  editorName?: string | null;
}) {
  return (
    <div className="space-y-4 p-4 text-sm">
      <div>
        <div className="text-xs text-[var(--text-muted)]">Project</div>
        <div className="mt-0.5 flex items-center gap-2 font-medium text-[var(--text)]">
          {project ? (
            <>
              <ProjectColorBar color={color} />
              {project.name}
            </>
          ) : (
            "—"
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-[var(--text-muted)]">Status</div>
          <div className="mt-0.5 text-[var(--text)]">
            {project?.status === "on_hold" ? (
              <ProjectStatusTag status="on_hold" />
            ) : (
              <span className="capitalize">{assignment.status}</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">Hours / day</div>
          <div className="mt-0.5 text-[var(--text)]">
            {formatHours(assignment.hours_per_day)}
          </div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">Start</div>
          <div className="mt-0.5 text-[var(--text)]">{assignment.start_date}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">End</div>
          <div className="mt-0.5 text-[var(--text)]">{assignment.end_date}</div>
        </div>
      </div>
      {(assignment.recurrence ?? "none") === "weekly" && (
        <div className="text-xs text-[var(--text-muted)]">
          Recurring weekly
          {assignment.recurrence_end_date
            ? ` until ${assignment.recurrence_end_date}`
            : " (no end date)"}
        </div>
      )}
      <div>
        <div className="text-xs text-[var(--text-muted)]">Notes</div>
        {notesHasContent(assignment.notes) ? (
          <RichNotesHtml
            html={assignment.notes}
            className="mt-1.5 text-sm leading-relaxed text-[var(--text)]"
          />
        ) : (
          <p className="mt-1.5 text-[var(--text-muted)]">No notes</p>
        )}
      </div>
      {assignment.edited_at || editorName ? (
        <p className="text-xs text-[var(--text-muted)]">
          {formatLastEditedBy(editorName, assignment.edited_at)}
        </p>
      ) : null}
    </div>
  );
}

function formatLastEditedBy(
  name: string | null | undefined,
  editedAt: string | null | undefined,
): string {
  const who = name?.trim() || "—";
  if (!editedAt) return `Last Edited By: ${who}`;
  try {
    const then = parseISO(editedAt).getTime();
    if (Number.isNaN(then)) return `Last Edited By: ${who}`;
    const hours = Math.max(0, Math.floor((Date.now() - then) / 3_600_000));
    const ago =
      hours < 1
        ? "less than 1 hour ago"
        : hours === 1
          ? "1 hour ago"
          : `${hours} hours ago`;
    return `Last Edited By: ${who} · ${ago}`;
  } catch {
    return `Last Edited By: ${who}`;
  }
}

function formatAssignmentAuditDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    if (Number.isNaN(d.getTime())) return null;
    return format(d, "MMM d, yyyy");
  } catch {
    return null;
  }
}

function AssignmentAssignerDetails({
  person,
  pods,
  podMembers,
  createdAt,
  editedAt,
}: {
  person: Person | null;
  pods: Pod[];
  podMembers: PodMember[];
  createdAt?: string | null;
  editedAt?: string | null;
}) {
  if (!person) {
    return (
      <p className="p-4 text-sm text-[var(--text-muted)]">No assigner.</p>
    );
  }
  const personPods = podsForPerson(person.id, pods, podMembers);
  const assignedLabel = formatAssignmentAuditDate(createdAt);
  const modifiedLabel = formatAssignmentAuditDate(editedAt);
  const showModified =
    Boolean(modifiedLabel) &&
    (!createdAt ||
      !editedAt ||
      Math.abs(parseISO(editedAt).getTime() - parseISO(createdAt).getTime()) >
        60_000);

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <PersonAvatar
          avatarUrl={person.avatar_url}
          avatarAttachmentId={person.avatar_attachment_id}
          name={person.name}
          size="lg"
          fallback="initials"
          personId={person.id}
          color={personAvatarColor(person)}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">
            {person.name}
          </div>
          {person.role_title ? (
            <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
              {person.role_title}
            </div>
          ) : null}
          {person.office ? (
            <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
              {person.office}
            </div>
          ) : null}
          {personPods.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {personPods.map((pod) => (
                <span
                  key={pod.id}
                  className="max-w-full truncate rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]"
                  title={pod.name}
                >
                  {pod.name}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-2">
            <ProjectManagerTag />
          </div>
          {assignedLabel || showModified ? (
            <div className="mt-2 space-y-0.5 text-xs text-[var(--text-muted)]">
              {assignedLabel ? <div>Assigned: {assignedLabel}</div> : null}
              {showModified ? <div>Modified: {modifiedLabel}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Move an assignment by the desired working-day delta, skipping further in the
 * drag direction when the landing span would overlap another block on the row.
 */
function resolveMovePlacement(
  before: Assignment,
  desiredDelta: number,
  assignments: Assignment[],
  viewStart: string,
  viewEnd: string,
): { start: string; end: string } {
  const dir = desiredDelta === 0 ? 0 : desiredDelta > 0 ? 1 : -1;
  let delta = desiredDelta;
  for (let step = 0; step < 400; step++) {
    const start = shiftWorkingDays(before.start_date, delta);
    const end = shiftWorkingDays(before.end_date, delta);
    const candidate: Assignment = {
      ...before,
      start_date: start,
      end_date: end,
    };
    const checkStart = start < viewStart ? start : viewStart;
    const checkEnd = end > viewEnd ? end : viewEnd;
    // Pad so weekly series collisions just outside the viewport still count.
    const padStart = shiftWorkingDays(checkStart, -20);
    const padEnd = shiftWorkingDays(checkEnd, 60);
    if (
      !assignmentPlacementConflicts(
        candidate,
        assignments,
        padStart,
        padEnd,
      )
    ) {
      return { start, end };
    }
    if (dir === 0) {
      return { start: before.start_date, end: before.end_date };
    }
    delta += dir;
  }
  return { start: before.start_date, end: before.end_date };
}

/**
 * Move a single weekly occurrence visually without shifting the series
 * template. `assignments` should already treat the origin week as vacated
 * (exception) so other weeks of the same series still block overlaps.
 */
function resolveOccurrenceMovePlacement(
  series: Assignment,
  originStart: string,
  originEnd: string,
  desiredDelta: number,
  assignments: Assignment[],
  viewStart: string,
  viewEnd: string,
): { start: string; end: string } {
  const dir = desiredDelta === 0 ? 0 : desiredDelta > 0 ? 1 : -1;
  let delta = desiredDelta;
  for (let step = 0; step < 400; step++) {
    const start = shiftWorkingDays(originStart, delta);
    const end = shiftWorkingDays(originEnd, delta);
    const candidate: Assignment = {
      ...series,
      id: "__weekly_preview__",
      recurrence: "none",
      recurrence_end_date: null,
      recurrence_exceptions: [],
      start_date: start,
      end_date: end,
    };
    const checkStart = start < viewStart ? start : viewStart;
    const checkEnd = end > viewEnd ? end : viewEnd;
    const padStart = shiftWorkingDays(checkStart, -20);
    const padEnd = shiftWorkingDays(checkEnd, 60);
    if (
      !assignmentPlacementConflicts(
        candidate,
        assignments,
        padStart,
        padEnd,
      )
    ) {
      return { start, end };
    }
    if (dir === 0) {
      return { start: originStart, end: originEnd };
    }
    delta += dir;
  }
  return { start: originStart, end: originEnd };
}
