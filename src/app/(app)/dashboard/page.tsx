"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Megaphone, Pin } from "lucide-react";
import { LeaveMonthCalendar } from "@/components/dashboard/leave-month-calendar";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { BurnBar } from "@/components/ui/burn-bar";
import { CapacityBar } from "@/components/ui/capacity-bar";
import { inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { useViewAs } from "@/lib/view-as";
import { budgetBurn, budgetHealth, formatHours } from "@/lib/domain/budget";
import {
  capacityLevel,
  personBookedHoursInRange,
  availableHoursInRange,
} from "@/lib/domain/capacity";
import {
  endOfMonth,
  startOfMonth,
  toDateKey,
  weekEnd,
  weekStart,
} from "@/lib/domain/dates";
import { leaveBlockLabel } from "@/lib/domain/leave";
import { leaveBlocksInRange } from "@/lib/domain/leave-blocks";
import { projectDisplayColor, sortPeopleByName } from "@/lib/domain/sorting";
import { taskUrgency, type TaskUrgency } from "@/lib/domain/tasks";
import { cn } from "@/lib/cn";
import type { Bulletin, Profile, Project, Task } from "@/lib/types";

const URGENCY_GROUPS: { key: TaskUrgency; label: string }[] = [
  { key: "today", label: "Due today" },
  { key: "tomorrow", label: "Due tomorrow" },
  { key: "three_days", label: "Due in 3 days" },
  { key: "week", label: "Due this week" },
];

export default function DashboardPage() {
  const { state, canManage, myPerson } = useData();
  const appHref = useAppHref();
  const {
    viewAsPersonId,
    setViewAsPersonId,
    viewedPerson: viewAsPerson,
    showingAsManager,
    effectivePersonId,
  } = useViewAs();
  const now = useMemo(() => new Date(), []);
  const todayKey = toDateKey(now);
  const start = toDateKey(weekStart(now));
  const end = toDateKey(weekEnd(now));
  const monthStart = startOfMonth(now);
  const monthEndKey = toDateKey(endOfMonth(now));
  const monthStartKey = toDateKey(monthStart);

  const showingAllTasks = showingAsManager;
  const viewedPersonId = effectivePersonId;
  const viewedPerson =
    viewAsPerson ??
    (viewedPersonId
      ? state.people.find((p) => p.id === viewedPersonId) ?? null
      : null);

  const projectById = useMemo(
    () => new Map(state.projects.map((p) => [p.id, p])),
    [state.projects],
  );

  const scopedTasks = useMemo(() => {
    if (showingAllTasks) return state.tasks;
    if (!viewedPersonId) return [];
    return state.tasks.filter((t) => t.assignee_person_id === viewedPersonId);
  }, [state.tasks, showingAllTasks, viewedPersonId]);

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

  const urgentTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of urgentByGroup.values()) {
      for (const t of list) ids.add(t.id);
    }
    return ids;
  }, [urgentByGroup]);

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

  const pinnedTotal =
    overdueTasks.length +
    [...urgentByGroup.values()].reduce((sum, l) => sum + l.length, 0) +
    highPriorityTasks.length;

  const bulletins = useMemo(
    () =>
      [...state.bulletins].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.created_at.localeCompare(a.created_at);
      }),
    [state.bulletins],
  );

  const todaysAssignments = useMemo(() => {
    if (!viewedPersonId) return [];
    return state.assignments.filter(
      (a) =>
        a.person_id === viewedPersonId &&
        a.start_date <= todayKey &&
        a.end_date >= todayKey,
    );
  }, [state.assignments, viewedPersonId, todayKey]);

  const memberAssignments = useMemo(() => {
    if (!myPerson) return [];
    return state.assignments.filter(
      (a) =>
        a.person_id === myPerson.id &&
        a.end_date >= start &&
        a.start_date <= end,
    );
  }, [state.assignments, myPerson, start, end]);

  if (!canManage) {
    const capacity = myPerson
      ? (() => {
          const booked = personBookedHoursInRange(
            myPerson.id,
            start,
            end,
            state.assignments,
            state.leave_days,
          );
          const available = availableHoursInRange(
            myPerson,
            start,
            end,
            state.leave_days,
          );
          return {
            booked,
            available,
            level: capacityLevel(booked, available, available <= 0),
          };
        })()
      : null;

    return (
      <PageContainer className="overflow-y-auto">
        <PageHeader title="Dashboard" />
        <div className="space-y-4 p-5">
          <TaskPulse
            overdue={overdueTasks}
            urgentByGroup={urgentByGroup}
            highPriority={highPriorityTasks}
            total={pinnedTotal}
            projectById={projectById}
            appHref={appHref}
          />

          {capacity ? (
            <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">This week&apos;s load</h2>
                <Link
                  href={appHref("/schedule")}
                  className="text-xs text-[var(--accent)]"
                >
                  Open schedule
                </Link>
              </div>
              <CapacityBar
                label="You"
                booked={capacity.booked}
                available={capacity.available}
                level={capacity.level}
              />
            </section>
          ) : null}

          <TodaySchedule
            assignments={todaysAssignments}
            projects={state.projects}
            clients={state.clients}
            appHref={appHref}
          />

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <h2 className="mb-3 text-sm font-semibold">This week for you</h2>
            {memberAssignments.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Nothing scheduled this week.{" "}
                <Link
                  href={appHref("/schedule")}
                  className="text-[var(--accent)]"
                >
                  Open My schedule
                </Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {memberAssignments.map((a) => {
                  const project = state.projects.find(
                    (p) => p.id === a.project_id,
                  );
                  const color = project
                    ? projectDisplayColor(project, state.clients)
                    : "#64748B";
                  const client = project?.client_id
                    ? state.clients.find((c) => c.id === project.client_id)
                    : undefined;
                  return (
                    <li
                      key={a.id}
                      className="rounded-md border border-[var(--border)] p-3"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {project?.name ?? "Project"}
                          </div>
                          {client ? (
                            <div className="truncate text-xs text-[var(--text-muted)]">
                              {client.name}
                            </div>
                          ) : null}
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)]"
                              style={{
                                width: `${Math.min(100, (a.hours_per_day / 8) * 100)}%`,
                                background: color,
                              }}
                            />
                          </div>
                          <div className="mt-1 text-xs text-[var(--text-muted)]">
                            {a.start_date} → {a.end_date} ·{" "}
                            {formatHours(a.hours_per_day)}/day
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <BulletinBoard bulletins={bulletins} profiles={state.profiles} />
        </div>
      </PageContainer>
    );
  }

  const atRisk = state.projects
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
    .sort((a, b) => b.burn.pct - a.burn.pct);

  const peopleLoad = state.people
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

  const leaveHorizonEnd = monthEndKey > end ? monthEndKey : end;
  const upcomingLeaveBlocks = state.people
    .flatMap((person) =>
      leaveBlocksInRange(state.leave_days, person.id, start, leaveHorizonEnd),
    )
    .filter((b) => b.end_date >= start)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 12);

  const monthLeave = state.leave_days.filter(
    (l) =>
      l.status === "approved" &&
      l.date >= monthStartKey &&
      l.date <= monthEndKey,
  );

  const sortedPeople = sortPeopleByName(state.people);

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title="Dashboard" />
      <div className="space-y-4 p-3 sm:p-5">
        <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Admin: View as user</h2>
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
          <select
            className={cn(inputClass, "mt-0 max-w-xs")}
            value={viewAsPersonId ?? ""}
            onChange={(e) => setViewAsPersonId(e.target.value || null)}
          >
            <option value="">All (org-wide view)</option>
            {sortedPeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {viewedPerson ? (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Viewing tasks and schedule as{" "}
              <span className="font-medium text-[var(--text)]">
                {viewedPerson.name}
              </span>
              .
            </p>
          ) : null}
        </section>

        <TaskPulse
          overdue={overdueTasks}
          urgentByGroup={urgentByGroup}
          highPriority={highPriorityTasks}
          total={pinnedTotal}
          projectById={projectById}
          appHref={appHref}
        />

        {viewedPerson ? (
          <TodaySchedule
            assignments={todaysAssignments}
            projects={state.projects}
            clients={state.clients}
            appHref={appHref}
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 md:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Budget at risk</h2>
              <Link
                href={appHref("/reports/budgets")}
                className="text-xs text-[var(--accent)]"
              >
                View budgets
              </Link>
            </div>
            {atRisk.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                All active project totals look healthy this week.
              </p>
            ) : (
              <div className="space-y-3">
                {atRisk.map(({ project, burn, client }) => (
                  <Link
                    key={project.id}
                    href={appHref(`/projects/${project.id}`)}
                    className="block rounded-md border border-[var(--border)] p-3 hover:bg-[var(--row-hover)]"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          background: projectDisplayColor(
                            project,
                            state.clients,
                          ),
                        }}
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
                        {budgetHealth(burn) === "over"
                          ? "Over total"
                          : "Near total"}
                      </span>
                    </div>
                    <BurnBar burn={burn} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">This week&apos;s load</h2>
              <Link
                href={appHref("/schedule")}
                className="text-xs text-[var(--accent)]"
              >
                Open schedule
              </Link>
            </div>
            <div className="space-y-3">
              {peopleLoad.map(({ person, booked, available, level }) => (
                <CapacityBar
                  key={person.id}
                  label={person.name}
                  booked={booked}
                  available={available}
                  level={level}
                />
              ))}
            </div>
          </section>

          <BulletinBoard bulletins={bulletins} profiles={state.profiles} />

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 md:col-span-2 xl:col-span-3">
            <h2 className="mb-3 text-sm font-semibold">Upcoming leave</h2>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_1fr]">
              <LeaveMonthCalendar month={monthStart} leaveDays={monthLeave} />
              <div>
                {upcomingLeaveBlocks.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    No approved leave ahead.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {upcomingLeaveBlocks.map((block) => {
                      const person = state.people.find(
                        (p) => p.id === block.person_id,
                      );
                      const rangeLabel =
                        block.start_date === block.end_date
                          ? format(parseISO(block.start_date), "MMM d")
                          : `${format(parseISO(block.start_date), "MMM d")} – ${format(parseISO(block.end_date), "MMM d")}`;
                      return (
                        <div
                          key={`${block.id}-${block.start_date}`}
                          className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                        >
                          <div className="font-medium">
                            {person?.name ?? "Person"}
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                            {rangeLabel} ·{" "}
                            {leaveBlockLabel(block.kind, block.hours_per_day)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageContainer>
  );
}

function TaskRow({
  task,
  project,
  overdue,
  appHref,
}: {
  task: Task;
  project: Project | undefined;
  overdue: boolean;
  appHref: (path: string) => string;
}) {
  return (
    <Link
      href={appHref(`/projects/${task.project_id}`)}
      className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--row-hover)]"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: project?.color ?? "#64748B" }}
      />
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      <span className="shrink-0 truncate text-xs text-[var(--text-muted)]">
        {project?.name ?? "Project"}
      </span>
      {task.due_date ? (
        <span
          className={cn(
            "shrink-0 text-xs",
            overdue
              ? "font-medium text-[var(--status-over)]"
              : "text-[var(--text-muted)]",
          )}
        >
          {overdue ? "Overdue" : task.due_date}
        </span>
      ) : null}
    </Link>
  );
}

function TaskPulse({
  overdue,
  urgentByGroup,
  highPriority,
  total,
  projectById,
  appHref,
}: {
  overdue: Task[];
  urgentByGroup: Map<TaskUrgency, Task[]>;
  highPriority: Task[];
  total: number;
  projectById: Map<string, Project>;
  appHref: (path: string) => string;
}) {
  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Pin size={14} className="text-[var(--text-muted)]" />
        <h2 className="text-sm font-semibold">Task pulse</h2>
        {total > 0 ? (
          <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
            {total}
          </span>
        ) : null}
      </div>
      {total === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Nothing overdue or urgent right now.
        </p>
      ) : (
        <div className="space-y-3">
          {overdue.length > 0 ? (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--status-over)]">
                <AlertTriangle size={12} />
                Overdue
              </div>
              <div className="space-y-1.5">
                {overdue.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    project={projectById.get(t.project_id)}
                    overdue
                    appHref={appHref}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {URGENCY_GROUPS.map(({ key, label }) => {
            const tasks = urgentByGroup.get(key);
            if (!tasks || tasks.length === 0) return null;
            return (
              <div key={key}>
                <div className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                  {label}
                </div>
                <div className="space-y-1.5">
                  {tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      project={projectById.get(t.project_id)}
                      overdue={false}
                      appHref={appHref}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {highPriority.length > 0 ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                High priority
              </div>
              <div className="space-y-1.5">
                {highPriority.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    project={projectById.get(t.project_id)}
                    overdue={false}
                    appHref={appHref}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function BulletinBoard({
  bulletins,
  profiles,
}: {
  bulletins: Bulletin[];
  profiles: Profile[];
}) {
  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Megaphone size={14} className="text-[var(--text-muted)]" />
        <h2 className="text-sm font-semibold">Bulletin board</h2>
      </div>
      {bulletins.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No announcements yet.</p>
      ) : (
        <ul className="space-y-2">
          {bulletins.slice(0, 8).map((b) => {
            const author = profiles.find(
              (p) => p.id === b.created_by_profile_id,
            );
            return (
              <li
                key={b.id}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  b.pinned
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                    : "border-[var(--border)]",
                )}
              >
                <div className="flex items-center gap-1.5 font-medium">
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TodaySchedule({
  assignments,
  projects,
  clients,
  appHref,
}: {
  assignments: {
    id: string;
    project_id: string;
    hours_per_day: number;
  }[];
  projects: Project[];
  clients: { id: string; name: string; color: string }[];
  appHref: (path: string) => string;
}) {
  return (
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
      <h2 className="mb-3 text-sm font-semibold">Today&apos;s schedule</h2>
      {assignments.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Nothing scheduled today.
        </p>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => {
            const project = projects.find((p) => p.id === a.project_id);
            const client = project?.client_id
              ? clients.find((c) => c.id === project.client_id)
              : undefined;
            const color = project
              ? projectDisplayColor(project, clients)
              : "#64748B";
            return (
              <li key={a.id}>
                <Link
                  href={appHref(`/projects/${a.project_id}`)}
                  className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--row-hover)]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {project?.name ?? "Project"}
                  </span>
                  {client ? (
                    <span className="shrink-0 truncate text-xs text-[var(--text-muted)]">
                      {client.name}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">
                    {formatHours(a.hours_per_day)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
