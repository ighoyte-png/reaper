"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addWeeks, format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CalendarOff,
  CalendarRange,
  FolderKanban,
  Gauge,
  HeartPulse,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  Pencil,
  Pin,
  Plus,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { SchedulePie, type SchedulePieSlice } from "@/components/charts/schedule-pie";
import { LeaveMonthCalendar } from "@/components/dashboard/leave-month-calendar";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { ContractorTag } from "@/components/projects/project-manager-person";
import { UtilizationHeatmap } from "@/components/heatmap/utilization-heatmap";
import { BurnBar } from "@/components/ui/burn-bar";
import { Button, buttonClass } from "@/components/ui/button";
import { panelClass } from "@/components/ui/panel";
import { CapacityBar } from "@/components/ui/capacity-bar";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { RichNotesHtml } from "@/components/ui/simple-rich-text";
import { LinkifiedText } from "@/components/ui/linkified-text";
import {
  ConfirmDialog,
  Field,
  Modal,
  inputClass,
} from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { useProjectBurnsMap } from "@/lib/hooks/use-aggregates";
import {
  bulletinVisibleToPerson,
  isSystemBulletin,
  isUnreadBulletin,
} from "@/lib/domain/bulletins";
import { useViewAs } from "@/lib/view-as";
import {
  budgetBurn,
  budgetHealth,
  formatHours,
} from "@/lib/domain/budget";
import {
  capacityLevel,
  capacityLevelCssVar,
  capacityLevelTextClass,
  dailyCapacityHours,
  personBookedHoursInRange,
  availableHoursInRange,
  utilizationPct,
} from "@/lib/domain/capacity";
import { leaveBlockLabel } from "@/lib/domain/leave";
import { leaveBlocksInRange } from "@/lib/domain/leave-blocks";
import {
  endOfMonth,
  toDateKey,
  weekEnd,
  weekStart,
} from "@/lib/domain/dates";
import {
  defaultPeopleScopeForViewer,
  personIdsInPod,
  podsForPerson,
  sortPods,
} from "@/lib/domain/pods";
import { scheduleDisplayDayKey } from "@/lib/domain/project-manager-schedule";
import {
  expandAssignmentsInRange,
  occurrenceCoversDay,
} from "@/lib/domain/recurrence";
import { projectDisplayColor, sortPeopleByName } from "@/lib/domain/sorting";
import { isFullyHiddenFromPlanning } from "@/lib/domain/contractor";
import { utilizationVisiblePeople, personAvatarColor, resolveAuthorLabel } from "@/lib/domain/people";
import { taskUrgency, dueDateToneClass, type TaskUrgency } from "@/lib/domain/tasks";
import { cn } from "@/lib/cn";
import type {
  Bulletin,
  Client,
  LeaveDay,
  LeaveKind,
  Person,
  Pod,
  PodMember,
  Profile,
  Project,
  Task,
  TaskComment,
} from "@/lib/types";

const URGENCY_GROUPS: { key: TaskUrgency; label: string }[] = [
  { key: "today", label: "Due Today" },
  { key: "tomorrow", label: "Due Tomorrow" },
  { key: "three_days", label: "Due Soon" },
  { key: "week", label: "Due this week" },
];

export default function DashboardPage() {
  const {
    state,
    canManage,
    isPublicShare,
    myPerson,
    profile,
    upsertBulletin,
    deleteBulletin,
    dismissBulletin,
    dismissBulletinFromBoard,
    dismissMention,
    markMentionRead,
    newId,
    mode,
    ensureOrgTasks,
    ensureMentionComments,
    ensureScheduleRange,
  } = useData();
  const { burns } = useProjectBurnsMap();
  const { push } = useToast();
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const router = useRouter();
  const {
    viewAsPersonId,
    setViewAsPersonId,
    viewedPerson: viewAsPerson,
    showingAsManager,
    effectivePersonId,
    effectiveCanManage,
  } = useViewAs();
  const now = useMemo(() => new Date(), []);
  const todayKey = toDateKey(now);
  const start = toDateKey(weekStart(now));
  const end = toDateKey(weekEnd(now));
  const monthEndKey = toDateKey(endOfMonth(now));
  const utilRangeStart = toDateKey(weekStart(addWeeks(now, -5)));

  useEffect(() => {
    if (mode !== "supabase") return;
    const scheduleEnd = monthEndKey > end ? monthEndKey : end;
    void ensureScheduleRange(utilRangeStart, scheduleEnd);
    void ensureMentionComments();
  }, [
    mode,
    ensureScheduleRange,
    ensureMentionComments,
    utilRangeStart,
    monthEndKey,
    end,
  ]);

  /** Org-wide read layout (managers + public org share), unless View As. */
  const showOrgDashboard = (canManage || isPublicShare) && showingAsManager;
  /** Show team KPI strip only in true org-wide mode (not View As). */
  const showOrgKpis = showOrgDashboard;

  const showingAllTasks = showingAsManager;
  const viewedPersonId = effectivePersonId;

  /** Right-column identity: View As person, else linked person. */
  const identityPerson = viewAsPerson ?? myPerson;

  /** Task Pulse + Today's Schedule: always the signed-in (or View As) person. */
  const personalPersonId = viewAsPerson?.id ?? myPerson?.id ?? null;

  const myTasksHref = appHref(
    effectiveCanManage ? "/reports/tasks?mine=1" : "/reports/tasks",
  );

  useEffect(() => {
    if (mode !== "supabase") return;
    if (showingAsManager && (canManage || isPublicShare)) {
      void ensureOrgTasks();
    } else if (personalPersonId) {
      void ensureOrgTasks({ assigneePersonId: personalPersonId });
    }
  }, [
    mode,
    ensureOrgTasks,
    showingAsManager,
    canManage,
    isPublicShare,
    personalPersonId,
  ]);

  /** Members / View As: capacity + leave widgets scoped to one person. */
  const scopePersonalCapacity = !showingAsManager;
  const focusPerson = identityPerson;

  /** Viewer hide flags (linked person or View As target). */
  const viewerHideFromSchedule = Boolean(focusPerson?.hide_from_schedule);
  const viewerHideFromUtilization = Boolean(focusPerson?.hide_from_utilization);
  const viewerFullyHidden = focusPerson
    ? isFullyHiddenFromPlanning(focusPerson)
    : false;
  const showScheduleWidgets = !viewerHideFromSchedule;
  const showUtilizationWidgets = !viewerHideFromUtilization;

  /**
   * Org-wide people scope for the viewer: pod managers see only their pod(s),
   * other managers/admins see everyone. Public share always sees the whole
   * org (no pod-manager narrowing, since there's no signed-in manager).
   */
  const orgScopedPeople = useMemo(() => {
    if (isPublicShare) return sortPeopleByName(state.people);
    return defaultPeopleScopeForViewer(
      state.people,
      state.pods,
      state.pod_members,
      {
        role: profile?.role,
        myPersonId: myPerson?.id ?? null,
        orgWide: true,
      },
    );
  }, [
    isPublicShare,
    state.people,
    state.pods,
    state.pod_members,
    profile?.role,
    myPerson?.id,
  ]);

  /** Ids for the heatmap: null means "all people" (no pod restriction). */
  const orgScopedPersonIds = useMemo(() => {
    if (orgScopedPeople.length >= state.people.length) return null;
    return orgScopedPeople.map((p) => p.id);
  }, [orgScopedPeople, state.people.length]);

  const scheduleDay = useMemo(() => {
    if (!personalPersonId) {
      return { dayKey: todayKey, isToday: true };
    }
    return scheduleDisplayDayKey(
      todayKey,
      personalPersonId,
      state.leave_days,
    );
  }, [personalPersonId, todayKey, state.leave_days]);

  const scheduleDayAssignments = useMemo(() => {
    if (!personalPersonId) return [];
    const dayKey = scheduleDay.dayKey;
    return expandAssignmentsInRange(state.assignments, dayKey, dayKey)
      .filter((o) => occurrenceCoversDay(o, dayKey))
      .filter((o) => o.person_id === personalPersonId)
      .map((o) => ({
        id:
          o.weekOffset > 0
            ? `${o.assignmentId}:${o.weekOffset}`
            : o.assignmentId,
        person_id: o.person_id,
        project_id: o.project_id,
        hours_per_day: o.hours_per_day,
      }));
  }, [state.assignments, scheduleDay.dayKey, personalPersonId]);

  const viewerPods = useMemo(() => {
    if (!personalPersonId) return [];
    return podsForPerson(personalPersonId, state.pods, state.pod_members);
  }, [personalPersonId, state.pods, state.pod_members]);

  const isPodUtilization = viewerPods.length > 0;

  const utilizationPeople = useMemo(() => {
    if (!showOrgKpis) {
      return focusPerson
        ? [focusPerson]
        : myPerson
          ? [myPerson]
          : [];
    }
    const utilVisible = utilizationVisiblePeople(state.people);
    if (isPodUtilization) {
      const ids = new Set<string>();
      for (const pod of viewerPods) {
        for (const id of personIdsInPod(pod, state.pod_members)) {
          ids.add(id);
        }
      }
      return sortPeopleByName(utilVisible.filter((p) => ids.has(p.id)));
    }
    return sortPeopleByName(utilVisible);
  }, [
    showOrgKpis,
    focusPerson,
    myPerson,
    state.people,
    isPodUtilization,
    viewerPods,
    state.pod_members,
  ]);

  const utilizationHeatmapPersonIds = useMemo(() => {
    if (!showingAsManager) {
      return focusPerson ? [focusPerson.id] : [];
    }
    if (isPodUtilization) {
      return utilizationPeople.map((p) => p.id);
    }
    return null;
  }, [showingAsManager, focusPerson, isPodUtilization, utilizationPeople]);

  const projectById = useMemo(
    () => new Map(state.projects.map((p) => [p.id, p])),
    [state.projects],
  );

  const scopedTasks = useMemo(() => {
    if (showingAllTasks) return state.tasks;
    if (!viewedPersonId) return [];
    return state.tasks.filter((t) => t.assignee_person_id === viewedPersonId);
  }, [state.tasks, showingAllTasks, viewedPersonId]);

  /** Tasks for Task Pulse — personal even when the rest of the dash is org-wide. */
  const pulseTasks = useMemo(() => {
    // Public org view has no signed-in person; show all until View As is set.
    if (isPublicShare && showingAsManager) return state.tasks;
    if (!personalPersonId) return [];
    return state.tasks.filter((t) => t.assignee_person_id === personalPersonId);
  }, [state.tasks, isPublicShare, showingAsManager, personalPersonId]);

  const overdueTasks = useMemo(
    () =>
      scopedTasks
        .filter(
          (t) =>
            t.status !== "complete" && t.due_date && t.due_date < todayKey,
        )
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")),
    [scopedTasks, todayKey],
  );

  const pulseOverdueTasks = useMemo(
    () =>
      pulseTasks
        .filter(
          (t) =>
            t.status !== "complete" && t.due_date && t.due_date < todayKey,
        )
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")),
    [pulseTasks, todayKey],
  );

  const urgentByGroup = useMemo(() => {
    const map = new Map<TaskUrgency, Task[]>();
    for (const t of scopedTasks) {
      if (t.status === "complete" || !t.due_date || t.due_date < todayKey) {
        continue;
      }
      const urgency = taskUrgency(t.due_date, todayKey);
      if (urgency === "none" || urgency === "overdue") continue;
      const list = map.get(urgency) ?? [];
      list.push(t);
      map.set(urgency, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
    }
    return map;
  }, [scopedTasks, todayKey]);

  const pulseUrgentByGroup = useMemo(() => {
    const map = new Map<TaskUrgency, Task[]>();
    for (const t of pulseTasks) {
      if (t.status === "complete" || !t.due_date || t.due_date < todayKey) {
        continue;
      }
      const urgency = taskUrgency(t.due_date, todayKey);
      if (urgency === "none" || urgency === "overdue") continue;
      const list = map.get(urgency) ?? [];
      list.push(t);
      map.set(urgency, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
    }
    return map;
  }, [pulseTasks, todayKey]);

  const urgentTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of urgentByGroup.values()) {
      for (const t of list) ids.add(t.id);
    }
    return ids;
  }, [urgentByGroup]);

  const pulseUrgentTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of pulseUrgentByGroup.values()) {
      for (const t of list) ids.add(t.id);
    }
    return ids;
  }, [pulseUrgentByGroup]);

  const highPriorityTasks = useMemo(
    () =>
      scopedTasks.filter((t) => {
        if (t.status === "complete") return false;
        if (urgentTaskIds.has(t.id)) return false;
        if (overdueTasks.some((o) => o.id === t.id)) return false;
        const project = projectById.get(t.project_id);
        return Boolean(project && project.priority <= 2);
      }),
    [scopedTasks, urgentTaskIds, overdueTasks, projectById],
  );

  const pulseHighPriorityTasks = useMemo(
    () =>
      pulseTasks.filter((t) => {
        if (t.status === "complete") return false;
        if (pulseUrgentTaskIds.has(t.id)) return false;
        if (pulseOverdueTasks.some((o) => o.id === t.id)) return false;
        const project = projectById.get(t.project_id);
        return Boolean(project && project.priority <= 2);
      }),
    [pulseTasks, pulseUrgentTaskIds, pulseOverdueTasks, projectById],
  );

  const pinnedTotal =
    overdueTasks.length +
    [...urgentByGroup.values()].reduce((sum, l) => sum + l.length, 0) +
    highPriorityTasks.length;

  const pulsePinnedTotal =
    pulseOverdueTasks.length +
    [...pulseUrgentByGroup.values()].reduce((sum, l) => sum + l.length, 0) +
    pulseHighPriorityTasks.length;

  const bulletins = useMemo(() => {
    const audienceCtx = {
      pods: state.pods,
      podMembers: state.pod_members,
    };
    const dismissed = new Set(state.dismissed_bulletin_ids ?? []);
    const filtered = (
      showingAsManager
        ? state.bulletins
        : state.bulletins.filter((b) =>
            bulletinVisibleToPerson(b, personalPersonId, audienceCtx),
          )
    ).filter((b) => {
      // System notices: dismiss hides from board. Regular: dismiss only clears wash.
      if (!dismissed.has(b.id)) return true;
      return !isSystemBulletin(b);
    });
    return [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [
    state.bulletins,
    state.dismissed_bulletin_ids,
    state.pods,
    state.pod_members,
    showingAsManager,
    personalPersonId,
  ]);

  const dismissedBulletinIds = useMemo(
    () => new Set(state.dismissed_bulletin_ids ?? []),
    [state.dismissed_bulletin_ids],
  );

  const atRisk = useMemo(() => {
    if (!showOrgDashboard || !personalPersonId) return [];
    return state.projects
      .filter((p) => p.manager_person_id === personalPersonId)
      .map((p) => ({
        project: p,
        burn:
          burns.get(p.id) ?? budgetBurn(p, state.assignments, state.people),
        client: p.client_id
          ? state.clients.find((c) => c.id === p.client_id)
          : undefined,
      }))
      .filter(({ burn }) => {
        const health = budgetHealth(burn);
        return health === "over" || health === "near";
      })
      .sort((a, b) => b.burn.pct - a.burn.pct);
  }, [
    showOrgDashboard,
    personalPersonId,
    state.projects,
    state.clients,
    state.assignments,
    state.people,
    burns,
  ]);

  const peopleLoad = useMemo(() => {
    const source = scopePersonalCapacity
      ? focusPerson
        ? [focusPerson]
        : []
      : orgScopedPeople;
    return source
      .map((person) => {
        const booked = personBookedHoursInRange(
          person.id,
          start,
          end,
          state.assignments,
          state.leave_days,
        );
        const available = availableHoursInRange(
          person,
          start,
          end,
          state.leave_days,
        );
        return {
          person,
          booked,
          available,
          level: capacityLevel(booked, available, available <= 0),
        };
      })
      .sort(
        (a, b) =>
          b.booked / Math.max(b.available, 1) -
          a.booked / Math.max(a.available, 1),
      );
  }, [
    scopePersonalCapacity,
    focusPerson,
    orgScopedPeople,
    state.assignments,
    state.leave_days,
    start,
    end,
  ]);

  const leaveHorizonEnd = monthEndKey > end ? monthEndKey : end;
  const upcomingLeaveBlocks = useMemo(() => {
    const people = scopePersonalCapacity
      ? focusPerson
        ? [focusPerson]
        : []
      : orgScopedPeople;
    return people
      .flatMap((person) =>
        leaveBlocksInRange(
          state.leave_days,
          person.id,
          start,
          leaveHorizonEnd,
        ),
      )
      .filter((b) => b.end_date >= start)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 12);
  }, [
    scopePersonalCapacity,
    focusPerson,
    orgScopedPeople,
    state.leave_days,
    start,
    leaveHorizonEnd,
  ]);

  const approvedLeave = useMemo(() => {
    const approved = state.leave_days.filter((l) => l.status === "approved");
    if (!scopePersonalCapacity) {
      if (!orgScopedPersonIds) return approved;
      const ids = new Set(orgScopedPersonIds);
      return approved.filter((l) => ids.has(l.person_id));
    }
    if (!focusPerson) return [];
    return approved.filter((l) => l.person_id === focusPerson.id);
  }, [state.leave_days, scopePersonalCapacity, orgScopedPersonIds, focusPerson]);

  const leaveCalendarPeople = useMemo(
    () =>
      scopePersonalCapacity
        ? focusPerson
          ? [focusPerson]
          : []
        : orgScopedPeople,
    [scopePersonalCapacity, focusPerson, orgScopedPeople],
  );

  const sortedPeople = sortPeopleByName(state.people);

  const activeProjects = useMemo(() => {
    if (!personalPersonId) return [];
    return state.projects.filter(
      (p) =>
        p.status === "active" && p.manager_person_id === personalPersonId,
    );
  }, [state.projects, personalPersonId]);

  const projectHealthStats = useMemo(() => {
    let healthy = 0;
    let near = 0;
    let over = 0;
    let none = 0;
    for (const p of activeProjects) {
      const health = budgetHealth(
        burns.get(p.id) ?? budgetBurn(p, state.assignments, state.people),
      );
      if (health === "healthy") healthy += 1;
      else if (health === "near") near += 1;
      else if (health === "over") over += 1;
      else none += 1;
    }
    const scored = healthy + near + over;
    const onTrackPct =
      scored <= 0 ? 100 : Math.round((healthy / scored) * 100);
    return { healthy, near, over, none, onTrackPct, total: activeProjects.length };
  }, [activeProjects, state.assignments, state.people, burns]);

  /** Members (and managers) who are PM on ≥1 active project see this KPI. */
  const showPmHealthKpi = projectHealthStats.total > 0;

  const teamUtilization = useMemo(() => {
    const people = utilizationPeople;
    if (people.length === 0) {
      return { avg: 0, thisWeekBooked: 0, thisWeekAvailable: 0 };
    }

    let sum = 0;
    let n = 0;
    let thisWeekBooked = 0;
    let thisWeekAvailable = 0;
    for (const person of people) {
      const booked = personBookedHoursInRange(
        person.id,
        start,
        end,
        state.assignments,
        state.leave_days,
      );
      const available = availableHoursInRange(
        person,
        start,
        end,
        state.leave_days,
      );
      thisWeekBooked += booked;
      thisWeekAvailable += available;
      if (available <= 0) continue;
      sum += utilizationPct(booked, available);
      n += 1;
    }

    return {
      avg: n > 0 ? sum / n : 0,
      thisWeekBooked,
      thisWeekAvailable,
    };
  }, [
    utilizationPeople,
    state.assignments,
    state.leave_days,
    start,
    end,
  ]);

  const teamUtilizationPieSlices = useMemo((): SchedulePieSlice[] => {
    const booked = teamUtilization.thisWeekBooked;
    const available = teamUtilization.thisWeekAvailable;
    const free = Math.max(0, available - booked);
    const level = capacityLevel(booked, available, available <= 0);
    const bookedColor = capacityLevelCssVar(level);
    const slices: SchedulePieSlice[] = [];
    if (booked > 0.01) {
      slices.push({
        projectId: "__booked__",
        hours: booked,
        color: bookedColor,
        label: "Booked",
      });
    }
    if (free > 0.01) {
      slices.push({
        projectId: "__free__",
        hours: free,
        color: "var(--status-unavailable)",
        label: "Available",
      });
    }
    return slices;
  }, [teamUtilization.thisWeekBooked, teamUtilization.thisWeekAvailable]);

  const teamUtilizationLevel = useMemo(
    () =>
      capacityLevel(
        teamUtilization.thisWeekBooked,
        teamUtilization.thisWeekAvailable,
        teamUtilization.thisWeekAvailable <= 0,
      ),
    [teamUtilization.thisWeekBooked, teamUtilization.thisWeekAvailable],
  );

  const upcomingDueTasks = useMemo(() => {
    const groups = ["today", "tomorrow", "three_days"] as const;
    const list: Task[] = [];
    for (const key of groups) {
      const tasks = urgentByGroup.get(key) ?? [];
      list.push(...tasks);
    }
    return list.slice(0, 8);
  }, [urgentByGroup]);

  const peopleById = useMemo(
    () => new Map(state.people.map((p) => [p.id, p])),
    [state.people],
  );

  const clientById = useMemo(
    () => new Map(state.clients.map((c) => [c.id, c])),
    [state.clients],
  );

  const mentionPersonId = effectivePersonId ?? myPerson?.id ?? null;
  const manageWithoutPerson = effectiveCanManage && !mentionPersonId;
  const mentionInbox = useMemo(() => {
    if (!mentionPersonId) return [];
    return (state.unread_mentions ?? []).filter(
      (r) => r.person_id === mentionPersonId,
    );
  }, [mentionPersonId, state.unread_mentions]);
  const unreadMentionIds = useMemo(
    () =>
      new Set(
        mentionInbox.filter((r) => !r.read_at).map((r) => r.comment_id),
      ),
    [mentionInbox],
  );
  const inboxMentionIds = useMemo(
    () => new Set(mentionInbox.map((r) => r.comment_id)),
    [mentionInbox],
  );
  const unreadBulletins = useMemo(
    () => new Set(state.unread_bulletin_ids ?? []),
    [state.unread_bulletin_ids],
  );

  // One-time: seed dismissals for already-read regular posts so wash only
  // applies to currently unread (or newly arrived) notices.
  useEffect(() => {
    if (isPublicShare || !profile?.id) return;
    const key = `reaper-bulletin-wash-v1:${profile.id}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      return;
    }
    const audienceCtx = {
      pods: state.pods,
      podMembers: state.pod_members,
    };
    for (const b of state.bulletins) {
      if (b.tone === "success" || isSystemBulletin(b)) continue;
      if (b.created_by_profile_id === profile.id) continue;
      if (!bulletinVisibleToPerson(b, mentionPersonId, audienceCtx)) {
        if (!(manageWithoutPerson && b.audience === "all")) continue;
      }
      if (unreadBulletins.has(b.id)) continue;
      if (dismissedBulletinIds.has(b.id)) continue;
      dismissBulletinFromBoard(b.id);
    }
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, [
    isPublicShare,
    profile?.id,
    state.bulletins,
    state.pods,
    state.pod_members,
    mentionPersonId,
    manageWithoutPerson,
    unreadBulletins,
    dismissedBulletinIds,
    dismissBulletinFromBoard,
  ]);

  // Each dashboard visit: clear orange unread dots for regular bulletins
  // (wash stays until X). Runs once shortly after mount with latest state.
  const bulletinDotClearRef = useRef({
    bulletins,
    unreadBulletins,
    mentionPersonId,
    manageWithoutPerson,
    pods: state.pods,
    podMembers: state.pod_members,
    dismissBulletin,
  });
  bulletinDotClearRef.current = {
    bulletins,
    unreadBulletins,
    mentionPersonId,
    manageWithoutPerson,
    pods: state.pods,
    podMembers: state.pod_members,
    dismissBulletin,
  };
  useEffect(() => {
    if (isPublicShare || !profile?.id) return;
    const profileId = profile.id;
    const timer = window.setTimeout(() => {
      const snap = bulletinDotClearRef.current;
      const audienceCtx = {
        pods: snap.pods,
        podMembers: snap.podMembers,
      };
      for (const b of snap.bulletins) {
        if (b.tone !== "default") continue;
        if (
          !isUnreadBulletin(
            b,
            snap.mentionPersonId,
            profileId,
            snap.unreadBulletins,
            { manageWithoutPerson: snap.manageWithoutPerson, ...audienceCtx },
          )
        ) {
          continue;
        }
        snap.dismissBulletin(b.id);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [isPublicShare, profile?.id]);

  const unreadBulletinCount = useMemo(() => {
    if (!mentionPersonId && !manageWithoutPerson) return 0;
    const audienceCtx = {
      pods: state.pods,
      podMembers: state.pod_members,
    };
    return state.bulletins.filter((b) =>
      isUnreadBulletin(
        b,
        mentionPersonId,
        profile?.id ?? null,
        unreadBulletins,
        { manageWithoutPerson, ...audienceCtx },
      ),
    ).length;
  }, [
    mentionPersonId,
    manageWithoutPerson,
    state.bulletins,
    state.pods,
    state.pod_members,
    profile?.id,
    unreadBulletins,
  ]);

  const taggedComments = useMemo(() => {
    const personId = mentionPersonId;
    if (!personId) return [];
    const taskById = new Map(state.tasks.map((t) => [t.id, t]));
    return state.task_comments
      .filter((c) => (c.mentioned_person_ids ?? []).includes(personId))
      .filter((c) => inboxMentionIds.has(c.id))
      .map((c) => {
        const task = taskById.get(c.task_id);
        const project = task ? projectById.get(task.project_id) : undefined;
        const client =
          project?.client_id != null
            ? clientById.get(project.client_id)
            : undefined;
        const author = c.author_profile_id
          ? state.profiles.find((p) => p.id === c.author_profile_id)
          : undefined;
        const authorPerson = c.author_profile_id
          ? state.people.find((p) => p.profile_id === c.author_profile_id)
          : undefined;
        return {
          comment: c,
          task,
          project,
          client,
          author,
          authorPerson,
          unread: unreadMentionIds.has(c.id),
        };
      })
      .filter((row) => row.task && row.project)
      .sort((a, b) =>
        b.comment.created_at.localeCompare(a.comment.created_at),
      )
      .slice(0, 20);
  }, [
    mentionPersonId,
    state.task_comments,
    state.tasks,
    state.profiles,
    state.people,
    projectById,
    clientById,
    inboxMentionIds,
    unreadMentionIds,
  ]);

  const viewAsControl =
    canManage || isPublicShare ? (
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="view-as-person">
          View as
        </label>
        <Select
          id="view-as-person"
          searchable
          className="mt-0 h-8 w-[10.5rem] py-0 text-xs"
          value={viewAsPersonId ?? ""}
          onChange={(v) => setViewAsPersonId(v || null)}
          placeholder="View as…"
          options={[
            { value: "", label: "View as…" },
            ...sortedPeople.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        {viewAsPersonId ? (
          <button
            type="button"
            className="cursor-pointer text-xs text-[var(--accent)]"
            onClick={() => setViewAsPersonId(null)}
          >
            Clear
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title="Dashboard" />

      <div
        className={cn(
          "flex flex-col gap-4 py-3 sm:py-5 lg:grid lg:grid-cols-3",
          viewerFullyHidden ? "lg:items-stretch" : "lg:items-start",
        )}
      >
        {/*
          Mobile: `contents` flattens children into the parent flex so order-*
          can interleave identity / notifications / bulletin / rest.
          Desktop: real columns — main (2) + sidebar stack (1), no row stretch.
        */}
        <aside className="contents lg:col-start-3 lg:row-start-1 lg:flex lg:flex-col lg:gap-4 lg:self-start">
          <div className="order-1 lg:order-none">
            <DashboardIdentityCard
              identityPerson={identityPerson}
              viewAsPerson={viewAsPerson}
              profile={profile}
              publicView={isPublicShare}
              organizationName={state.organization.name}
              pods={state.pods}
              podMembers={state.pod_members}
              viewAsControl={viewAsControl}
              showViewingAsHint={
                Boolean(viewAsPerson) && (canManage || isPublicShare)
              }
            />
          </div>

          <div className="order-3 lg:order-none">
            <BulletinBoard
              bulletins={bulletins}
              profiles={state.profiles}
              people={sortedPeople}
              pods={state.pods}
              projects={state.projects}
              projectHref={projectHref}
              canCreate={effectiveCanManage && !isPublicShare}
              profileId={profile?.id ?? null}
              dismissedIds={dismissedBulletinIds}
              isUnread={(b) =>
                isUnreadBulletin(
                  b,
                  mentionPersonId,
                  profile?.id ?? null,
                  unreadBulletins,
                  {
                    manageWithoutPerson,
                    pods: state.pods,
                    podMembers: state.pod_members,
                  },
                )
              }
              unreadCount={unreadBulletinCount}
              onDismissUnread={dismissBulletin}
              onDismissFromBoard={dismissBulletinFromBoard}
              onNavigate={(href) => router.push(href)}
              onSave={(row) => {
                upsertBulletin(row);
                push("Bulletin saved");
              }}
              onDelete={(id) => {
                deleteBulletin(id);
                push("Bulletin deleted");
              }}
              newId={newId}
              compact
            />
          </div>

          <div className="order-5 space-y-4 lg:order-none">
            {showOrgDashboard && !viewerFullyHidden ? (
              <ProjectHealthBudget
                canManage={showOrgDashboard}
                atRisk={atRisk}
                upcoming={upcomingDueTasks}
                projectById={projectById}
                appHref={appHref}
                projectHref={projectHref}
                clients={state.clients}
              />
            ) : null}
            {showScheduleWidgets ? (
              <DashboardCapacityLeave
                canManage={showOrgDashboard}
                peopleLoad={peopleLoad}
                approvedLeave={approvedLeave}
                upcomingLeaveBlocks={upcomingLeaveBlocks}
                people={leaveCalendarPeople}
                appHref={appHref}
              />
            ) : null}
          </div>
        </aside>

        <div
          className={cn(
            "contents lg:col-span-2 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-4",
            viewerFullyHidden && "lg:min-h-0 lg:flex-1",
          )}
        >
          <div
            className={cn(
              "order-2 grid gap-4 sm:grid-cols-2 lg:order-none",
              viewerFullyHidden &&
                "min-h-0 flex-1 items-stretch lg:grid-rows-1",
            )}
          >
            <TaggedCommentsPanel
              taggedComments={taggedComments}
              projectHref={projectHref}
              onOpen={(commentId) => {
                if (!mentionPersonId) return;
                markMentionRead(commentId, mentionPersonId);
              }}
              onDismiss={(commentId) => {
                if (!mentionPersonId) return;
                dismissMention(commentId, mentionPersonId);
              }}
              compact
              stretch={viewerFullyHidden}
            />
            <TaskPulse
              overdue={pulseOverdueTasks}
              urgentByGroup={pulseUrgentByGroup}
              highPriority={pulseHighPriorityTasks}
              total={pulsePinnedTotal}
              projectById={projectById}
              clientById={clientById}
              peopleById={peopleById}
              showAssignee={isPublicShare}
              projectHref={projectHref}
              viewAllHref={myTasksHref}
              pulsePersonId={mentionPersonId}
              compact
              stretch={viewerFullyHidden}
            />
          </div>

          {!viewerFullyHidden ? (
          <div className="order-4 min-w-0 space-y-4 lg:order-none">
            <div
              className={cn(
                "grid grid-cols-2 gap-3",
                showOrgKpis
                  ? showPmHealthKpi
                    ? "xl:grid-cols-4"
                    : "xl:grid-cols-3"
                  : "xl:grid-cols-2",
              )}
            >
              {showOrgKpis && showPmHealthKpi ? (
                <ActiveProjectsHealthCard stats={projectHealthStats} />
              ) : null}

              {showOrgKpis && showUtilizationWidgets ? (
                <KpiCard
                  title={
                    isPodUtilization
                      ? "Pod Utilization Rate"
                      : "Team Utilization Rate"
                  }
                  icon={Gauge}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        capacityLevelTextClass(teamUtilizationLevel),
                      )}
                    >
                      {Math.round(teamUtilization.avg)}% Avg
                    </div>
                    <SchedulePie
                      compact
                      showCenter={false}
                      slices={teamUtilizationPieSlices}
                      totalHours={teamUtilization.thisWeekBooked}
                    />
                  </div>
                </KpiCard>
              ) : null}

              <KpiCard
                title="New Tagged Comments"
                icon={MessageSquare}
                className={
                  unreadMentionIds.size > 0
                    ? "!border-0 bg-[var(--status-attention-wash)]"
                    : undefined
                }
              >
                <div
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    unreadMentionIds.size > 0 &&
                      "text-[var(--status-attention)]",
                  )}
                >
                  {unreadMentionIds.size > 0
                    ? `${unreadMentionIds.size} to review`
                    : `${taggedComments.length} tagged`}
                </div>
              </KpiCard>

              <KpiCard
                title="Overdue / Critical Tasks"
                icon={AlertTriangle}
                href={myTasksHref}
                className={
                  pulseOverdueTasks.length > 0
                    ? "!border-0 bg-[var(--status-over)]/20"
                    : undefined
                }
              >
                <div
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    pulseOverdueTasks.length > 0 && "text-[var(--status-over)]",
                  )}
                >
                  {pulseOverdueTasks.length} Overdue
                </div>
              </KpiCard>
            </div>

            {/* Members (non-org KPI strip): full-width when this is the only extra KPI. */}
            {!showOrgKpis && showPmHealthKpi ? (
              <ActiveProjectsHealthCard stats={projectHealthStats} />
            ) : null}

            {showScheduleWidgets ? (
              <TodaySchedule
                assignments={scheduleDayAssignments}
                scheduleDayKey={scheduleDay.dayKey}
                viewingToday={scheduleDay.isToday}
                projects={state.projects}
                clients={state.clients}
                person={
                  (personalPersonId
                    ? state.people.find((p) => p.id === personalPersonId)
                    : null) ?? focusPerson
                }
                appHref={appHref}
                projectHref={projectHref}
              />
            ) : null}

            {showUtilizationWidgets ? (
              <section className={panelClass()}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <WidgetTitle icon={LayoutGrid}>People Utilization</WidgetTitle>
                  {showOrgKpis ? (
                    <Link
                      href={appHref("/reports/utilization")}
                      className={buttonClass({ variant: "secondary" })}
                    >
                      Full Report
                    </Link>
                  ) : null}
                </div>
                <UtilizationHeatmap
                  weeks={4}
                  personIds={utilizationHeatmapPersonIds}
                />
              </section>
            ) : null}
          </div>
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}

function WidgetTitle({
  icon: Icon,
  children,
  as: Tag = "h2",
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Icon
        size={14}
        strokeWidth={1.75}
        className="shrink-0 text-[var(--text-muted)]"
        aria-hidden
      />
      <Tag className="text-sm font-semibold">{children}</Tag>
    </div>
  );
}

function KpiCard({
  title,
  icon: Icon,
  children,
  className,
  href,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  const body = (
    <>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        <Icon size={12} strokeWidth={1.75} className="shrink-0" aria-hidden />
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </>
  );

  const shellClass = cn(
    panelClass({ padded: false, className: "p-3" }),
    href && "transition-colors hover:bg-[var(--row-hover)]",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(shellClass, "block")}>
        {body}
      </Link>
    );
  }

  return <section className={shellClass}>{body}</section>;
}

function ActiveProjectsHealthCard({
  stats,
}: {
  stats: {
    total: number;
    onTrackPct: number;
    healthy: number;
    near: number;
    over: number;
    none: number;
  };
}) {
  return (
    <KpiCard title="Active Projects / Health" icon={FolderKanban}>
      <div className="text-sm font-semibold tabular-nums">
        {stats.total} Active
        {stats.total > 0 ? (
          <span className="font-normal text-[var(--text-muted)]">
            {" "}
            | {stats.onTrackPct}% On Track
          </span>
        ) : null}
      </div>
      <SegmentBar
        segments={[
          {
            value: stats.healthy,
            className: "bg-[var(--status-healthy)]",
          },
          {
            value: stats.near,
            className: "bg-[var(--status-near)]",
          },
          {
            value: stats.over,
            className: "bg-[var(--status-over)]",
          },
          {
            value: stats.none,
            className: "bg-[var(--status-unavailable)]",
          },
        ]}
      />
    </KpiCard>
  );
}

function SegmentBar({
  segments,
}: {
  segments: { value: number; className: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return (
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]" />
    );
  }
  const visible = segments
    .map((s, i) => ({ ...s, i }))
    .filter((s) => s.value > 0);
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
      {visible.map((s, idx) => (
        <div
          key={s.i}
          className={cn(
            "h-full",
            s.className,
            visible.length === 1 && "rounded-full",
            visible.length > 1 && idx === 0 && "rounded-l-full",
            visible.length > 1 && idx === visible.length - 1 && "rounded-r-full",
          )}
          style={{ width: `${(s.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

function TaggedCommentsPanel({
  taggedComments,
  projectHref,
  onOpen,
  onDismiss,
  compact = false,
  stretch = false,
}: {
  taggedComments: {
    comment: TaskComment;
    task: Task | undefined;
    project: Project | undefined;
    client: Client | undefined;
    author: Profile | undefined;
    authorPerson: Person | undefined;
    unread: boolean;
  }[];
  projectHref: (project: Pick<Project, "client_id" | "slug">, search?: string) => string;
  onOpen: (commentId: string) => void;
  onDismiss: (commentId: string) => void;
  compact?: boolean;
  stretch?: boolean;
}) {
  const total = taggedComments.length;
  const unreadCount = taggedComments.filter((r) => r.unread).length;
  return (
    <section
      className={cn(
        panelClass(),
        stretch && "flex min-h-0 flex-1 flex-col",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare
          size={14}
          strokeWidth={1.75}
          className="shrink-0 text-[var(--text-muted)]"
          aria-hidden
        />
        <h2 className="text-sm font-semibold">New Tagged Comments</h2>
        {unreadCount > 0 ? (
          <span className="rounded-full bg-[var(--status-attention)] px-2 py-0.5 text-[11px] font-medium text-white">
            {unreadCount}
          </span>
        ) : total > 0 ? (
          <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)]">
            {total}
          </span>
        ) : null}
      </div>
      {total === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No comments tagging you yet.
        </p>
      ) : (
        <ul
          className={cn(
            "space-y-2",
            stretch
              ? "min-h-0 flex-1 overflow-y-auto"
              : cn("max-h-72 overflow-y-auto", !compact && "max-h-96"),
          )}
        >
          {taggedComments.map(
            ({ comment, task, project, client, author, authorPerson, unread }) => {
            const location = [
              resolveAuthorLabel(author, authorPerson),
              client?.name,
              project!.name,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={comment.id} className="relative">
                <Link
                  href={projectHref(project!, `task=${task!.id}`)}
                  className="block rounded-md border border-[var(--border)] px-3 py-2 pl-3 pr-9 hover:bg-[var(--row-hover)]"
                  onClick={() => onOpen(comment.id)}
                >
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      {unread ? (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-attention)]"
                          aria-label="New"
                        />
                      ) : null}
                      <span className="truncate">{location}</span>
                    </span>
                    <span className="shrink-0">
                      {comment.created_at.slice(0, 10)}
                    </span>
                  </div>
                  <div className="truncate text-xs font-medium">
                    {task!.title}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                    <RichNotesHtml html={comment.body} />
                  </div>
                </Link>
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                  aria-label="Dismiss tagged comment"
                  title="Dismiss"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDismiss(comment.id);
                  }}
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ProjectHealthBudget({
  canManage,
  atRisk,
  upcoming,
  projectById,
  appHref,
  projectHref,
  clients,
}: {
  canManage: boolean;
  atRisk: {
    project: Project;
    burn: ReturnType<typeof budgetBurn>;
    client: { id: string; name: string } | undefined;
  }[];
  upcoming: Task[];
  projectById: Map<string, Project>;
  appHref: (path: string) => string;
  projectHref: (project: Pick<Project, "client_id" | "slug">, search?: string) => string;
  clients: { id: string; name: string; color: string }[];
}) {
  return (
    <section className={panelClass()}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <WidgetTitle icon={HeartPulse}>Project Health &amp; Budget</WidgetTitle>
        {canManage ? (
          <Link
            href={appHref("/reports/budgets")}
            className={buttonClass({ variant: "secondary" })}
          >
            View Budgets
          </Link>
        ) : null}
      </div>
      {canManage ? (
        atRisk.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            All active project totals look healthy this week.
          </p>
        ) : (
          <div className="space-y-3">
            {atRisk.slice(0, 5).map(({ project, burn, client }) => (
              <Link
                key={project.id}
                href={projectHref(project)}
                className="block rounded-md border border-[var(--border)] p-3 hover:bg-[var(--row-hover)]"
              >
                <div className="mb-2 flex items-center gap-2">
                  <ProjectColorBar
                    color={projectDisplayColor(project, clients)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {project.name}
                    </div>
                    <div className="truncate text-xs text-[var(--text-muted)]">
                      {client?.name ?? "No client"}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      budgetHealth(burn) === "over"
                        ? "text-[var(--status-over)]"
                        : "text-[var(--status-near)]",
                    )}
                  >
                    {budgetHealth(burn) === "over" ? "Over" : "Near"}
                  </span>
                </div>
                <BurnBar burn={burn} compact />
              </Link>
            ))}
          </div>
        )
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No upcoming due dates in the next few days.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
            Due soon
          </div>
          {upcoming.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              project={projectById.get(t.project_id)}
              overdue={false}
              projectHref={projectHref}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DashboardIdentityCard({
  identityPerson,
  viewAsPerson,
  profile,
  publicView = false,
  organizationName,
  pods,
  podMembers,
  viewAsControl,
  showViewingAsHint,
}: {
  identityPerson: Person | null | undefined;
  viewAsPerson: Person | null | undefined;
  profile: Profile | null;
  publicView?: boolean;
  organizationName?: string;
  pods: Pod[];
  podMembers: PodMember[];
  viewAsControl: ReactNode;
  showViewingAsHint?: boolean;
}) {
  const isPublicIdentity = publicView && !viewAsPerson;
  const displayName = isPublicIdentity
    ? "Public view"
    : (identityPerson?.name ??
      profile?.full_name ??
      profile?.email ??
      "Signed in");
  const displayTitle = isPublicIdentity
    ? (organizationName || "Read only")
    : viewAsPerson
      ? identityPerson?.role_title || null
      : identityPerson?.role_title
        ? identityPerson.role_title
        : profile?.role
          ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
          : null;
  const personPods = identityPerson
    ? podsForPerson(identityPerson.id, pods, podMembers)
    : [];
  const showIdentity = Boolean(
    identityPerson || profile || viewAsControl || isPublicIdentity,
  );
  if (!showIdentity) return null;

  return (
    <section className={panelClass()}>
      <div className="flex items-start gap-3">
        <PersonAvatar
          avatarUrl={isPublicIdentity ? null : identityPerson?.avatar_url}
          avatarAttachmentId={
            isPublicIdentity ? null : identityPerson?.avatar_attachment_id
          }
          name={displayName}
          size="xl"
          personId={identityPerson?.id}
          color={
            identityPerson ? personAvatarColor(identityPerson) : null
          }
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{displayName}</div>
          {displayTitle ? (
            <div className="mt-0.5 text-xs text-[var(--text-muted)]">
              {displayTitle}
            </div>
          ) : null}
          {!isPublicIdentity && identityPerson?.office ? (
            <div className="mt-0.5 text-xs text-[var(--text-muted)]">
              City: {identityPerson.office}
            </div>
          ) : null}
          {!isPublicIdentity && personPods.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {personPods.map((pod) => {
                const isPodManager =
                  Boolean(identityPerson) &&
                  pod.manager_person_id === identityPerson!.id;
                const label = isPodManager
                  ? `${pod.name} Pod Manager`
                  : pod.name;
                return (
                  <span
                    key={pod.id}
                    className="max-w-full truncate rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]"
                    title={label}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          ) : null}
          {!isPublicIdentity && identityPerson?.is_contractor ? (
            <div className="mt-2">
              <ContractorTag />
            </div>
          ) : null}
          {isPublicIdentity ? (
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              Read only · not signed in
            </div>
          ) : !identityPerson && profile ? (
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">
              Account only · not linked to a team member
            </div>
          ) : null}
          {viewAsControl ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="shrink-0 text-[11px] text-[var(--text-muted)]">
                Viewing as
              </div>
              {viewAsControl}
            </div>
          ) : showViewingAsHint && viewAsPerson ? (
            <div className="mt-1 text-[11px] text-[var(--accent)]">
              Viewing as
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function DashboardCapacityLeave({
  canManage,
  peopleLoad,
  approvedLeave,
  upcomingLeaveBlocks,
  people,
  appHref,
}: {
  canManage: boolean;
  peopleLoad: {
    person: Person;
    booked: number;
    available: number;
    level: ReturnType<typeof capacityLevel>;
  }[];
  approvedLeave: LeaveDay[];
  upcomingLeaveBlocks: {
    id: string;
    person_id: string;
    start_date: string;
    end_date: string;
    kind: LeaveKind | string;
    hours_per_day: number | null;
  }[];
  people: Person[];
  appHref: (path: string) => string;
}) {
  return (
    <>
      <section className={panelClass()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <WidgetTitle icon={Users}>Capacity &amp; Load</WidgetTitle>
          <Link
            href={appHref("/schedule")}
            className={buttonClass({ variant: "secondary" })}
          >
            Open Schedule
          </Link>
        </div>
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          This week&apos;s load
        </p>
        {peopleLoad.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No capacity data yet.</p>
        ) : (
          <div className="space-y-3">
            {peopleLoad.map(({ person, booked, available, level }) => (
              <CapacityBar
                key={person.id}
                label={canManage ? person.name : "You"}
                booked={booked}
                available={available}
                level={level}
              />
            ))}
          </div>
        )}
      </section>

      <section className={panelClass()}>
        <WidgetTitle icon={CalendarOff} className="mb-3">
          Upcoming Leave
        </WidgetTitle>
        <div className="space-y-4">
          <LeaveMonthCalendar leaveDays={approvedLeave} people={people} />
          {upcomingLeaveBlocks.length > 0 ? (
            <div className="space-y-2">
              {upcomingLeaveBlocks.map((block) => {
                const person = people.find((p) => p.id === block.person_id);
                const rangeLabel =
                  block.start_date === block.end_date
                    ? format(parseISO(block.start_date), "MMM d")
                    : `${format(parseISO(block.start_date), "MMM d")} – ${format(parseISO(block.end_date), "MMM d")}`;
                return (
                  <div
                    key={`${block.id}-${block.start_date}`}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                  >
                    <div className="font-medium">{person?.name ?? "Person"}</div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {rangeLabel} ·{" "}
                      {leaveBlockLabel(block.kind, block.hours_per_day)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}

function TaskRow({
  task,
  project,
  client,
  overdue,
  assignee,
  showAssignee,
  projectHref,
  todayKey = toDateKey(new Date()),
}: {
  task: Task;
  project: Project | undefined;
  client?: Client | null;
  overdue: boolean;
  assignee?: Person | null;
  showAssignee?: boolean;
  projectHref: (project: Pick<Project, "client_id" | "slug">, search?: string) => string;
  todayKey?: string;
}) {
  return (
    <Link
      href={
        project
          ? projectHref(project, `task=${task.id}`)
          : "#"
      }
      className="flex gap-2 rounded-md border border-[var(--border)] px-3 py-2 hover:bg-[var(--row-hover)]"
    >
      <ProjectColorBar
        color={project?.color ?? "#64748B"}
        className="mt-1"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug">
          {task.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
          {showAssignee ? (
            <span className="inline-flex max-w-full items-center gap-1 truncate">
              <PersonAvatar
                avatarUrl={assignee?.avatar_url}
                avatarAttachmentId={assignee?.avatar_attachment_id}
                name={assignee?.name}
                size="xs"
                fallback="initials"
                personId={assignee?.id}
                color={assignee ? personAvatarColor(assignee) : null}
              />
              <span className="truncate">
                {assignee?.name ?? "Unassigned"}
              </span>
            </span>
          ) : null}
          <span className="truncate">
            {client?.name ? `${client.name} · ` : ""}
            {project?.name ?? "Project"}
          </span>
          {task.due_date ? (
            <span
              className={cn(
                dueDateToneClass(task.due_date, todayKey, {
                  complete: task.status === "complete",
                }),
              )}
            >
              {overdue ? "Overdue" : task.due_date}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

function TodaySchedule({
  assignments,
  scheduleDayKey,
  viewingToday,
  projects,
  clients,
  person,
  appHref,
  projectHref,
}: {
  assignments: {
    id: string;
    person_id: string;
    project_id: string;
    hours_per_day: number;
  }[];
  scheduleDayKey: string;
  viewingToday: boolean;
  projects: Project[];
  clients: Client[];
  person?: Person | null;
  appHref: (path: string) => string;
  projectHref: (project: Pick<Project, "client_id" | "slug">, search?: string) => string;
}) {
  const dayAvailable = person ? dailyCapacityHours(person) : 0;
  const scheduleBarLabel = viewingToday
    ? "Today"
    : format(parseISO(scheduleDayKey), "EEEE, MMMM d");

  const slices = useMemo(() => {
    const byProject = new Map<
      string,
      { projectId: string; hours: number; color: string; label: string }
    >();
    for (const a of assignments) {
      const project = projects.find((p) => p.id === a.project_id);
      const client = project?.client_id
        ? clients.find((c) => c.id === project.client_id)
        : undefined;
      const color = project
        ? projectDisplayColor(project, clients)
        : "#64748B";
      const label = client?.name
        ? `${client.name} · ${project?.name ?? "Project"}`
        : (project?.name ?? "Project");
      const prev = byProject.get(a.project_id);
      if (prev) {
        prev.hours += a.hours_per_day;
      } else {
        byProject.set(a.project_id, {
          projectId: a.project_id,
          hours: a.hours_per_day,
          color,
          label,
        });
      }
    }
    const projectSlices = [...byProject.values()].sort(
      (a, b) => b.hours - a.hours,
    );
    const booked = projectSlices.reduce((s, p) => s + p.hours, 0);
    const free = Math.max(0, dayAvailable - booked);
    if (free > 0.01) {
      projectSlices.push({
        projectId: "__free__",
        hours: free,
        color: "#94a3b8",
        label: "Available",
      });
    }
    return projectSlices;
  }, [assignments, projects, clients, dayAvailable]);

  const dayBooked = useMemo(
    () => assignments.reduce((sum, a) => sum + a.hours_per_day, 0),
    [assignments],
  );

  const dayLevel = capacityLevel(
    dayBooked,
    dayAvailable,
    dayAvailable <= 0 && dayBooked <= 0,
  );

  const pieTotal = slices.reduce((s, x) => s + x.hours, 0);

  return (
    <section className={panelClass()}>
      <div className="mb-3 min-w-0">
        <WidgetTitle icon={CalendarRange}>Schedules</WidgetTitle>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {viewingToday
            ? "Today's hours by project"
            : "Next scheduled day's hours by project"}
        </p>
      </div>

      {person && dayAvailable > 0 ? (
        <div className="mb-3 border-b border-[var(--section-rule)] pb-3">
          <CapacityBar
            label={scheduleBarLabel}
            booked={dayBooked}
            available={dayAvailable}
            level={dayLevel}
          />
        </div>
      ) : null}

      {pieTotal <= 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {viewingToday
            ? "Nothing scheduled today."
            : "Nothing scheduled for this day."}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4 pt-5 sm:flex-row sm:items-start sm:pt-6">
          <SchedulePie slices={slices} totalHours={dayBooked} />
          <ul className="min-w-0 flex-1 space-y-1.5 self-stretch">
            {slices.map((slice) => {
              const pct =
                pieTotal > 0 ? Math.round((slice.hours / pieTotal) * 100) : 0;
              const isFree = slice.projectId === "__free__";
              const row = (
                <span className="flex items-center gap-2 text-sm">
                  <ProjectColorBar color={slice.color} />
                  <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                  <span className="shrink-0 tabular-nums text-xs text-[var(--text-muted)]">
                    {formatHours(slice.hours)}
                    <span className="ml-1 opacity-70">· {pct}%</span>
                  </span>
                </span>
              );
              return (
                <li key={slice.projectId}>
                  {isFree ? (
                    <div className="rounded-md px-2 py-1.5">{row}</div>
                  ) : (
                    <Link
                      href={
                        projects.find((p) => p.id === slice.projectId)
                          ? projectHref(
                              projects.find((p) => p.id === slice.projectId)!,
                            )
                          : appHref("/projects")
                      }
                      className="block rounded-md px-2 py-1.5 hover:bg-[var(--row-hover)]"
                    >
                      {row}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function TaskPulse({
  overdue,
  urgentByGroup,
  highPriority,
  total,
  projectById,
  clientById,
  peopleById,
  showAssignee,
  projectHref,
  viewAllHref,
  pulsePersonId,
  compact = false,
  stretch = false,
}: {
  overdue: Task[];
  urgentByGroup: Map<TaskUrgency, Task[]>;
  highPriority: Task[];
  total: number;
  projectById: Map<string, Project>;
  clientById: Map<string, Client>;
  peopleById: Map<string, Person>;
  showAssignee?: boolean;
  projectHref: (project: Pick<Project, "client_id" | "slug">, search?: string) => string;
  viewAllHref: string;
  /** When set, badge can be cleared for the day via View All. */
  pulsePersonId?: string | null;
  compact?: boolean;
  stretch?: boolean;
}) {
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const badgeStorageKey =
    pulsePersonId != null
      ? `reaper-pulse-badge:${pulsePersonId}:${todayKey}`
      : null;
  const [badgeCleared, setBadgeCleared] = useState(() => {
    if (!badgeStorageKey || typeof window === "undefined") return false;
    try {
      return localStorage.getItem(badgeStorageKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!badgeStorageKey || typeof window === "undefined") {
      setBadgeCleared(false);
      return;
    }
    try {
      setBadgeCleared(localStorage.getItem(badgeStorageKey) === "1");
    } catch {
      setBadgeCleared(false);
    }
  }, [badgeStorageKey]);

  const badgeTotal = badgeCleared ? 0 : total;
  const hasFeed =
    overdue.length > 0 ||
    [...urgentByGroup.values()].some((list) => list.length > 0) ||
    (!compact && highPriority.length > 0);

  function clearBadgeForToday() {
    if (!badgeStorageKey) return;
    try {
      localStorage.setItem(badgeStorageKey, "1");
    } catch {
      /* ignore */
    }
    setBadgeCleared(true);
  }

  function row(task: Task, overdueRow: boolean) {
    const assignee = task.assignee_person_id
      ? peopleById.get(task.assignee_person_id) ?? null
      : null;
    const project = projectById.get(task.project_id);
    const client = project?.client_id
      ? clientById.get(project.client_id) ?? null
      : null;
    return (
      <TaskRow
        key={task.id}
        task={task}
        project={project}
        client={client}
        overdue={overdueRow}
        assignee={assignee}
        showAssignee={showAssignee}
        projectHref={projectHref}
      />
    );
  }

  const groupsToShow = compact
    ? URGENCY_GROUPS.filter((g) => g.key !== "week")
    : URGENCY_GROUPS;

  return (
    <section
      className={cn(
        panelClass(),
        stretch && "flex min-h-0 flex-1 flex-col",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Pin
            size={14}
            strokeWidth={1.75}
            className="shrink-0 text-[var(--text-muted)]"
            aria-hidden
          />
          <h2 className="text-sm font-semibold">Task Pulse</h2>
          {badgeTotal > 0 ? (
            <span className="rounded-full bg-[var(--status-attention)] px-2 py-0.5 text-[11px] font-medium text-white">
              {badgeTotal}
            </span>
          ) : null}
        </div>
        <Link
          href={viewAllHref}
          className={buttonClass({ variant: "secondary", size: "sm" })}
          onClick={clearBadgeForToday}
        >
          View All
        </Link>
      </div>
      {!hasFeed ? (
        <p className="text-sm text-[var(--text-muted)]">
          Nothing overdue or urgent right now.
        </p>
      ) : (
        <div
          className={cn(
            "space-y-3 overflow-y-auto",
            stretch ? "min-h-0 flex-1" : "max-h-72",
          )}
        >
          {overdue.length > 0 ? (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--status-over)]">
                <AlertTriangle size={12} />
                Overdue
              </div>
              <div className="space-y-1.5">
                {(compact ? overdue.slice(0, 4) : overdue).map((t) =>
                  row(t, true),
                )}
              </div>
            </div>
          ) : null}

          {groupsToShow.map(({ key, label }) => {
            const tasks = urgentByGroup.get(key);
            if (!tasks || tasks.length === 0) return null;
            return (
              <div key={key}>
                <div className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                  {label}
                </div>
                <div className="space-y-1.5">
                  {(compact ? tasks.slice(0, 4) : tasks).map((t) =>
                    row(t, false),
                  )}
                </div>
              </div>
            );
          })}

          {!compact && highPriority.length > 0 ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                High priority
              </div>
              <div className="space-y-1.5">
                {highPriority.map((t) => row(t, false))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

type BulletinDraft = Omit<Bulletin, "organization_id">;

function emptyBulletin(id: string, profileId: string | null): BulletinDraft {
  return {
    id,
    project_id: null,
    task_id: null,
    milestone_id: null,
    title: "",
    body: "",
    pinned: false,
    audience: "all",
    audience_person_ids: [],
    audience_pod_ids: [],
    tone: "default",
    created_by_profile_id: profileId,
    created_at: new Date().toISOString(),
  };
}

function BulletinBoard({
  bulletins,
  profiles,
  people,
  pods,
  projects,
  projectHref,
  canCreate,
  profileId,
  dismissedIds,
  isUnread,
  unreadCount = 0,
  onDismissUnread,
  onDismissFromBoard,
  onNavigate,
  onSave,
  onDelete,
  newId,
  compact = false,
}: {
  bulletins: Bulletin[];
  profiles: Profile[];
  people: Person[];
  pods: Pod[];
  projects: Project[];
  projectHref: (project: Pick<Project, "client_id" | "slug">, search?: string) => string;
  canCreate: boolean;
  profileId: string | null;
  dismissedIds: Set<string>;
  isUnread?: (b: Bulletin) => boolean;
  unreadCount?: number;
  onDismissUnread?: (id: string) => void;
  onDismissFromBoard?: (id: string) => void;
  onNavigate?: (href: string) => void;
  onSave: (row: BulletinDraft) => void;
  onDelete: (id: string) => void;
  newId: (prefix: string) => string;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState<BulletinDraft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const visible = bulletins.slice(0, 20);
  const sortedPodList = useMemo(() => sortPods(pods), [pods]);

  function audienceSummary(b: Bulletin): string {
    if (b.audience !== "people") return "Everyone";
    const parts: string[] = [];
    const podCount = b.audience_pod_ids?.length ?? 0;
    const peopleCount = b.audience_person_ids.length;
    if (podCount > 0) {
      parts.push(`${podCount} pod${podCount === 1 ? "" : "s"}`);
    }
    if (peopleCount > 0) {
      parts.push(`${peopleCount} ${peopleCount === 1 ? "person" : "people"}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "No recipients";
  }

  function linkHref(b: Bulletin, project: Project): string {
    if (b.task_id) return projectHref(project, `task=${b.task_id}`);
    if (b.milestone_id) {
      return projectHref(project, `milestone=${b.milestone_id}`);
    }
    return projectHref(project);
  }

  return (
    <section className={panelClass()}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone
            size={14}
            strokeWidth={1.75}
            className="shrink-0 text-[var(--text-muted)]"
            aria-hidden
          />
          <h2 className="text-sm font-semibold">Bulletin Board</h2>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-[var(--status-attention)] px-2 py-0.5 text-[11px] font-medium text-white">
              {unreadCount}
            </span>
          ) : null}
        </div>
        {canCreate ? (
          <button
            type="button"
            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-[var(--accent)] px-2 text-xs text-[var(--accent-fg)] hover:opacity-90"
            onClick={() =>
              setEditing(emptyBulletin(newId("bulletin"), profileId))
            }
          >
            <Plus size={12} />
            New
          </button>
        ) : null}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No announcements yet.</p>
      ) : (
        <ul className={cn("space-y-2", compact && "max-h-72 overflow-y-auto")}>
          {visible.map((b) => {
            const author = profiles.find(
              (p) => p.id === b.created_by_profile_id,
            );
            const unread = isUnread?.(b) ?? false;
            const systemNotice = isSystemBulletin(b);
            const success = b.tone === "success";
            const isAuthor =
              Boolean(profileId) && b.created_by_profile_id === profileId;
            const washed =
              !success && !systemNotice && !isAuthor && !dismissedIds.has(b.id);
            const linkedProject = b.project_id
              ? projects.find((p) => p.id === b.project_id)
              : null;
            const href = linkedProject ? linkHref(b, linkedProject) : null;
            const goToLinked = () => {
              if (!href) return;
              if (success || systemNotice) onDismissUnread?.(b.id);
              onNavigate?.(href);
            };
            const showDismissX =
              Boolean(onDismissFromBoard) &&
              (systemNotice || (washed && !isAuthor));
            const canAuthorEdit = isAuthor && !systemNotice;
            return (
              <li
                key={b.id}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  success
                    ? "border-transparent bg-[var(--status-healthy)]/15"
                    : washed
                      ? "border-transparent bg-[var(--status-attention-wash)]"
                      : b.pinned
                        ? "border-transparent bg-[var(--accent)]/5"
                        : "border-[var(--border)]",
                  href && "cursor-pointer hover:opacity-95",
                )}
                onClick={href ? goToLinked : undefined}
                onKeyDown={
                  href
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          goToLinked();
                        }
                      }
                    : undefined
                }
                role={href ? "link" : undefined}
                tabIndex={href ? 0 : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      {unread ? (
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            success
                              ? "bg-[var(--status-healthy)]"
                              : "bg-[var(--status-attention)]",
                          )}
                          aria-label="New"
                        />
                      ) : null}
                      {b.pinned ? (
                        <Pin size={11} className="text-[var(--accent)]" />
                      ) : null}
                      {b.title}
                    </div>
                    {b.body ? (
                      /<\/?(?:p|strong|b|u|a|br|span|ul|ol|li)\b/i.test(
                        b.body,
                      ) ? (
                        <div
                          className="rich-notes mt-1 text-xs text-[var(--text-muted)]"
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest("a")) {
                              e.stopPropagation();
                            }
                          }}
                        >
                          <RichNotesHtml html={b.body} />
                        </div>
                      ) : (
                        <LinkifiedText
                          text={b.body}
                          className="mt-1 text-xs text-[var(--text-muted)]"
                        />
                      )
                    ) : null}
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {b.created_at.slice(0, 10)}
                      {author ? ` · ${author.full_name}` : ""}
                      {` · ${audienceSummary(b)}`}
                    </div>
                  </div>
                  <div
                    className="flex shrink-0 items-start gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {showDismissX ? (
                      <button
                        type="button"
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                        aria-label="Dismiss notice"
                        title="Dismiss"
                        onClick={() => onDismissFromBoard?.(b.id)}
                      >
                        <X size={13} strokeWidth={2} />
                      </button>
                    ) : null}
                    {canAuthorEdit ? (
                      <>
                        <button
                          type="button"
                          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                          aria-label="Edit bulletin"
                          onClick={() =>
                            setEditing({
                              id: b.id,
                              project_id: b.project_id,
                              task_id: b.task_id ?? null,
                              milestone_id: b.milestone_id ?? null,
                              title: b.title,
                              body: b.body,
                              pinned: b.pinned,
                              audience: b.audience,
                              audience_person_ids: [...b.audience_person_ids],
                              audience_pod_ids: [...(b.audience_pod_ids ?? [])],
                              tone: b.tone ?? "default",
                              created_by_profile_id: b.created_by_profile_id,
                              created_at: b.created_at,
                            })
                          }
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--status-over)]"
                          aria-label="Delete bulletin"
                          onClick={() => setConfirmDeleteId(b.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing ? (
        <Modal
          title={
            bulletins.some((b) => b.id === editing.id)
              ? "Edit bulletin"
              : "New bulletin"
          }
          onClose={() => setEditing(null)}
        >
          <div className="grid gap-3">
            <Field label="Title">
              <input
                className={inputClass}
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </Field>
            <Field label="Body">
              <textarea
                className={cn(inputClass, "h-24 py-2")}
                value={editing.body}
                onChange={(e) =>
                  setEditing({ ...editing, body: e.target.value })
                }
              />
            </Field>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.pinned}
                onChange={(e) =>
                  setEditing({ ...editing, pinned: e.target.checked })
                }
              />
              Pin to top
            </label>
            <Field label="Audience">
              <Select
                value={editing.audience}
                onChange={(v) => {
                  const audience = v === "people" ? "people" : "all";
                  setEditing({
                    ...editing,
                    audience,
                    audience_person_ids:
                      audience === "all" ? [] : editing.audience_person_ids,
                    audience_pod_ids:
                      audience === "all" ? [] : editing.audience_pod_ids,
                  });
                }}
                options={[
                  { value: "all", label: "All users" },
                  { value: "people", label: "Selected pods & people" },
                ]}
              />
            </Field>
            {editing.audience === "people" ? (
              <>
                {sortedPodList.length > 0 ? (
                  <Field label="Pods">
                    <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-[var(--border)] p-2">
                      {sortedPodList.map((pod) => {
                        const checked = (
                          editing.audience_pod_ids ?? []
                        ).includes(pod.id);
                        return (
                          <label
                            key={pod.id}
                            className="flex cursor-pointer items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const ids = e.target.checked
                                  ? [
                                      ...(editing.audience_pod_ids ?? []),
                                      pod.id,
                                    ]
                                  : (editing.audience_pod_ids ?? []).filter(
                                      (id) => id !== pod.id,
                                    );
                                setEditing({
                                  ...editing,
                                  audience_pod_ids: ids,
                                });
                              }}
                            />
                            {pod.name}
                          </label>
                        );
                      })}
                    </div>
                  </Field>
                ) : null}
                <Field label="People">
                  <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border border-[var(--border)] p-2">
                    {people.map((p) => {
                      const checked = editing.audience_person_ids.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const ids = e.target.checked
                                ? [...editing.audience_person_ids, p.id]
                                : editing.audience_person_ids.filter(
                                    (id) => id !== p.id,
                                  );
                              setEditing({
                                ...editing,
                                audience_person_ids: ids,
                              });
                            }}
                          />
                          {p.name}
                        </label>
                      );
                    })}
                  </div>
                </Field>
              </>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="lg"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  if (!editing.title.trim()) return;
                  if (
                    editing.audience === "people" &&
                    editing.audience_person_ids.length === 0 &&
                    (editing.audience_pod_ids ?? []).length === 0
                  ) {
                    return;
                  }
                  onSave({
                    ...editing,
                    task_id: editing.task_id ?? null,
                    milestone_id: editing.milestone_id ?? null,
                    title: editing.title.trim(),
                    audience_pod_ids: editing.audience_pod_ids ?? [],
                    created_by_profile_id:
                      editing.created_by_profile_id ?? profileId,
                  });
                  setEditing(null);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {confirmDeleteId ? (
        <ConfirmDialog
          title="Delete bulletin?"
          message="This announcement will be removed for everyone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => {
            onDelete(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
        />
      ) : null}
    </section>
  );
}
