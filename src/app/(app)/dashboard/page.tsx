"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { addWeeks, format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Megaphone,
  MessageSquare,
  Pencil,
  Pin,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { LeaveMonthCalendar } from "@/components/dashboard/leave-month-calendar";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { UtilizationHeatmap } from "@/components/heatmap/utilization-heatmap";
import { BurnBar } from "@/components/ui/burn-bar";
import { Button, buttonClass } from "@/components/ui/button";
import { panelClass } from "@/components/ui/panel";
import { CapacityBar } from "@/components/ui/capacity-bar";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { RichNotesHtml } from "@/components/ui/simple-rich-text";
import {
  ConfirmDialog,
  Field,
  Modal,
  inputClass,
} from "@/components/ui/form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { useDismissedMentions, useDismissedBulletins } from "@/lib/hooks/use-dismissed-mentions";
import {
  bulletinDismissSubject,
  bulletinVisibleToPerson,
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
  dailyCapacityHours,
  personBookedHoursInRange,
  availableHoursInRange,
  utilizationPct,
} from "@/lib/domain/capacity";
import {
  endOfMonth,
  toDateKey,
  weekEnd,
  weekStart,
} from "@/lib/domain/dates";
import { leaveBlockLabel } from "@/lib/domain/leave";
import { leaveBlocksInRange } from "@/lib/domain/leave-blocks";
import {
  expandAssignmentsInRange,
  occurrenceCoversDay,
} from "@/lib/domain/recurrence";
import { projectDisplayColor, sortPeopleByName } from "@/lib/domain/sorting";
import { taskUrgency, type TaskUrgency } from "@/lib/domain/tasks";
import { cn } from "@/lib/cn";
import type {
  Bulletin,
  Client,
  LeaveDay,
  LeaveKind,
  Person,
  Profile,
  Project,
  Task,
  TaskComment,
} from "@/lib/types";

const URGENCY_GROUPS: { key: TaskUrgency; label: string }[] = [
  { key: "today", label: "Due today" },
  { key: "tomorrow", label: "Due tomorrow" },
  { key: "three_days", label: "Due in 3 days" },
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
    newId,
  } = useData();
  const { push } = useToast();
  const appHref = useAppHref();
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

  /** Members / View As: capacity + leave widgets scoped to one person. */
  const scopePersonalCapacity = !showingAsManager;
  const focusPerson = identityPerson;

  const todaysAssignments = useMemo(() => {
    const today = expandAssignmentsInRange(
      state.assignments,
      todayKey,
      todayKey,
    )
      .filter((o) => occurrenceCoversDay(o, todayKey))
      .map((o) => ({
        id:
          o.weekOffset > 0
            ? `${o.assignmentId}:${o.weekOffset}`
            : o.assignmentId,
        person_id: o.person_id,
        project_id: o.project_id,
        hours_per_day: o.hours_per_day,
      }));
    // Org dashboard / public share: all people. Members: self (or View As).
    if (isPublicShare || showingAsManager) return today;
    if (!personalPersonId) return [];
    return today.filter((a) => a.person_id === personalPersonId);
  }, [
    state.assignments,
    todayKey,
    isPublicShare,
    showingAsManager,
    personalPersonId,
  ]);

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
    if (isPublicShare) return state.tasks;
    if (!personalPersonId) return [];
    return state.tasks.filter((t) => t.assignee_person_id === personalPersonId);
  }, [state.tasks, isPublicShare, personalPersonId]);

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
    const filtered =
      showingAsManager || isPublicShare
        ? state.bulletins
        : state.bulletins.filter((b) =>
            bulletinVisibleToPerson(b, personalPersonId),
          );
    return [...filtered].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [
    state.bulletins,
    showingAsManager,
    isPublicShare,
    personalPersonId,
  ]);

  const atRisk = showOrgDashboard
    ? state.projects
        .map((p) => ({
          project: p,
          burn: budgetBurn(p, state.assignments, state.people),
          client: p.client_id
            ? state.clients.find((c) => c.id === p.client_id)
            : undefined,
        }))
        .filter(({ burn }) => {
          const health = budgetHealth(burn);
          return health === "over" || health === "near";
        })
        .sort((a, b) => b.burn.pct - a.burn.pct)
    : [];

  const peopleLoad = useMemo(() => {
    const source = scopePersonalCapacity
      ? focusPerson
        ? [focusPerson]
        : []
      : state.people;
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
    state.people,
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
      : state.people;
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
    state.people,
    state.leave_days,
    start,
    leaveHorizonEnd,
  ]);

  const approvedLeave = useMemo(() => {
    const approved = state.leave_days.filter((l) => l.status === "approved");
    if (!scopePersonalCapacity) return approved;
    if (!focusPerson) return [];
    return approved.filter((l) => l.person_id === focusPerson.id);
  }, [state.leave_days, scopePersonalCapacity, focusPerson]);

  const leaveCalendarPeople = useMemo(
    () =>
      scopePersonalCapacity
        ? focusPerson
          ? [focusPerson]
          : []
        : state.people,
    [scopePersonalCapacity, focusPerson, state.people],
  );

  const sortedPeople = sortPeopleByName(state.people);

  const activeProjects = useMemo(
    () => state.projects.filter((p) => p.status === "active"),
    [state.projects],
  );

  const projectHealthStats = useMemo(() => {
    let healthy = 0;
    let near = 0;
    let over = 0;
    let none = 0;
    for (const p of activeProjects) {
      const health = budgetHealth(
        budgetBurn(p, state.assignments, state.people),
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
  }, [activeProjects, state.assignments, state.people]);

  const teamUtilization = useMemo(() => {
    const people = showOrgDashboard
      ? state.people
      : focusPerson
        ? [focusPerson]
        : myPerson
          ? [myPerson]
          : [];
    if (people.length === 0) return { avg: 0, series: [] as number[] };

    const weekAvgs: number[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const anchor = weekStart(addWeeks(now, -i));
      const wStart = toDateKey(anchor);
      const wEnd = toDateKey(weekEnd(anchor));
      let sum = 0;
      let n = 0;
      for (const person of people) {
        const booked = personBookedHoursInRange(
          person.id,
          wStart,
          wEnd,
          state.assignments,
          state.leave_days,
        );
        const available = availableHoursInRange(
          person,
          wStart,
          wEnd,
          state.leave_days,
        );
        if (available <= 0) continue;
        sum += utilizationPct(booked, available);
        n += 1;
      }
      weekAvgs.push(n > 0 ? sum / n : 0);
    }
    const avg = weekAvgs[weekAvgs.length - 1] ?? 0;
    return { avg, series: weekAvgs };
  }, [
    showOrgDashboard,
    focusPerson,
    myPerson,
    state.people,
    state.assignments,
    state.leave_days,
    now,
  ]);

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
  const bulletinSubject = bulletinDismissSubject(
    mentionPersonId,
    profile?.id ?? null,
    effectiveCanManage,
  );
  const { dismiss: dismissMention, dismissed: dismissedMentions } =
    useDismissedMentions(mentionPersonId);
  const { dismiss: dismissBulletin, dismissed: dismissedBulletins } =
    useDismissedBulletins(bulletinSubject);

  const unreadBulletinCount = useMemo(() => {
    if (!mentionPersonId && !manageWithoutPerson) return 0;
    return state.bulletins.filter((b) =>
      isUnreadBulletin(
        b,
        mentionPersonId,
        profile?.id ?? null,
        dismissedBulletins,
        { manageWithoutPerson },
      ),
    ).length;
  }, [
    mentionPersonId,
    manageWithoutPerson,
    state.bulletins,
    profile?.id,
    dismissedBulletins,
  ]);

  const taggedComments = useMemo(() => {
    const personId = mentionPersonId;
    if (!personId) return [];
    const taskById = new Map(state.tasks.map((t) => [t.id, t]));
    return state.task_comments
      .filter((c) => (c.mentioned_person_ids ?? []).includes(personId))
      .filter((c) => !dismissedMentions.has(c.id))
      .map((c) => {
        const task = taskById.get(c.task_id);
        const project = task ? projectById.get(task.project_id) : undefined;
        const author = state.profiles.find(
          (p) => p.id === c.author_profile_id,
        );
        return { comment: c, task, project, author };
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
    projectById,
    dismissedMentions,
  ]);

  const viewAsControl =
    canManage ? (
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="view-as-person">
          View as
        </label>
        <select
          id="view-as-person"
          className={cn(inputClass, "mt-0 h-8 w-[10.5rem] py-0 text-xs")}
          value={viewAsPersonId ?? ""}
          onChange={(e) => setViewAsPersonId(e.target.value || null)}
        >
          <option value="">View as…</option>
          {sortedPeople.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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

      <div className="flex flex-col gap-4 p-3 sm:p-5 lg:grid lg:grid-cols-3 lg:items-start">
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
              hideIdentity={isPublicShare}
              viewAsControl={viewAsControl}
              showViewingAsHint={Boolean(viewAsPerson) && canManage}
            />
          </div>

          <div className="order-3 lg:order-none">
            <BulletinBoard
              bulletins={bulletins}
              profiles={state.profiles}
              people={sortedPeople}
              canEdit={effectiveCanManage && !isPublicShare}
              profileId={profile?.id ?? null}
              isUnread={(b) =>
                isUnreadBulletin(
                  b,
                  mentionPersonId,
                  profile?.id ?? null,
                  dismissedBulletins,
                  { manageWithoutPerson },
                )
              }
              unreadCount={unreadBulletinCount}
              onDismissUnread={dismissBulletin}
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
            <ProjectHealthBudget
              canManage={showOrgDashboard}
              atRisk={atRisk}
              upcoming={upcomingDueTasks}
              projectById={projectById}
              appHref={appHref}
              clients={state.clients}
            />
            <DashboardCapacityLeave
              canManage={showOrgDashboard}
              peopleLoad={peopleLoad}
              approvedLeave={approvedLeave}
              upcomingLeaveBlocks={upcomingLeaveBlocks}
              people={leaveCalendarPeople}
              appHref={appHref}
            />
          </div>
        </aside>

        <div className="contents lg:col-span-2 lg:row-start-1 lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <div className="order-2 grid gap-4 sm:grid-cols-2 lg:order-none">
            <TaggedCommentsPanel
              taggedComments={taggedComments}
              appHref={appHref}
              onDismiss={dismissMention}
              compact
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
              appHref={appHref}
              compact
            />
          </div>

          <div className="order-4 min-w-0 space-y-4 lg:order-none">
            <div
              className={cn(
                "grid grid-cols-2 gap-3",
                showOrgKpis ? "xl:grid-cols-4" : "xl:grid-cols-2",
              )}
            >
              {showOrgKpis ? (
                <>
                  <KpiCard title="Active Projects / Health">
                    <div className="text-sm font-semibold tabular-nums">
                      {projectHealthStats.total} Active
                      {projectHealthStats.total > 0 ? (
                        <span className="font-normal text-[var(--text-muted)]">
                          {" "}
                          | {projectHealthStats.onTrackPct}% On Track
                        </span>
                      ) : null}
                    </div>
                    <SegmentBar
                      segments={[
                        {
                          value: projectHealthStats.healthy,
                          className: "bg-[var(--status-healthy)]",
                        },
                        {
                          value: projectHealthStats.near,
                          className: "bg-[var(--status-near)]",
                        },
                        {
                          value: projectHealthStats.over,
                          className: "bg-[var(--status-over)]",
                        },
                        {
                          value: projectHealthStats.none,
                          className: "bg-[var(--status-unavailable)]",
                        },
                      ]}
                    />
                  </KpiCard>

                  <KpiCard title="Team Utilization Rate">
                    <div className="flex items-end justify-between gap-2">
                      <div className="text-sm font-semibold tabular-nums">
                        {Math.round(teamUtilization.avg)}% Avg
                      </div>
                      <Sparkline values={teamUtilization.series} />
                    </div>
                  </KpiCard>
                </>
              ) : null}

              <KpiCard
                title="Tagged Comments"
                className={
                  taggedComments.length > 0
                    ? "!border-0 bg-[var(--status-attention-wash)]"
                    : undefined
                }
              >
                <div
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    taggedComments.length > 0 &&
                      "text-[var(--status-attention)]",
                  )}
                >
                  {taggedComments.length} to review
                </div>
              </KpiCard>

              <KpiCard
                title="Overdue / Critical Tasks"
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

            <TodaySchedule
              assignments={todaysAssignments}
              projects={state.projects}
              clients={state.clients}
              people={sortedPeople}
              orgMode={showingAsManager || isPublicShare}
              fallbackPerson={focusPerson}
              defaultPersonId={personalPersonId}
              appHref={appHref}
            />

            <section className={panelClass()}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">People Utilization</h2>
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
                personIds={
                  showingAsManager
                    ? null
                    : focusPerson
                      ? [focusPerson.id]
                      : []
                }
              />
            </section>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

function KpiCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        panelClass({ padded: false, className: "p-3" }),
        className,
      )}
    >
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
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
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
      {segments.map((s, i) =>
        s.value > 0 ? (
          <div
            key={i}
            className={cn("h-full", s.className)}
            style={{ width: `${(s.value / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const w = 64;
  const h = 24;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 text-[var(--text)]"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}

function TaggedCommentsPanel({
  taggedComments,
  appHref,
  onDismiss,
  compact = false,
}: {
  taggedComments: {
    comment: TaskComment;
    task: Task | undefined;
    project: Project | undefined;
    author: Profile | undefined;
  }[];
  appHref: (path: string) => string;
  onDismiss: (commentId: string) => void;
  compact?: boolean;
}) {
  const total = taggedComments.length;
  return (
    <section className={panelClass()}>
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare size={14} className="text-[var(--text-muted)]" />
        <h2 className="text-sm font-semibold">Tagged Comments</h2>
        {total > 0 ? (
          <span className="rounded-full bg-[var(--status-attention)] px-2 py-0.5 text-[11px] font-medium text-white">
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
            "max-h-72 overflow-y-auto",
            !compact && "max-h-96",
          )}
        >
          {taggedComments.map(({ comment, task, project, author }) => (
            <li key={comment.id} className="relative">
              <Link
                href={appHref(
                  `/projects/${project!.id}?task=${task!.id}&comments=1`,
                )}
                className="block rounded-md border border-[var(--border)] px-3 py-2 pr-9 hover:bg-[var(--row-hover)]"
              >
                <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                  <span className="truncate">
                    {author?.full_name ?? "Someone"} · {project!.name}
                  </span>
                  <span className="shrink-0">
                    {comment.created_at.slice(0, 10)}
                  </span>
                </div>
                <div className="truncate text-xs font-medium">{task!.title}</div>
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
          ))}
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
  clients: { id: string; name: string; color: string }[];
}) {
  return (
    <section className={panelClass()}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Project Health &amp; Budget</h2>
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
                href={appHref(`/projects/${project.id}`)}
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
              appHref={appHref}
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
  hideIdentity = false,
  viewAsControl,
  showViewingAsHint,
}: {
  identityPerson: Person | null | undefined;
  viewAsPerson: Person | null | undefined;
  profile: Profile | null;
  hideIdentity?: boolean;
  viewAsControl: ReactNode;
  showViewingAsHint?: boolean;
}) {
  const displayName =
    identityPerson?.name ??
    profile?.full_name ??
    profile?.email ??
    "Signed in";
  const displayTitle = viewAsPerson
    ? identityPerson?.role_title || null
    : identityPerson?.role_title
      ? identityPerson.role_title
      : profile?.role
        ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
        : null;
  const showIdentity =
    !hideIdentity && Boolean(identityPerson || profile || viewAsControl);
  if (!showIdentity) return null;

  return (
    <section className={panelClass()}>
      <div className="flex flex-col items-start gap-3">
        <PersonAvatar
          avatarUrl={identityPerson?.avatar_url}
          name={displayName}
          size="xl"
        />
        <div className="w-full min-w-0">
          <div className="text-sm font-semibold">{displayName}</div>
          {displayTitle ? (
            <div className="text-xs text-[var(--text-muted)]">
              {displayTitle}
            </div>
          ) : null}
          {!identityPerson && profile ? (
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Capacity &amp; Load</h2>
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
        <h2 className="mb-3 text-sm font-semibold">Upcoming Leave</h2>
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
  appHref,
}: {
  task: Task;
  project: Project | undefined;
  client?: Client | null;
  overdue: boolean;
  assignee?: Person | null;
  showAssignee?: boolean;
  appHref: (path: string) => string;
}) {
  return (
    <Link
      href={appHref(`/projects/${task.project_id}`)}
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
                name={assignee?.name}
                size="xs"
                fallback="initials"
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
                overdue && "font-medium text-[var(--status-over)]",
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
  projects,
  clients,
  people,
  orgMode,
  fallbackPerson,
  defaultPersonId,
  appHref,
}: {
  assignments: {
    id: string;
    person_id: string;
    project_id: string;
    hours_per_day: number;
  }[];
  projects: Project[];
  clients: Client[];
  people: Person[];
  /** Manager / public: person filter across the org. */
  orgMode: boolean;
  fallbackPerson?: Person | null;
  defaultPersonId?: string | null;
  appHref: (path: string) => string;
}) {
  const [personFilter, setPersonFilter] = useState<string>(
    () => defaultPersonId ?? people[0]?.id ?? "",
  );

  // Keep filter valid when roster / default changes.
  const selectedPersonId = useMemo(() => {
    if (!orgMode) return defaultPersonId ?? fallbackPerson?.id ?? "";
    if (personFilter && people.some((p) => p.id === personFilter)) {
      return personFilter;
    }
    if (defaultPersonId && people.some((p) => p.id === defaultPersonId)) {
      return defaultPersonId;
    }
    return people[0]?.id ?? "";
  }, [orgMode, personFilter, people, defaultPersonId, fallbackPerson?.id]);

  const selectedPerson =
    people.find((p) => p.id === selectedPersonId) ?? fallbackPerson ?? null;

  const scoped = useMemo(() => {
    if (!orgMode) return assignments;
    if (!selectedPersonId) return [];
    return assignments.filter((a) => a.person_id === selectedPersonId);
  }, [assignments, orgMode, selectedPersonId]);

  const dayAvailable = selectedPerson
    ? dailyCapacityHours(selectedPerson)
    : 0;

  const slices = useMemo(() => {
    const byProject = new Map<
      string,
      { projectId: string; hours: number; color: string; label: string }
    >();
    for (const a of scoped) {
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
  }, [scoped, projects, clients, dayAvailable]);

  const dayBooked = useMemo(
    () => scoped.reduce((sum, a) => sum + a.hours_per_day, 0),
    [scoped],
  );

  const dayLevel = capacityLevel(
    dayBooked,
    dayAvailable,
    dayAvailable <= 0 && dayBooked <= 0,
  );

  const pieTotal = slices.reduce((s, x) => s + x.hours, 0);

  return (
    <section className={panelClass()}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Schedules</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Today&apos;s hours by project
          </p>
        </div>
        {orgMode && people.length > 0 ? (
          <label className="flex min-w-0 items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="shrink-0">Person</span>
            <select
              className={cn(inputClass, "h-8 w-auto min-w-[9rem] max-w-[14rem] py-0 text-xs")}
              value={selectedPersonId}
              onChange={(e) => setPersonFilter(e.target.value)}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {selectedPerson && dayAvailable > 0 ? (
        <div className="mb-3 border-b border-[var(--section-rule)] pb-3">
          <CapacityBar
            label={orgMode ? selectedPerson.name : "Today"}
            booked={dayBooked}
            available={dayAvailable}
            level={dayLevel}
          />
        </div>
      ) : null}

      {pieTotal <= 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Nothing scheduled today
          {orgMode && selectedPerson ? ` for ${selectedPerson.name}` : ""}.
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
                      href={appHref(`/projects/${slice.projectId}`)}
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

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** Donut segment path (angles in degrees, clockwise from 12 o'clock). */
function donutSlicePath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) {
  const sweep = endAngle - startAngle;
  if (sweep <= 0.01) return "";
  // Full ring — two semicircles (SVG can't arc a full 360 in one go).
  if (sweep >= 359.99) {
    const top = polar(cx, cy, rOuter, 0);
    const bottom = polar(cx, cy, rOuter, 180);
    const topIn = polar(cx, cy, rInner, 0);
    const bottomIn = polar(cx, cy, rInner, 180);
    return [
      `M ${top.x} ${top.y}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${bottom.x} ${bottom.y}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${top.x} ${top.y}`,
      `M ${topIn.x} ${topIn.y}`,
      `A ${rInner} ${rInner} 0 1 0 ${bottomIn.x} ${bottomIn.y}`,
      `A ${rInner} ${rInner} 0 1 0 ${topIn.x} ${topIn.y}`,
      "Z",
    ].join(" ");
  }
  const large = sweep > 180 ? 1 : 0;
  const o0 = polar(cx, cy, rOuter, startAngle);
  const o1 = polar(cx, cy, rOuter, endAngle);
  const i1 = polar(cx, cy, rInner, endAngle);
  const i0 = polar(cx, cy, rInner, startAngle);
  return [
    `M ${o0.x} ${o0.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o1.x} ${o1.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i0.x} ${i0.y}`,
    "Z",
  ].join(" ");
}

function SchedulePie({
  slices,
  totalHours,
}: {
  slices: { projectId: string; hours: number; color: string; label: string }[];
  totalHours: number;
}) {
  const total = slices.reduce((s, x) => s + x.hours, 0);
  const size = 100;
  const cx = 50;
  const cy = 50;
  const rOuter = 48;
  const rInner = 26;
  const gapDeg = slices.length > 1 ? 1.5 : 0;
  const usable = Math.max(0, 360 - gapDeg * slices.length);

  const paths: { d: string; color: string; key: string }[] = [];
  if (total > 0) {
    let cursor = 0;
    for (const slice of slices) {
      const sliceDeg = (slice.hours / total) * usable;
      const start = cursor + gapDeg / 2;
      const end = cursor + sliceDeg + gapDeg / 2;
      const d = donutSlicePath(cx, cy, rOuter, rInner, start, end);
      if (d) {
        paths.push({ d, color: slice.color, key: slice.projectId });
      }
      cursor += sliceDeg + gapDeg;
    }
  }

  return (
    <div
      className="relative size-[13rem] shrink-0 sm:size-[14.5rem]"
      role="img"
      aria-label={`Schedule pie: ${formatHours(totalHours)} booked`}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-full"
        aria-hidden
      >
        {paths.length === 0 ? (
          <circle
            cx={cx}
            cy={cy}
            r={(rOuter + rInner) / 2}
            fill="none"
            stroke="var(--border)"
            strokeWidth={rOuter - rInner}
          />
        ) : (
          paths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              fill={p.color}
              stroke="var(--bg)"
              strokeWidth={0.6}
              strokeLinejoin="round"
            />
          ))
        )}
      </svg>
      <div className="pointer-events-none absolute inset-[26%] flex flex-col items-center justify-center rounded-full bg-[var(--bg)] text-center">
        <span className="text-sm font-semibold tabular-nums tracking-tight">
          {formatHours(totalHours)}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">booked</span>
      </div>
    </div>
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
  appHref,
  compact = false,
}: {
  overdue: Task[];
  urgentByGroup: Map<TaskUrgency, Task[]>;
  highPriority: Task[];
  total: number;
  projectById: Map<string, Project>;
  clientById: Map<string, Client>;
  peopleById: Map<string, Person>;
  showAssignee?: boolean;
  appHref: (path: string) => string;
  compact?: boolean;
}) {
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
        appHref={appHref}
      />
    );
  }

  const groupsToShow = compact
    ? URGENCY_GROUPS.filter((g) => g.key !== "week")
    : URGENCY_GROUPS;

  return (
    <section className={panelClass()}>
      <div className="mb-3 flex items-center gap-2">
        <Pin size={14} className="text-[var(--text-muted)]" />
        <h2 className="text-sm font-semibold">Task Pulse</h2>
        {total > 0 ? (
          <span className="rounded-full bg-[var(--status-attention)] px-2 py-0.5 text-[11px] font-medium text-white">
            {total}
          </span>
        ) : null}
      </div>
      {total === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Nothing overdue or urgent right now.
        </p>
      ) : (
        <div className="max-h-72 space-y-3 overflow-y-auto">
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
    title: "",
    body: "",
    pinned: false,
    audience: "all",
    audience_person_ids: [],
    created_by_profile_id: profileId,
    created_at: new Date().toISOString(),
  };
}

function BulletinBoard({
  bulletins,
  profiles,
  people,
  canEdit,
  profileId,
  isUnread,
  unreadCount = 0,
  onDismissUnread,
  onSave,
  onDelete,
  newId,
  compact = false,
}: {
  bulletins: Bulletin[];
  profiles: Profile[];
  people: Person[];
  canEdit: boolean;
  profileId: string | null;
  isUnread?: (b: Bulletin) => boolean;
  unreadCount?: number;
  onDismissUnread?: (id: string) => void;
  onSave: (row: BulletinDraft) => void;
  onDelete: (id: string) => void;
  newId: (prefix: string) => string;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState<BulletinDraft | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const visible = compact ? bulletins.slice(0, 4) : bulletins.slice(0, 8);

  return (
    <section className={panelClass()}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone size={14} className="text-[var(--text-muted)]" />
          <h2 className="text-sm font-semibold">Bulletin Board</h2>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-[var(--status-attention)] px-2 py-0.5 text-[11px] font-medium text-white">
              {unreadCount}
            </span>
          ) : null}
        </div>
        {canEdit ? (
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
            return (
              <li
                key={b.id}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  unread
                    ? "border-[var(--status-attention)]/50 bg-[var(--status-attention-wash)]"
                    : b.pinned
                      ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                      : "border-[var(--border)]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      {unread ? (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-attention)]"
                          aria-label="New"
                        />
                      ) : null}
                      {b.pinned ? (
                        <Pin size={11} className="text-[var(--accent)]" />
                      ) : null}
                      {b.title}
                    </div>
                    {b.body ? (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {b.body}
                      </p>
                    ) : null}
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {b.created_at.slice(0, 10)}
                      {author ? ` · ${author.full_name}` : ""}
                      {b.audience === "people"
                        ? ` · ${b.audience_person_ids.length} people`
                        : " · Everyone"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    {unread && onDismissUnread ? (
                      <button
                        type="button"
                        className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                        aria-label="Dismiss bulletin"
                        title="Dismiss"
                        onClick={() => onDismissUnread(b.id)}
                      >
                        <X size={13} strokeWidth={2} />
                      </button>
                    ) : null}
                    {canEdit ? (
                      <>
                        <button
                          type="button"
                          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--accent)]"
                          aria-label="Edit bulletin"
                          onClick={() =>
                            setEditing({
                              id: b.id,
                              project_id: b.project_id,
                              title: b.title,
                              body: b.body,
                              pinned: b.pinned,
                              audience: b.audience,
                              audience_person_ids: [...b.audience_person_ids],
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
              <select
                className={inputClass}
                value={editing.audience}
                onChange={(e) => {
                  const audience = e.target.value === "people" ? "people" : "all";
                  setEditing({
                    ...editing,
                    audience,
                    audience_person_ids:
                      audience === "all" ? [] : editing.audience_person_ids,
                  });
                }}
              >
                <option value="all">All users</option>
                <option value="people">Selected people</option>
              </select>
            </Field>
            {editing.audience === "people" ? (
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
                    editing.audience_person_ids.length === 0
                  ) {
                    return;
                  }
                  onSave({
                    ...editing,
                    title: editing.title.trim(),
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
