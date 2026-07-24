"use client";

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition, memo, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { format, isWeekend, parseISO, addWeeks, subWeeks } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, Copy, PanelRightClose, PanelRightOpen, Plus, Save, Scissors, StickyNote, Trash2, Undo2 } from "lucide-react";
import { BurnBar } from "@/components/ui/burn-bar";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { inputClass, Modal, DateInput } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { PersonAvatar } from "@/components/people/person-avatar";
import { ProjectManagerPerson } from "@/components/projects/project-manager-person";
import { ProjectTaskBoard } from "@/components/projects/project-task-board";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import {
  RichNotesHtml,
  SimpleRichTextEditor,
} from "@/components/ui/simple-rich-text";
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
  roundAssignmentHours,
} from "@/lib/domain/budget";
import {
  availableHoursInRange,
  buildBookedHoursByPersonDay,
  capacityLevel,
  dailyCapacityHours,
  isOnFullDayLeave,
  isOnLeave,
  personBookedHoursOnDay,
  personLeaveHoursInRange,
  sumBookedHoursFromDayMap,
  utilizationPct,
} from "@/lib/domain/capacity";
import {
  shiftMonth,
  shiftWeek,
  toDateKey,
  weekStart,
  workingDaysBetween,
} from "@/lib/domain/dates";
import {
  readUserViewPrefs,
  scheduleAnchorForOffset,
} from "@/lib/user-view-prefs";
import { expandAssignmentsInRange, occurrenceCoversDay, type AssignmentOccurrence } from "@/lib/domain/recurrence";
import {
  endWeeklySeriesBeforeOccurrence,
  splitWeeklySeriesForFuture,
  splitWeeklySeriesForInstance,
  withRecurrenceException,
} from "@/lib/domain/recurrence-split";
import {
  assignmentPlacementConflicts,
  clampResizeEnd,
  clampResizeStart,
  clipRangeToFreeDays,
  occupiedDaysForRow,
} from "@/lib/domain/assignment-occupancy";
import {
  buildScheduleColumns,
  columnOffsetPx,
  columnsOverlapRange,
  overlapWorkingDays,
  spanColumnsPx,
  type ScheduleZoom,
} from "@/lib/domain/schedule-zoom";
import { ScheduleRowHitLayer } from "@/components/schedule/schedule-row-hit-layer";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import {
  clientNameOf,
  projectDisplayColor,
  projectLabelWithClient,
  sortClientsByName,
  sortPeopleByName,
  sortProjectsByClientThenName,
} from "@/lib/domain/sorting";
import {
  projectManagerPerson,
  showProjectManagerUi,
} from "@/lib/domain/project-access";
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
  AssignmentStatus,
  Client,
  LeaveDay,
  LeaveKind,
  Person,
  Project,
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
  const DAY_W = isNarrow ? DAY_W_MOBILE : DAY_W_DESKTOP;
  const LABEL_PX = isNarrow ? LABEL_MOBILE : LABEL_DESKTOP;
  const { filters, setFilter, setFilters } = useUrlFilters({
    project: "all",
    person: "all",
    zoom: "day",
  });
  const zoom = (
    filters.zoom === "week" || filters.zoom === "month" || filters.zoom === "day"
      ? filters.zoom
      : "day"
  ) as ScheduleZoom;
  const projectFilter = filters.project;
  const personFilter = filters.person;
  const [anchor, setAnchor] = useState(() =>
    scheduleAnchorForOffset(readUserViewPrefs(null).scheduleViewOffset),
  );
  const scheduleOffsetAppliedRef = useRef(false);

  useEffect(() => {
    const patch: { project?: string; person?: string; zoom?: string } = {};
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
    if (Object.keys(patch).length) setFilters(patch);
  }, [
    projectFilter,
    personFilter,
    filters.zoom,
    state.projects,
    state.people,
    setFilters,
  ]);

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
  /** User's preferred minimized state (restored after temporary expand for editing). */
  const [sidebarPreferMinimized, setSidebarPreferMinimized] = useState(true);
  const [sidebarMinimized, setSidebarMinimized] = useState(true);
  const [sidebarPanelTab, setSidebarPanelTab] = useState<"edit" | "tasks">(
    "edit",
  );
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
    mode: "resize-end" | "resize-start";
    personId: string;
    kind: LeaveKind;
    hours_per_day: number | null;
    notes: string;
    previousDayIds: string[];
    originStart: string;
    originEnd: string;
    currentStart: string;
    currentEnd: string;
    dirty: boolean;
  } | null>(null);
  const [sliceMode, setSliceMode] = useState(false);
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
  assignmentsRef.current = state.assignments;
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayKey = toDateKey(new Date());

  const { columns, totalWidth: tw, rangeLabel } = useMemo(
    () =>
      buildScheduleColumns({
        zoom,
        anchor,
        todayKey,
        dayW: DAY_W,
        isNarrow,
      }),
    [zoom, anchor, todayKey, DAY_W, isNarrow],
  );
  const startKey = columns[0]?.startKey ?? todayKey;
  const endKey = columns[columns.length - 1]?.endKey ?? todayKey;

  useEffect(() => {
    if (!state.organization.id) return;
    const fetchStart = toDateKey(subWeeks(parseISO(startKey), 2));
    const fetchEnd = toDateKey(addWeeks(parseISO(endKey), 2));
    void ensureScheduleRange(fetchStart, fetchEnd);
  }, [startKey, endKey, ensureScheduleRange, state.organization.id]);

  useEffect(() => {
    if (projectFilter === "all") {
      setActiveRealtimeProjectIds([]);
      return;
    }
    void ensureProjectData(projectFilter);
    if (sidebarPanelTab === "tasks") {
      setActiveRealtimeProjectIds([projectFilter]);
    } else {
      setActiveRealtimeProjectIds([]);
    }
    return () => setActiveRealtimeProjectIds([]);
  }, [
    projectFilter,
    sidebarPanelTab,
    ensureProjectData,
    setActiveRealtimeProjectIds,
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
    if (zoom === "day") {
      const bands: {
        id: string;
        startKey: string;
        endKey: string;
        width: number;
        groupIndex: number;
      }[] = [];
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
        bands.push({ id: start, startKey: start, endKey: end, width, groupIndex: g });
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
  }, [columns, zoom]);

  function shiftAnchor(delta: number) {
    if (zoom === "month") setAnchor((a) => shiftMonth(a, delta));
    else if (zoom === "week") setAnchor((a) => shiftWeek(a, delta * 4));
    else setAnchor((a) => shiftWeek(a, delta));
  }

  function goToday() {
    setAnchor(weekStart(new Date()));
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
    const base = showAll ? state.people : myPerson ? [myPerson] : [];
    const filtered =
      showAll && personFilter !== "all"
        ? base.filter((p) => p.id === personFilter)
        : base;
    return sortPeopleByName(filtered);
  }, [
    viewAsPersonId,
    canManage,
    isPublicShare,
    state.people,
    myPerson,
    personFilter,
  ]);

  const peopleForFilter = useMemo(
    () => sortPeopleByName(state.people),
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

  const selectedBurn = useMemo(
    () =>
      selectedProject
        ? budgetBurn(selectedProject, state.assignments, state.people)
        : null,
    [selectedProject, state.assignments, state.people],
  );

  const selected = state.assignments.find((a) => a.id === selectedId) ?? null;

  const showManagers = showProjectManagerUi(state.projects);
  const sidebarProjectId =
    editForm?.project_id ?? selected?.project_id ?? null;
  const sidebarProject = sidebarProjectId
    ? (projectsById.get(sidebarProjectId) ?? null)
    : null;
  const sidebarManager =
    showManagers && sidebarProject
      ? projectManagerPerson(sidebarProject, state.people)
      : null;

  // Local form draft — only persisted on Save; grid move/resize updates dates
  useEffect(() => {
    if (!selectedId) {
      setEditForm(null);
      return;
    }
    const a = state.assignments.find((x) => x.id === selectedId);
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
  }, [selectedId, state.assignments]);

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
    : selected
      ? formDirty
        ? "Assignment · Unsaved"
        : "Assignment"
      : canManage
        ? "Budget"
        : isPublicShare
          ? "Plan"
          : "My Plan";

  const occurrences = useMemo(() => {
    const filtered = state.assignments.filter(
      (a) => projectFilter === "all" || a.project_id === projectFilter,
    );
    const expanded = expandAssignmentsInRange(filtered, startKey, endKey);
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
  }, [state.assignments, projectFilter, startKey, endKey, dragPreview]);

  const bookedHoursByPersonDay = useMemo(
    () => buildBookedHoursByPersonDay(occurrences, state.leave_days),
    [occurrences, state.leave_days],
  );

  const utilByPersonId = useMemo(() => {
    const map = new Map<string, PersonUtilBand[]>();
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
            level: capacityLevel(booked, available, available <= 0),
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
    trackedDelete(editForm.id);
    selectAssignment(null);
    setEditForm(null);
    setMobilePanelOpen(false);
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
      setMobilePanelOpen(false);
      return;
    }
    // This and all future: trim series so past weeks remain.
    if (pending.occurrence) {
      const trimmed = endWeeklySeriesBeforeOccurrence(
        pending.assignment,
        pending.occurrence.start,
      );
      if (trimmed) {
        commitAssignment(trimmed, "Future occurrences removed");
      } else {
        trackedDelete(pending.assignment.id);
        push("Assignment deleted");
      }
    } else {
      trackedDelete(pending.assignment.id);
      push("Assignment deleted");
    }
    selectAssignment(null);
    setEditForm(null);
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
    }
    if (id) {
      if (isNarrow) setMobilePanelOpen(true);
      else setSidebarMinimized(false);
    } else if (!isNarrow) {
      setSidebarMinimized(sidebarPreferMinimizedRef.current);
    }
  }

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
    }
    selectAssignment(split.instance.id, {
      start: split.instance.start_date,
      end: split.instance.end_date,
    });
  }

  /** Clear assignment/leave selection (keeps project filter & toolbar state). */
  function deselectScheduleItem() {
    setSelectedId(null);
    setEditForm(null);
    setSelectedLeaveBlockId(null);
    setLeaveEditForm(null);
    setDragPreview(null);
    if (isNarrow) setMobilePanelOpen(false);
    else setSidebarMinimized(sidebarPreferMinimizedRef.current);
  }

  /**
   * Click empty schedule chrome (not a block, not the sidebar) clears
   * selection. Blocks stopPropagation so a re-click stays selected.
   */
  function onScheduleBackgroundPointerDown(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    if (dragSnapshot.current || leaveDragSnapshot.current) return;
    if (draft || leaveDraft) return;
    if (!selectedId && !leaveEditForm && !selectedLeaveBlockId) return;
    const target = e.target as Element | null;
    if (target?.closest("[data-schedule-block]")) return;
    deselectScheduleItem();
  }

  function selectLeaveBlock(block: LeaveBlock | null) {
    if (!block) {
      setSelectedLeaveBlockId(null);
      setLeaveEditForm(null);
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
    if (isNarrow) setMobilePanelOpen(true);
    else setSidebarMinimized(false);
  }

  /** Hide the sidebar and clear the current assignment/leave selection. */
  function minimizeSidePanel() {
    setSelectedId(null);
    setEditForm(null);
    setSelectedLeaveBlockId(null);
    setLeaveEditForm(null);
    if (isNarrow) {
      setMobilePanelOpen(false);
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
    setSelectedId(null);
    setEditForm(null);
    setSelectedLeaveBlockId(null);
    setLeaveEditForm(null);
    setDraft(null);
    setLeaveDraft(null);
    setFilters({ project: "all", person: "all" });
    setMobilePanelOpen(false);
    setSidebarMinimized(sidebarPreferMinimizedRef.current);
    dragSnapshot.current = null;
  }
  closeSidePanelRef.current = closeSidePanel;

  function warnBudget(projectId: string, assignments: Assignment[]) {
    const project = projectsById.get(projectId);
    if (!project) return;
    const burn = budgetBurn(project, assignments, state.people);
    if (burn.overBy > 0) {
      push(`Over total budget by ${formatHours(burn.overBy)}`, "warning");
    }
  }

  function createAssignment(
    personId: string,
    projectId: string,
    start: string,
    end: string,
  ) {
    if (!canManage) return;
    const startDate = start <= end ? start : end;
    const endDate = start <= end ? end : start;
    const origin = startDate;
    const clipped = clipRangeToFreeDays(
      personId,
      projectId,
      origin,
      startDate,
      endDate,
      state.assignments,
    );
    if (!clipped) {
      push("That day is already booked", "warning");
      return;
    }
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
      notes: "",
      recurrence: "none",
      recurrence_end_date: null,
      recurrence_exceptions: [],
    };
    trackedUpsert(
      row,
      row.recurrence === "weekly"
        ? "Weekly recurring assignment created"
        : "Assignment created",
    );
    focusHoursAfterCreateRef.current = row.id;
    setSidebarPanelTab("edit");
    selectAssignment(row.id);
  }

  function commitAssignment(next: Assignment, toast?: string) {
    trackedUpsert(next, toast);
  }

  function patchEditForm(patch: Partial<Assignment>) {
    setEditForm((prev) => (prev ? { ...prev, ...patch } : prev));
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
    const before = state.assignments.find((a) => a.id === editForm.id);
    if (
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
    commitAssignment(next, "Assignment saved");
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
    if (isNarrow) setMobilePanelOpen(true);
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
    } else {
      start = colStart <= snap.originEnd ? colStart : snap.originEnd;
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
          });
          setGridDragging(false);
          return;
        }
        const after = state.assignments.find((a) => a.id === snap.id);
        if (
          after &&
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
          });
        } else {
          pushUndo({ kind: "restore", assignment: { ...snap.before } });
          push("Assignment saved");
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

  function sliceAssignmentAt(assignmentId: string, cutDate: string) {
    const base = state.assignments.find((a) => a.id === assignmentId);
    if (!base || base.start_date >= base.end_date) return;
    if (cutDate < base.start_date || cutDate >= base.end_date) return;
    const days = workingDaysBetween(base.start_date, base.end_date);
    if (!days.includes(cutDate)) return;
    const cutIndex = days.indexOf(cutDate);
    if (cutIndex < 0 || cutIndex >= days.length - 1) return;
    const leftEnd = cutDate;
    const rightStart = days[cutIndex + 1];
    const left: Assignment = { ...base, end_date: leftEnd };
    const right: Assignment = {
      ...base,
      id: newId("asg"),
      start_date: rightStart,
      notes: base.notes,
    };
    pushUndo({ kind: "restore", assignment: { ...base } });
    upsertAssignment(left);
    upsertAssignment(right);
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
    const dayWidth = DAY_W;
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

  /** Sidebar budget list — must not recompute on expand/collapse/scroll. */
  const sidebarProjectBurns = useMemo(() => {
    if (!canManage) return [];
    return sortedProjects
      .filter((p) => p.status === "active")
      .map((project) => ({
        project,
        client: project.client_id
          ? clientsById.get(project.client_id)
          : undefined,
        burn: budgetBurn(project, state.assignments, state.people),
      }));
  }, [
    canManage,
    sortedProjects,
    clientsById,
    state.assignments,
    state.people,
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
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2 sm:px-5 sm:py-3">
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
          <p className="text-sm font-medium">
            {rangeLabel}
          </p>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
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
            {(canManage || isPublicShare) && (
              <>
                <Select
                  value={projectFilter}
                  onChange={(v) => setFilter("project", v)}
                  searchable
                  className="mt-0 h-8 w-auto min-w-[13rem] max-w-[22rem] shrink-0"
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
                  className="mt-0 h-8 w-auto min-w-[10rem] max-w-[16rem] shrink-0"
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
            {isNarrow ? (
              <button
                type="button"
                className="h-8 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
                onClick={() => setMobilePanelOpen(true)}
              >
                {sidebarExpandLabel}
              </button>
            ) : (
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
            )}
          </div>
        </div>

        {canManage && selectedBurn && selectedProject && (
          <div className="border-b border-[var(--border)] px-3 py-2 sm:px-5">
            <BurnBar burn={selectedBurn} />
          </div>
        )}

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-auto overscroll-contain touch-pan-x touch-pan-y"
          onPointerDown={onScheduleBackgroundPointerDown}
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
                  className="sticky left-0 z-40 shrink-0 border-r border-[var(--border)] bg-[var(--bg)]"
                  style={{ width: LABEL_PX }}
                  aria-hidden
                />
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

            {visiblePeople.map((person) => {
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
                <PersonScheduleSection
                  key={person.id}
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
                  selectedAssignmentId={selectedAssignmentId}
                  selectedOccurrence={personSelectedOccurrence}
                  selectedLeaveBlockId={
                    leaveEditForm?.person_id === person.id
                      ? selectedLeaveBlockId
                      : null
                  }
                  gridDragging={gridDragging}
                  sliceMode={sliceMode}
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
                      return (
                        <div
                          key={block.id}
                          data-schedule-block
                          className={cn(
                            "pointer-events-auto absolute z-10 flex items-center rounded-sm border border-[var(--leave-block)]/50 px-1 text-[10px] font-medium leading-none",
                            "text-[var(--leave-block-fg)]",
                            canManage && "cursor-pointer",
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
                            selectLeaveBlock(block);
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
                                  selectLeaveBlock(block);
                                  leaveDragSnapshot.current = {
                                    mode: "resize-start",
                                    personId: block.person_id,
                                    // Keep saved type/hours — pending Full Day
                                    // only applies via Save time off.
                                    kind: block.kind,
                                    hours_per_day: block.hours_per_day,
                                    notes: preview?.notes ?? block.notes,
                                    previousDayIds:
                                      preview?.dayIds ?? block.dayIds,
                                    originStart: blockStart,
                                    originEnd: blockEnd,
                                    currentStart: blockStart,
                                    currentEnd: blockEnd,
                                    dirty: false,
                                  };
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
                                    selectLeaveBlock(block);
                                    return;
                                  }
                                  selectLeaveBlock(block);
                                  leaveDragSnapshot.current = {
                                    mode: "resize-end",
                                    personId: block.person_id,
                                    kind: block.kind,
                                    hours_per_day: block.hours_per_day,
                                    notes: preview?.notes ?? block.notes,
                                    previousDayIds:
                                      preview?.dayIds ?? block.dayIds,
                                    originStart: blockStart,
                                    originEnd: blockEnd,
                                    currentStart: blockStart,
                                    currentEnd: blockEnd,
                                    dirty: false,
                                  };
                                  setGridDragging(true);
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
                      {zoom === "day"
                        ? partialLeaveBlocks.map((block) =>
                            leaveBlockEditors(block, false),
                          )
                        : columns.flatMap((col, colIndex) => {
                            const leaveHours = personLeaveHoursInRange(
                              person,
                              col.startKey,
                              col.endKey,
                              state.leave_days,
                            );
                            if (leaveHours <= 0) return [];

                            const overlapping = leaveBlocks.filter((b) =>
                              columnsOverlapRange(
                                col,
                                b.start_date,
                                b.end_date,
                              ),
                            );
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
                            const isSelected =
                              !!primary &&
                              selectedLeaveBlockId === primary.id;
                            const hoursLabel = formatHours(leaveHours);
                            const left = columnOffsetPx(columns, colIndex) + 2;
                            const width = Math.max(col.width - 4, 8);
                            const noteHtmls = overlapping
                              .map((b) => b.notes)
                              .filter((n) => notesHasContent(n));

                            return [
                              <div
                                key={`leave-${person.id}-${col.id}`}
                                data-schedule-block
                                className={cn(
                                  "pointer-events-auto absolute z-10 flex items-center rounded-sm border border-[var(--leave-block)]/50 px-1 text-[10px] font-medium leading-none",
                                  "text-[var(--leave-block-fg)]",
                                  canManage && "cursor-pointer",
                                  isSelected &&
                                    "ring-2 ring-[var(--leave-block)] ring-offset-1 ring-offset-[var(--bg)]",
                                )}
                                style={{
                                  left,
                                  width,
                                  top: DAY_PAD_Y,
                                  height: DAY_H,
                                  backgroundColor: "var(--leave-block-wash)",
                                  backgroundImage:
                                    "repeating-linear-gradient(-45deg, transparent, transparent 4px, var(--leave-block-hatch) 4px, var(--leave-block-hatch) 8px)",
                                }}
                                title={
                                  overlapping.length > 1
                                    ? `Time off · ${hoursLabel} · ${overlapping.length} blocks`
                                    : `Time off · ${hoursLabel}`
                                }
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return;
                                  e.stopPropagation();
                                  e.preventDefault();
                                  if (primary) selectLeaveBlock(primary);
                                }}
                              >
                                <span className="truncate">{hoursLabel}</span>
                                {noteHtmls.length > 0 ? (
                                  <Tooltip
                                    content={
                                      <span className="flex flex-col gap-1.5">
                                        {noteHtmls.map((html, i) => (
                                          <RichNotesHtml
                                            key={i}
                                            html={html!}
                                          />
                                        ))}
                                      </span>
                                    }
                                    className="ml-0.5 inline-flex shrink-0"
                                  >
                                    <span
                                      className="inline-flex cursor-default opacity-90"
                                      aria-label="Notes"
                                      onMouseDown={(e) => e.stopPropagation()}
                                    >
                                      <StickyNote
                                        size={13}
                                        strokeWidth={2.5}
                                      />
                                    </span>
                                  </Tooltip>
                                ) : null}
                              </div>,
                            ];
                          })}
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
                              const current = state.assignments.find(
                                (a) => a.id === snap.id,
                              );
                              if (
                                !current ||
                                current.person_id !== person.id
                              ) {
                                return;
                              }
                              if (snap.weeklyInstance) {
                                const vacated = withRecurrenceException(
                                  snap.before,
                                  snap.occurrenceStart,
                                );
                                const checkAssignments =
                                  state.assignments.map((a) =>
                                    a.id === snap.id ? vacated : a,
                                  );
                                if (snap.mode === "resize-end") {
                                  const minEnd = snap.occurrenceStart;
                                  const desiredEnd =
                                    col.endKey >= minEnd
                                      ? col.endKey
                                      : minEnd;
                                  const end = clampResizeEnd(
                                    current.person_id,
                                    current.project_id,
                                    snap.occurrenceStart,
                                    desiredEnd,
                                    checkAssignments,
                                    "__weekly_preview__",
                                  );
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
                                  const start = clampResizeStart(
                                    current.person_id,
                                    current.project_id,
                                    desiredStart,
                                    snap.occurrenceEnd,
                                    checkAssignments,
                                    "__weekly_preview__",
                                  );
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
                                const end = clampResizeEnd(
                                  current.person_id,
                                  current.project_id,
                                  snap.before.start_date,
                                  desiredEnd,
                                  state.assignments,
                                  snap.id,
                                );
                                if (end !== current.end_date) {
                                  snap.dirty = true;
                                  upsertAssignment({
                                    ...current,
                                    end_date: end,
                                  });
                                }
                              } else if (snap.mode === "resize-start") {
                                const maxStart = snap.before.end_date;
                                const desiredStart =
                                  col.startKey <= maxStart
                                    ? col.startKey
                                    : maxStart;
                                const start = clampResizeStart(
                                  current.person_id,
                                  current.project_id,
                                  desiredStart,
                                  snap.before.end_date,
                                  state.assignments,
                                  snap.id,
                                );
                                if (start !== current.start_date) {
                                  snap.dirty = true;
                                  upsertAssignment({
                                    ...current,
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
                                  state.assignments,
                                  startKey,
                                  endKey,
                                );
                                if (
                                  start !== current.start_date ||
                                  end !== current.end_date
                                ) {
                                  snap.dirty = true;
                                  upsertAssignment({
                                    ...current,
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
                                      ? `${formatHours(occ.hours_per_day)} daily / ${formatHours(totalHours)} total`
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
                                        const base = state.assignments.find(
                                          (a) => a.id === occ.assignmentId,
                                        );
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
                                          sliceAssignmentAt(base.id, dayKey);
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
                                      title={`${project.name} · ${hoursLabel}${occ.recurrence === "weekly" ? " · weekly" : ""}${occ.status === "tentative" ? " · tentative" : ""}`}
                                    >
                                      {occ.status === "tentative" ? (
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
                                          content={
                                            <RichNotesHtml html={occ.notes!} />
                                          }
                                          className="relative z-[1] ml-0.5 inline-flex shrink-0"
                                        >
                                          <span
                                            className="inline-flex cursor-default text-white/95"
                                            aria-label="Notes"
                                            onMouseDown={(e) =>
                                              e.stopPropagation()
                                            }
                                          >
                                            <StickyNote
                                              size={13}
                                              strokeWidth={2.5}
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
                                                state.assignments.find(
                                                  (a) =>
                                                    a.id === occ.assignmentId,
                                                );
                                              if (!base) return;
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
                                                state.assignments.find(
                                                  (a) =>
                                                    a.id === occ.assignmentId,
                                                );
                                              if (!base) return;
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
                                  const tentative = overlapping.every(
                                    (o) => o.status === "tentative",
                                  );
                                  const noteHtmls = overlapping
                                    .map((o) => o.notes)
                                    .filter((n) => notesHasContent(n));

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
                                      title={`${project.name} · ${hoursLabel}${overlapping.length > 1 ? ` · ${overlapping.length} blocks` : ""}${hasWeekly ? " · weekly" : ""}${tentative ? " · tentative" : ""}`}
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
                                      {noteHtmls.length > 0 ? (
                                        <Tooltip
                                          content={
                                            <span className="flex flex-col gap-1.5">
                                              {noteHtmls.map((html, i) => (
                                                <RichNotesHtml
                                                  key={i}
                                                  html={html!}
                                                />
                                              ))}
                                            </span>
                                          }
                                          className="relative z-[1] ml-0.5 inline-flex shrink-0"
                                        >
                                          <span
                                            className="inline-flex cursor-default text-white/95"
                                            aria-label="Notes"
                                            onMouseDown={(e) =>
                                              e.stopPropagation()
                                            }
                                          >
                                            <StickyNote
                                              size={13}
                                              strokeWidth={2.5}
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

                  {personProjects.length === 0 && (
                    <div className="flex">
                      <div
                        className="sticky left-0 z-20 px-3 py-2 text-xs text-[var(--text-muted)]"
                        style={{ width: LABEL_PX }}
                      >
                        {canManage
                          ? "No projects — use + to add a row"
                          : "No projects in view"}
                      </div>
                    </div>
                  )}

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
            <div className="flex border-b border-[var(--border)] px-4">
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
                <ProjectTaskBoard
                  projectId={editForm.project_id}
                  readOnly
                  compact
                  allowSelect={false}
                />
              </div>
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
                      ? editForm.recurrence_end_date
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
                  Same weekdays & hours every week until the end date (or
                  indefinitely if none)
                </span>
              </span>
            </label>
            {(editForm.recurrence ?? "none") === "weekly" && (
              <Field label="Series end date (optional)">
                <DateInput
                  className={inputClass}
                  value={editForm.recurrence_end_date ?? ""}
                  onChange={(e) =>
                    patchEditForm({
                      recurrence_end_date: e.target.value || null,
                    })
                  }
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start">
                <DateInput
                  className={inputClass}
                  value={editForm.start_date}
                  onChange={(e) =>
                    patchEditForm({ start_date: e.target.value })
                  }
                />
              </Field>
              <Field label="End">
                <DateInput
                  className={inputClass}
                  value={editForm.end_date}
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
              />
            </Field>
            <div className="block text-xs text-[var(--text-muted)]">
              Notes
              <SimpleRichTextEditor
                value={editForm.notes}
                onChange={(notes) => patchEditForm({ notes })}
              />
            </div>
            {(() => {
              const project = projectsById.get(editForm.project_id);
              if (!project) return null;
              const burn = budgetBurn(project, state.assignments, state.people);
              return (
                <div>
                  <div className="mb-1 flex justify-between text-xs">
                    <Link
                      href={projectHref(project)}
                      className="font-medium hover:text-[var(--accent)] hover:underline"
                    >
                      {project.name}
                    </Link>
                    <span
                      className={cn(
                        budgetHealth(burn) === "over" &&
                          "text-[var(--status-over)]",
                      )}
                    >
                      {burn.mode === "none"
                        ? "No budget"
                        : burn.mode === "amount"
                          ? `${formatMoney(Math.max(0, burn.remainingAmount ?? 0))} left`
                          : `${formatHours(Math.max(0, burn.remainingHours))} left`}
                    </span>
                  </div>
                  <BurnBar burn={burn} />
                </div>
              );
            })()}
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
            {editForm.start_date < editForm.end_date && (
              <button
                type="button"
                className={cn(
                  "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border text-sm",
                  sliceMode
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--border)]",
                )}
                onClick={() => setSliceMode((v) => !v)}
              >
                <Scissors size={14} />
                {sliceMode
                  ? "Click a day on the block to slice…"
                  : "Slice multi-day block"}
              </button>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--border)] text-sm"
                onClick={() => {
                  const base = editForm;
                  const len =
                    workingDaysBetween(
                      base.start_date,
                      base.end_date,
                    ).length || 1;
                  const next: Assignment = {
                    ...base,
                    id: newId("asg"),
                    start_date: toDateKey(
                      addDaysSafe(base.start_date, len + 2),
                    ),
                    end_date: toDateKey(
                      addDaysSafe(base.end_date, len + 2),
                    ),
                  };
                  commitAssignment(next, "Duplicated");
                  selectAssignment(next.id);
                }}
              >
                <Copy size={14} /> Duplicate
              </button>
              <button
                type="button"
                className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--status-over)]/40 text-sm text-[var(--status-over)]"
                onClick={deleteSelectedAssignment}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
            </div>
            )}
            </div>
            {sidebarManager ? (
              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                <ProjectManagerPerson person={sidebarManager} showTag />
              </div>
            ) : null}
          </div>
        ) : selected ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex border-b border-[var(--border)] px-4">
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
                <ProjectTaskBoard
                  projectId={selected.project_id}
                  readOnly
                  compact
                  allowSelect={false}
                />
              </div>
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
          />
            )}
            </div>
            {sidebarManager ? (
              <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                <ProjectManagerPerson person={sidebarManager} showTag />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-sm text-[var(--text-muted)]">
            {canManage ? (
              sidebarProjectBurns.map(({ project, client, burn }) => {
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
                      </div>
                      <BurnBar burn={burn} />
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
    prev.selectedAssignmentId === next.selectedAssignmentId &&
    prev.selectedOccurrence === next.selectedOccurrence &&
    prev.selectedLeaveBlockId === next.selectedLeaveBlockId &&
    prev.gridDragging === next.gridDragging &&
    prev.sliceMode === next.sliceMode
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
  selectedAssignmentId: string | null;
  selectedOccurrence: { start: string; end: string } | null;
  selectedLeaveBlockId: string | null;
  gridDragging: boolean;
  sliceMode: boolean;
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
                name={person.name}
                size="row"
                fallback="initials"
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
                    "flex items-center px-1 text-[10px] font-medium",
                    zoom === "month"
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
                >
                  <span className="truncate">
                    {band.available <= 0
                      ? "—"
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
  onSelectAssignment,
}: {
  myPerson: Person | null;
  todayKey: string;
  assignments: Assignment[];
  leaveDays: LeaveDay[];
  projectsById: Map<string, Project>;
  clientsById: Map<string, Client>;
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
  const level = capacityLevel(bookedHours, capacity, fullDayOff);

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

function ReadOnlyAssignmentDetails({
  assignment,
  project,
  color,
}: {
  assignment: Assignment;
  project?: Project;
  color: string;
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
          <div className="mt-0.5 capitalize text-[var(--text)]">
            {assignment.status}
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
    </div>
  );
}

function addDaysSafe(dateKey: string, days: number): Date {
  const d = parseISO(dateKey);
  d.setDate(d.getDate() + days);
  return d;
}

/** Advance by N weekdays (skips Sat/Sun). */
function addWorkingDays(dateKey: string, workingDaysAhead: number): string {
  if (workingDaysAhead <= 0) return dateKey;
  let d = parseISO(dateKey);
  let left = workingDaysAhead;
  while (left > 0) {
    d = new Date(d);
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return toDateKey(d);
}

/** Go back by N weekdays (skips Sat/Sun). */
function subtractWorkingDays(dateKey: string, workingDaysBack: number): string {
  if (workingDaysBack <= 0) return dateKey;
  let d = parseISO(dateKey);
  let left = workingDaysBack;
  while (left > 0) {
    d = new Date(d);
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return toDateKey(d);
}

function shiftWorkingDays(dateKey: string, delta: number): string {
  if (delta === 0) return dateKey;
  if (delta > 0) return addWorkingDays(dateKey, delta);
  return subtractWorkingDays(dateKey, -delta);
}

/** Signed weekday distance from → to (0 if same day). */
function workingDayDelta(fromKey: string, toKey: string): number {
  if (fromKey === toKey) return 0;
  if (toKey > fromKey) {
    return workingDaysBetween(fromKey, toKey).length - 1;
  }
  return -(workingDaysBetween(toKey, fromKey).length - 1);
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
