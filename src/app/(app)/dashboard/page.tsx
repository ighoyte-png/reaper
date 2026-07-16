"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { LeaveMonthCalendar } from "@/components/dashboard/leave-month-calendar";
import { PageHeader } from "@/components/nav/page-header";
import { BurnBar } from "@/components/ui/burn-bar";
import { CapacityBar } from "@/components/ui/capacity-bar";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
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
import { projectDisplayColor } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";

export default function DashboardPage() {
  const { state, canManage, myPerson } = useData();
  const appHref = useAppHref();
  const now = useMemo(() => new Date(), []);
  const start = toDateKey(weekStart(now));
  const end = toDateKey(weekEnd(now));
  const monthStart = startOfMonth(now);
  const monthEndKey = toDateKey(endOfMonth(now));
  const monthStartKey = toDateKey(monthStart);

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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <PageHeader title="Dashboard" />
        <div className="space-y-4 p-5">
          {capacity ? (
            <section className="rounded-md border border-[var(--border)] p-4">
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
          <section className="rounded-md border border-[var(--border)] p-4">
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
        </div>
      </div>
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

  const leaveHorizonEnd =
    monthEndKey > end ? monthEndKey : end;
  const upcomingLeaveBlocks = state.people
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

  const monthLeave = state.leave_days.filter(
    (l) =>
      l.status === "approved" &&
      l.date >= monthStartKey &&
      l.date <= monthEndKey,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageHeader title="Dashboard" />
      <div className="grid gap-4 p-3 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-md border border-[var(--border)] p-4 md:col-span-2">
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

        <section className="rounded-md border border-[var(--border)] p-4">
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

        <section className="rounded-md border border-[var(--border)] p-4 md:col-span-2 xl:col-span-3">
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
  );
}
