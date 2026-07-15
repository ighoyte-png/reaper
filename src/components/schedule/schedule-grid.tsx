"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { parseISO } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Save, StickyNote, Trash2 } from "lucide-react";
import { BurnBar } from "@/components/ui/burn-bar";
import { inputClass } from "@/components/ui/form";
import {
  RichNotesHtml,
  SimpleRichTextEditor,
} from "@/components/ui/simple-rich-text";
import { Tooltip } from "@/components/ui/tooltip";
import { notesHasContent } from "@/lib/notes-html";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import {
  budgetBurn,
  budgetHealth,
  formatHours,
  formatMoney,
} from "@/lib/domain/budget";
import {
  availableHoursInRange,
  capacityLevel,
  isOnLeave,
  personBookedHoursInRange,
  utilizationPct,
} from "@/lib/domain/capacity";
import {
  shiftMonth,
  shiftWeek,
  toDateKey,
  weekStart,
  workingDaysBetween,
} from "@/lib/domain/dates";
import { expandAssignmentsInRange } from "@/lib/domain/recurrence";
import {
  buildScheduleColumns,
  columnOffsetPx,
  columnsOverlapRange,
  overlapWorkingDays,
  spanColumnsPx,
  type ScheduleZoom,
} from "@/lib/domain/schedule-zoom";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import {
  projectLabelWithClient,
  sortProjectsByClientThenName,
} from "@/lib/domain/sorting";
import {
  isPtoLeave,
  isStatutoryLeave,
  leaveKindLabel,
} from "@/lib/domain/leave";
import type {
  Assignment,
  AssignmentStatus,
  LeaveKind,
  Project,
} from "@/lib/types";

const DAY_W_DESKTOP = 48;
const DAY_W_MOBILE = 40;
const DAY_H = 32;
const DAY_PAD_Y = 3;
const ROW_H = DAY_H + DAY_PAD_Y * 2;
const LABEL_DESKTOP = 196;
const LABEL_MOBILE = 112;

function weekZebra(weekIndex: number) {
  return weekIndex % 2 === 1 ? "bg-[var(--zebra)]" : undefined;
}

type UndoEntry =
  | { kind: "restore"; assignment: Assignment }
  | { kind: "remove"; id: string };

export function ScheduleGrid() {
  const {
    state,
    upsertAssignment,
    deleteAssignment,
    upsertLeave,
    deleteLeave,
    newId,
    canManage,
    myPerson,
    authError,
  } = useData();
  const { push } = useToast();
  const isNarrow = useMediaQuery("(max-width: 1023px)");
  const isCoarse = useMediaQuery("(pointer: coarse)");
  const DAY_W = isNarrow ? DAY_W_MOBILE : DAY_W_DESKTOP;
  const LABEL_PX = isNarrow ? LABEL_MOBILE : LABEL_DESKTOP;
  const [zoom, setZoom] = useState<ScheduleZoom>("day");
  const [anchor, setAnchor] = useState(() => weekStart(new Date()));
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Assignment | null>(null);
  const [hoverColId, setHoverColId] = useState<string | null>(null);
  const [gridDragging, setGridDragging] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [paintLeaveKind, setPaintLeaveKind] = useState<LeaveKind>("vacation");
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
    mode: "move" | "resize-end";
    before: Assignment;
    dirty: boolean;
  } | null>(null);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const applyingUndoRef = useRef(false);
  const performUndoRef = useRef(() => {});
  const closeSidePanelRef = useRef(() => {});
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

  const headerGroups = useMemo(() => {
    const groups: { label: string; width: number; groupIndex: number }[] = [];
    for (const col of columns) {
      const last = groups[groups.length - 1];
      if (last && last.label === col.groupLabel && last.groupIndex === col.groupIndex) {
        last.width += col.width;
      } else if (last && last.label === col.groupLabel && zoom === "month") {
        last.width += col.width;
      } else {
        groups.push({
          label: col.groupLabel,
          width: col.width,
          groupIndex: col.groupIndex,
        });
      }
    }
    // Merge adjacent same label (day mode weeks in same month)
    const merged: typeof groups = [];
    for (const g of groups) {
      const last = merged[merged.length - 1];
      if (last && last.label === g.label) last.width += g.width;
      else merged.push({ ...g });
    }
    return merged;
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
  }

  const [collapsedPeople, setCollapsedPeople] = useState<Set<string>>(
    () => new Set(),
  );
  const [revealedPeople, setRevealedPeople] = useState<Set<string>>(
    () => new Set(),
  );
  const revealPerson = useCallback((id: string) => {
    setRevealedPeople((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  function togglePersonCollapsed(personId: string) {
    setCollapsedPeople((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  const visiblePeople = useMemo(() => {
    if (canManage) return state.people;
    return myPerson ? [myPerson] : [];
  }, [canManage, state.people, myPerson]);

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

  const selectedBurn = selectedProject
    ? budgetBurn(selectedProject, state.assignments, state.people)
    : null;

  const selected = state.assignments.find((a) => a.id === selectedId) ?? null;

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

  const occurrences = useMemo(() => {
    const filtered = state.assignments.filter(
      (a) => projectFilter === "all" || a.project_id === projectFilter,
    );
    return expandAssignmentsInRange(filtered, startKey, endKey);
  }, [state.assignments, projectFilter, startKey, endKey]);

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
  }

  function performUndo() {
    if (!canManage) return;
    const entry = undoStackRef.current.pop();
    if (!entry) {
      push("Nothing to undo");
      return;
    }
    applyingUndoRef.current = true;
    if (entry.kind === "remove") {
      deleteAssignment(entry.id);
      setSelectedId((id) => (id === entry.id ? null : id));
      setEditForm((f) => (f?.id === entry.id ? null : f));
    } else {
      upsertAssignment(entry.assignment);
      setSelectedId(entry.assignment.id);
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

  function trackedDelete(id: string) {
    const prev = assignmentsRef.current.find((a) => a.id === id);
    if (prev) pushUndo({ kind: "restore", assignment: { ...prev } });
    deleteAssignment(id);
    assignmentsRef.current = assignmentsRef.current.filter((a) => a.id !== id);
  }

  function selectAssignment(id: string | null) {
    setSelectedId(id);
    if (isNarrow && id) setMobilePanelOpen(true);
  }

  /** Return to the default Budget / plan sidebar (clear assignment + project filter). */
  function closeSidePanel() {
    setSelectedId(null);
    setEditForm(null);
    setDraft(null);
    setLeaveDraft(null);
    setHoverColId(null);
    setProjectFilter("all");
    setMobilePanelOpen(false);
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
    const row: Assignment = {
      id: newId("asg"),
      organization_id: state.organization.id,
      person_id: personId,
      project_id: projectId,
      start_date: startDate,
      end_date: endDate,
      hours_per_day: 4,
      allocation_pct: 50,
      status: "confirmed",
      notes: "",
      recurrence: "none",
      recurrence_end_date: null,
    };
    trackedUpsert(
      row,
      row.recurrence === "weekly"
        ? "Weekly recurring assignment created"
        : "Assignment created",
    );
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
    commitAssignment(editForm, "Assignment saved");
  }

  function createLeaveRange(
    personId: string,
    start: string,
    end: string,
    kind: LeaveKind = paintLeaveKind,
  ) {
    if (!canManage) return;
    const startDate = start <= end ? start : end;
    const endDate = start <= end ? end : start;
    const days = workingDaysBetween(startDate, endDate);
    for (const date of days) {
      const existing = state.leave_days.find(
        (l) => l.person_id === personId && l.date === date,
      );
      upsertLeave({
        id: existing?.id ?? newId("leave"),
        person_id: personId,
        date,
        kind,
        status: "approved",
      });
    }
    if (days.length > 0) {
      push(
        days.length === 1
          ? `${leaveKindLabel(kind)} day added`
          : `${days.length} ${leaveKindLabel(kind)} days added`,
      );
    }
  }

  function finishPointer() {
    if (leaveDraft) {
      createLeaveRange(
        leaveDraft.personId,
        leaveDraft.start,
        leaveDraft.end,
      );
      setLeaveDraft(null);
      setHoverColId(null);
    }
    if (draft) {
      createAssignment(
        draft.personId,
        draft.projectId,
        draft.start,
        draft.end,
      );
      setDraft(null);
      setHoverColId(null);
    }
    if (dragSnapshot.current) {
      const snap = dragSnapshot.current;
      if (snap.dirty) {
        pushUndo({ kind: "restore", assignment: { ...snap.before } });
        push("Assignment saved");
        warnBudget(snap.before.project_id, assignmentsRef.current);
      }
      dragSnapshot.current = null;
    }
    setGridDragging(false);
  }

  function projectsForPerson(personId: string): Project[] {
    const fromOcc = new Set(
      occurrences
        .filter((o) => o.person_id === personId)
        .map((o) => o.project_id),
    );
    const active = sortProjectsByClientThenName(
      state.projects.filter((p) => p.status === "active"),
      state.clients,
    );

    if (projectFilter !== "all") {
      const filtered = projectsById.get(projectFilter);
      return filtered ? [filtered] : [];
    }

    if (canManage) {
      // Managers: every active project under each person (paint onto any row)
      return active;
    }

    // Members: only projects they appear on in the visible range
    return active.filter((p) => fromOcc.has(p.id));
  }

  const sortedProjects = useMemo(
    () => sortProjectsByClientThenName(state.projects, state.clients),
    [state.projects, state.clients],
  );

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col lg:flex-row"
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
            <select
              value={zoom}
              onChange={(e) => setZoom(e.target.value as ScheduleZoom)}
              className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm"
              aria-label="Schedule zoom"
            >
              <option value="day">By day</option>
              <option value="week">By week</option>
              <option value="month">By month</option>
            </select>
            {canManage && (
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="h-8 max-w-[220px] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm"
              >
                <option value="all">All projects</option>
                {sortedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {projectLabelWithClient(p, state.clients)}
                  </option>
                ))}
              </select>
            )}
            {canManage && (
              <select
                value={paintLeaveKind}
                onChange={(e) =>
                  setPaintLeaveKind(e.target.value as LeaveKind)
                }
                className="h-8 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm"
                aria-label="Time-off kind when painting"
                title="Kind for new time-off on the Time off row"
              >
                <option value="vacation">Paint PTO</option>
                <option value="holiday">Paint Statutory</option>
                <option value="sick">Paint Sick</option>
                <option value="training">Paint Training</option>
              </select>
            )}
            {isNarrow && (
              <button
                type="button"
                className="h-8 rounded-md border border-[var(--border)] px-3 text-sm"
                onClick={() => setMobilePanelOpen(true)}
              >
                {selected ? "Details" : canManage ? "Budgets" : "My plan"}
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
        >
          <div style={{ width: LABEL_PX + tw, minWidth: "100%" }}>
            {/* Group labels (month / year) */}
            <div className="sticky top-0 z-30 flex border-b border-[var(--border)] bg-[var(--bg)]">
              <div
                className="sticky left-0 z-40 shrink-0 border-r border-[var(--border)] bg-[var(--bg)]"
                style={{ width: LABEL_PX }}
              />
              <div className="flex min-w-0 flex-1">
                {headerGroups.map((g, i) => (
                  <div
                    key={`${g.label}-${i}`}
                    className={cn(
                      "flex items-center justify-center border-r border-[var(--border)] py-1 text-xs font-semibold text-[var(--text-muted)]",
                      weekZebra(i),
                    )}
                    style={{ width: g.width }}
                  >
                    {g.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Column labels */}
            <div className="sticky top-[29px] z-30 flex border-b border-[var(--border)] bg-[var(--bg)]">
              <div
                className="sticky left-0 z-40 flex shrink-0 items-center border-r border-[var(--border)] bg-[var(--bg)] px-3 text-xs text-[var(--text-muted)]"
                style={{ width: LABEL_PX }}
              >
                People
              </div>
              <div className="flex min-w-0 flex-1">
                {columns.map((col) => (
                  <div
                    key={col.id}
                    className={cn(
                      "flex items-center justify-center border-r border-[var(--border)] text-xs",
                      weekZebra(col.groupIndex),
                      col.isToday && "font-semibold text-[var(--accent)]",
                    )}
                    style={{
                      width: col.width,
                      height: DAY_H,
                      ...(col.isToday
                        ? { backgroundColor: "var(--today-col)" }
                        : null),
                    }}
                  >
                    {col.label}
                  </div>
                ))}
              </div>
            </div>

            {visiblePeople.map((person) => {
              const personProjects = projectsForPerson(person.id);
              const initials = person.name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();
              const blocksReady = revealedPeople.has(person.id);
              const collapsed = collapsedPeople.has(person.id);

              return (
                <PersonReveal
                  key={person.id}
                  personId={person.id}
                  rootRef={scrollRef}
                  onReveal={revealPerson}
                  className="border-b-2 border-[var(--border)]"
                >
                  {/* Util strip */}
                  <div className="flex items-stretch">
                    <div
                      className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 sm:px-3"
                      style={{ width: LABEL_PX }}
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
                        disabled={personProjects.length === 0}
                        onClick={() => togglePersonCollapsed(person.id)}
                      >
                        {collapsed ? (
                          <ChevronRight size={14} strokeWidth={2} />
                        ) : (
                          <ChevronDown size={14} strokeWidth={2} />
                        )}
                      </button>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[10px] font-semibold">
                        {initials}
                      </div>
                      <div className="min-w-0">
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
                    </div>
                    <div className="flex min-h-0 flex-1 items-center self-stretch">
                      {capacityBands.map((band) => {
                        const booked = personBookedHoursInRange(
                          person.id,
                          band.startKey,
                          band.endKey,
                          state.assignments,
                          state.leave_days,
                        );
                        const available = availableHoursInRange(
                          person,
                          band.startKey,
                          band.endKey,
                          state.leave_days,
                        );
                        const pct = utilizationPct(booked, available);
                        const level = capacityLevel(
                          booked,
                          available,
                          available <= 0,
                        );
                        return (
                          <div
                            key={band.id}
                            className={cn(
                              "flex items-center border-r border-[var(--border)] px-1 text-[10px] font-medium",
                              level === "over" &&
                                "bg-[var(--status-over)]/30 text-[var(--status-over)]",
                              level === "near" &&
                                "bg-[var(--status-near)]/25 text-[var(--status-near)]",
                              level === "healthy" &&
                                "bg-[var(--status-healthy)]/25 text-[var(--status-healthy)]",
                              level === "unavailable" &&
                                "bg-[var(--status-unavailable)]/20 text-[var(--text-muted)]",
                            )}
                            style={{
                              width: band.width,
                              height: "calc(100% - 8px)",
                            }}
                          >
                            <span className="truncate">
                              {available <= 0
                                ? "—"
                                : `${Math.round(pct)}% | ${formatHours(booked)}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time off row — first under each person; managers paint leave here */}
                  <div
                    className="flex shrink-0"
                    style={{ height: ROW_H }}
                  >
                    <div
                      className="sticky left-0 z-20 flex min-h-0 shrink-0 items-center justify-end gap-2 border-r border-[var(--border)] bg-[var(--bg)] px-3"
                      style={{ width: LABEL_PX, height: ROW_H }}
                    >
                      <span className="truncate text-[11px] font-medium leading-none text-[var(--text-muted)]">
                        Time off
                      </span>
                      <span className="h-3 w-0.5 shrink-0 rounded-full bg-[var(--status-unavailable)]" />
                    </div>
                    <div
                      className="relative min-h-0 shrink-0"
                      style={{ width: tw, height: ROW_H }}
                    >
                      <div className="absolute inset-0 flex">
                        {columns.map((col) => {
                          const leave =
                            zoom === "day"
                              ? isOnLeave(
                                  person.id,
                                  col.startKey,
                                  state.leave_days,
                                )
                              : undefined;
                          const leaveInBand =
                            leave ??
                            state.leave_days.find(
                              (l) =>
                                l.person_id === person.id &&
                                l.status === "approved" &&
                                l.date >= col.startKey &&
                                l.date <= col.endKey,
                            );
                          const inLeaveDraft =
                            !!leaveDraft &&
                            leaveDraft.personId === person.id &&
                            columnsOverlapRange(
                              col,
                              leaveDraft.start,
                              leaveDraft.end,
                            );
                          const isHover =
                            hoverColId === col.id &&
                            leaveDraft?.personId === person.id;
                          return (
                            <div
                              key={col.id}
                              className={cn(
                                "box-border shrink-0 border-r border-[var(--border)]/40 transition-colors",
                                weekZebra(col.groupIndex),
                                leaveInBand &&
                                  isStatutoryLeave(leaveInBand.kind) &&
                                  "bg-slate-500/25",
                                leaveInBand &&
                                  isPtoLeave(leaveInBand.kind) &&
                                  "bg-sky-500/25",
                                leaveInBand &&
                                  leaveInBand.kind === "sick" &&
                                  "bg-amber-500/20",
                                leaveInBand &&
                                  leaveInBand.kind === "training" &&
                                  "bg-violet-500/20",
                                (inLeaveDraft || isHover) &&
                                  "bg-[var(--accent)]/35",
                                canManage &&
                                  !leaveInBand &&
                                  "cursor-pointer hover:bg-[var(--accent)]/20",
                                canManage &&
                                  leaveInBand &&
                                  "cursor-pointer",
                              )}
                              style={{
                                width: col.width,
                                height: ROW_H,
                                paddingTop: DAY_PAD_Y,
                                paddingBottom: DAY_PAD_Y,
                                boxSizing: "border-box",
                                ...(col.isToday &&
                                !leaveInBand &&
                                !inLeaveDraft &&
                                !isHover
                                  ? { backgroundColor: "var(--today-col)" }
                                  : null),
                              }}
                              title={
                                leaveInBand
                                  ? `${leaveKindLabel(leaveInBand.kind)}${
                                      canManage ? " — click to remove" : ""
                                    }`
                                  : canManage
                                    ? `Paint ${leaveKindLabel(paintLeaveKind)}`
                                    : undefined
                              }
                              onPointerEnter={() => {
                                setHoverColId(col.id);
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
                              onPointerDown={(e) => {
                                if (!canManage) return;
                                if (leaveInBand) return;
                                if (isCoarse || e.pointerType === "touch") {
                                  return;
                                }
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
                              onClick={() => {
                                if (!canManage) return;
                                if (leaveInBand) {
                                  deleteLeave(leaveInBand.id);
                                  push("Time off removed");
                                  return;
                                }
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
                            >
                              {leaveInBand && zoom === "day" ? (
                                <div
                                  className={cn(
                                    "flex h-full items-center justify-center rounded px-0.5 text-[9px] font-semibold leading-none",
                                    isStatutoryLeave(leaveInBand.kind) &&
                                      "bg-slate-600 text-white",
                                    isPtoLeave(leaveInBand.kind) &&
                                      "bg-sky-600 text-white",
                                    leaveInBand.kind === "sick" &&
                                      "bg-amber-600 text-white",
                                    leaveInBand.kind === "training" &&
                                      "bg-violet-600 text-white",
                                  )}
                                >
                                  {leaveKindLabel(leaveInBand.kind)}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Project rows — blocks live here (no empty gap) */}
                  {!collapsed &&
                    personProjects.map((project) => {
                    const rowOccs = occurrences.filter(
                      (o) =>
                        o.person_id === person.id &&
                        o.project_id === project.id,
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
                              <div className="truncate text-[9px] leading-none text-[var(--text-muted)] opacity-50">
                                {clientName}
                              </div>
                            ) : null}
                            {canManage ? (
                              <Link
                                href={`/projects/${project.id}`}
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
                          <span
                            className="h-3 w-0.5 shrink-0 rounded-full"
                            style={{ background: project.color }}
                          />
                        </div>
                        <div
                          className="relative min-h-0 shrink-0"
                          style={{
                            width: tw,
                            height: ROW_H,
                          }}
                        >
                          {/* Column hit targets */}
                          <div className="absolute inset-0 flex">
                            {columns.map((col) => {
                              const leave =
                                zoom === "day"
                                  ? isOnLeave(
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
                              const inDraft =
                                !!draft &&
                                draft.personId === person.id &&
                                draft.projectId === project.id &&
                                columnsOverlapRange(
                                  col,
                                  draft.start,
                                  draft.end,
                                );
                              const isHover =
                                hoverColId === col.id &&
                                draft?.personId === person.id &&
                                draft?.projectId === project.id;
                              return (
                                <div
                                  key={col.id}
                                  className={cn(
                                    "box-border shrink-0 border-r border-[var(--border)]/40 transition-colors",
                                    weekZebra(col.groupIndex),
                                    leave && "bg-[var(--status-unavailable)]/20",
                                    (inDraft || isHover) &&
                                      "bg-[var(--accent)]/35",
                                    !leave &&
                                      canManage &&
                                      "cursor-pointer hover:bg-[var(--accent)]/20",
                                  )}
                                  style={{
                                    width: col.width,
                                    height: ROW_H,
                                    paddingTop: DAY_PAD_Y,
                                    paddingBottom: DAY_PAD_Y,
                                    boxSizing: "border-box",
                                    ...(col.isToday &&
                                    !leave &&
                                    !inDraft &&
                                    !isHover
                                      ? { backgroundColor: "var(--today-col)" }
                                      : null),
                                  }}
                                  onPointerEnter={() => {
                                    setHoverColId(col.id);
                                    if (
                                      draft &&
                                      draft.personId === person.id &&
                                      draft.projectId === project.id
                                    ) {
                                      setDraft({
                                        ...draft,
                                        start:
                                          col.startKey < draft.originStart
                                            ? col.startKey
                                            : draft.originStart,
                                        end:
                                          col.endKey > draft.originEnd
                                            ? col.endKey
                                            : draft.originEnd,
                                      });
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
                                    if (snap.mode === "resize-end") {
                                      const minEnd = snap.before.start_date;
                                      const end =
                                        col.endKey >= minEnd
                                          ? col.endKey
                                          : minEnd;
                                      if (end !== current.end_date) {
                                        snap.dirty = true;
                                        upsertAssignment({
                                          ...current,
                                          end_date: end,
                                        });
                                      }
                                    } else {
                                      const length =
                                        workingDaysBetween(
                                          snap.before.start_date,
                                          snap.before.end_date,
                                        ).length || 1;
                                      const start = col.startKey;
                                      const end = addWorkingDays(
                                        start,
                                        Math.max(0, length - 1),
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
                                  onPointerDown={(e) => {
                                    if (!canManage || leave) return;
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
                                      start: col.startKey,
                                      end: col.endKey,
                                      originStart: col.startKey,
                                      originEnd: col.endKey,
                                    });
                                  }}
                                  onClick={() => {
                                    if (!canManage || leave) return;
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
                              );
                            })}
                          </div>

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
                                  const isSelected =
                                    selectedId === occ.assignmentId;
                                  const hoursLabel = formatHours(
                                    occ.hours_per_day,
                                  );
                                  return (
                                    <div
                                      key={`${occ.assignmentId}-${occ.weekOffset}`}
                                      className={cn(
                                        "absolute z-10 flex items-center rounded px-1 text-[10px] font-medium leading-none text-white",
                                        canManage && "cursor-grab",
                                        gridDragging && "pointer-events-none",
                                        occ.status === "tentative" &&
                                          "border border-dashed border-white/60 opacity-80",
                                        isSelected &&
                                          "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]",
                                      )}
                                      style={{
                                        left: geo.left,
                                        width: geo.width,
                                        top: DAY_PAD_Y,
                                        height: DAY_H,
                                        background: project.color,
                                      }}
                                      onPointerDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        selectAssignment(occ.assignmentId);
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
                                        dragSnapshot.current = {
                                          id: base.id,
                                          mode: "move",
                                          before: { ...base },
                                          dirty: false,
                                        };
                                        setGridDragging(true);
                                      }}
                                      title={`${project.name} · ${hoursLabel}/d${occ.recurrence === "weekly" ? " · weekly" : ""}`}
                                    >
                                      <span className="truncate">
                                        {hoursLabel}
                                        {occ.recurrence === "weekly"
                                          ? " ↻"
                                          : ""}
                                      </span>
                                      {notesHasContent(occ.notes) ? (
                                        <Tooltip
                                          content={
                                            <RichNotesHtml html={occ.notes!} />
                                          }
                                          className="ml-0.5 shrink-0"
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
                                        <span
                                          className="absolute right-0 top-0 z-20 h-full w-2 cursor-ew-resize"
                                          onPointerDown={(e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            if (
                                              isCoarse ||
                                              e.pointerType === "touch"
                                            ) {
                                              selectAssignment(
                                                occ.assignmentId,
                                              );
                                              return;
                                            }
                                            const base =
                                              state.assignments.find(
                                                (a) =>
                                                  a.id === occ.assignmentId,
                                              );
                                            if (!base) return;
                                            selectAssignment(base.id);
                                            dragSnapshot.current = {
                                              id: base.id,
                                              mode: "resize-end",
                                              before: { ...base },
                                              dirty: false,
                                            };
                                            setGridDragging(true);
                                          }}
                                        />
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
                                    (o) => o.assignmentId === selectedId,
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
                                      className={cn(
                                        "absolute z-10 flex items-center rounded px-1 text-[10px] font-medium leading-none text-white",
                                        canManage && "cursor-pointer",
                                        gridDragging && "pointer-events-none",
                                        tentative &&
                                          "border border-dashed border-white/60 opacity-80",
                                        isSelected &&
                                          "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]",
                                      )}
                                      style={{
                                        left,
                                        width,
                                        top: DAY_PAD_Y,
                                        height: DAY_H,
                                        background: project.color,
                                      }}
                                      onPointerDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        selectAssignment(primary.assignmentId);
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
                                        dragSnapshot.current = {
                                          id: base.id,
                                          mode: "move",
                                          before: { ...base },
                                          dirty: false,
                                        };
                                        setGridDragging(true);
                                      }}
                                      title={`${project.name} · ${hoursLabel}${overlapping.length > 1 ? ` · ${overlapping.length} blocks` : ""}${hasWeekly ? " · weekly" : ""}`}
                                    >
                                      <span className="truncate">
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
                                          className="ml-0.5 shrink-0"
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

                  {!collapsed && personProjects.length === 0 && (
                    <div className="flex">
                      <div
                        className="sticky left-0 z-20 px-3 py-2 text-xs text-[var(--text-muted)]"
                        style={{ width: LABEL_PX }}
                      >
                        No projects in view
                      </div>
                    </div>
                  )}
                </PersonReveal>
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
          "overflow-y-auto border-[var(--border)] bg-[var(--bg)]",
          "lg:w-80 lg:shrink-0 lg:border-l",
          isNarrow
            ? cn(
                "fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] rounded-t-xl border-t shadow-2xl transition-transform duration-200",
                mobilePanelOpen ? "translate-y-0" : "translate-y-full pointer-events-none",
              )
            : "w-80 shrink-0 border-l",
        )}
      >
        <div className="border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">
                {selected ? "Assignment" : canManage ? "Budget" : "Your plan"}
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {canManage
                  ? isCoarse
                    ? "Tap an empty day to create. Tap a block to edit, then Save."
                    : "Weekdays only (Mon–Fri). Edit details here, then click Save."
                  : "Read-only view of your planned work."}
              </p>
            </div>
            {(selected || projectFilter !== "all" || (isNarrow && mobilePanelOpen)) && (
              <button
                type="button"
                className="shrink-0 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
                onClick={closeSidePanel}
              >
                {selected || projectFilter !== "all" ? "Deselect" : "Close"}
              </button>
            )}
          </div>
        </div>

        {canManage && editForm ? (
          <div className="space-y-3 p-4">
            <Field label="Project">
              <select
                className={inputClass}
                value={editForm.project_id}
                onChange={(e) =>
                  patchEditForm({ project_id: e.target.value })
                }
              >
                {sortedProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {projectLabelWithClient(p, state.clients)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                value={editForm.status}
                onChange={(e) =>
                  patchEditForm({
                    status: e.target.value as AssignmentStatus,
                  })
                }
              >
                <option value="confirmed">Confirmed</option>
                <option value="tentative">Tentative</option>
              </select>
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
                <input
                  type="date"
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
                <input
                  type="date"
                  className={inputClass}
                  value={editForm.start_date}
                  onChange={(e) =>
                    patchEditForm({ start_date: e.target.value })
                  }
                />
              </Field>
              <Field label="End">
                <input
                  type="date"
                  className={inputClass}
                  value={editForm.end_date}
                  onChange={(e) => patchEditForm({ end_date: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Hours / day">
              <input
                type="number"
                min={0.5}
                step={0.5}
                className={inputClass}
                value={editForm.hours_per_day}
                onChange={(e) =>
                  patchEditForm({
                    hours_per_day: Number(e.target.value) || 0,
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
                      href={`/projects/${project.id}`}
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
                onClick={() => {
                  trackedDelete(editForm.id);
                  selectAssignment(null);
                  setEditForm(null);
                  setMobilePanelOpen(false);
                  push("Assignment deleted");
                }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        ) : selected ? (
          <ReadOnlyAssignmentDetails
            assignment={selected}
            project={projectsById.get(selected.project_id)}
          />
        ) : (
          <div className="space-y-3 p-4 text-sm text-[var(--text-muted)]">
            <p>
              {canManage
                ? isCoarse
                  ? "Tap a column to create a block. Switch Day / Week / Month above; swipe to see more."
                  : "Drag on a project row to create. Use Day / Week / Month to change column size."
                : "Tap a block to see details and notes."}
            </p>
            {canManage &&
              sortedProjects
                .filter((p) => p.status === "active")
                .map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setProjectFilter(project.id)}
                    className="w-full rounded-md border border-[var(--border)] p-3 text-left hover:bg-[var(--row-hover)]"
                  >
                    <div className="mb-2 flex items-center gap-2 text-[var(--text)]">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: project.color }}
                      />
                      <span className="text-sm font-medium">{project.name}</span>
                    </div>
                    <BurnBar
                      burn={budgetBurn(
                        project,
                        state.assignments,
                        state.people,
                      )}
                    />
                  </button>
                ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function PersonReveal({
  personId,
  rootRef,
  onReveal,
  className,
  children,
}: {
  personId: string;
  rootRef: React.RefObject<HTMLDivElement | null>;
  onReveal: (id: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onReveal(personId);
      },
      {
        root: rootRef.current,
        rootMargin: "200px 0px",
        threshold: 0,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [personId, rootRef, onReveal]);

  return (
    <div ref={ref} className={className}>
      {children}
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

function ReadOnlyAssignmentDetails({
  assignment,
  project,
}: {
  assignment: Assignment;
  project?: Project;
}) {
  return (
    <div className="space-y-4 p-4 text-sm">
      <div>
        <div className="text-xs text-[var(--text-muted)]">Project</div>
        <div className="mt-0.5 flex items-center gap-2 font-medium text-[var(--text)]">
          {project ? (
            <>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: project.color }}
              />
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
