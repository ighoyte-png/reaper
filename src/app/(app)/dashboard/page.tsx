"use client";

import Link from "next/link";
import { Topbar } from "@/components/nav/topbar";
import { BurnBar } from "@/components/ui/burn-bar";
import { useData } from "@/lib/data/store";
import { budgetBurn, budgetHealth, formatHours } from "@/lib/domain/budget";
import {
  capacityLevel,
  personBookedHoursInRange,
  availableHoursInRange,
} from "@/lib/domain/capacity";
import { toDateKey, weekEnd, weekStart } from "@/lib/domain/dates";
import { leaveKindLabel } from "@/lib/domain/leave";
import { cn } from "@/lib/cn";

export default function DashboardPage() {
  const { state, canManage, myPerson } = useData();
  const start = toDateKey(weekStart(new Date()));
  const end = toDateKey(weekEnd(new Date()));

  if (!canManage) {
    const mine = state.assignments.filter(
      (a) =>
        myPerson &&
        a.person_id === myPerson.id &&
        a.end_date >= start &&
        a.start_date <= end,
    );
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Topbar title="Dashboard" />
        <div className="space-y-4 p-5">
          <section className="rounded-md border border-[var(--border)] p-4">
            <h2 className="mb-2 text-sm font-semibold">This week for you</h2>
            {mine.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                Nothing scheduled this week.{" "}
                <Link href="/schedule" className="text-[var(--accent)]">
                  Open My schedule
                </Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {mine.map((a) => {
                  const project = state.projects.find(
                    (p) => p.id === a.project_id,
                  );
                  return (
                    <li
                      key={a.id}
                      className="flex justify-between gap-3 border-t border-[var(--border)] py-2 text-sm first:border-t-0"
                    >
                      <span className="font-medium">
                        {project?.name ?? "Project"}
                      </span>
                      <span className="text-[var(--text-muted)]">
                        {a.start_date} → {a.end_date} · {a.hours_per_day}h/day
                      </span>
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
    .sort((a, b) => b.booked / Math.max(b.available, 1) - a.booked / Math.max(a.available, 1));

  const upcomingLeave = state.leave_days
    .filter((l) => l.date >= start && l.status === "approved")
    .slice(0, 6);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Topbar title="Dashboard" />
      <div className="grid gap-4 p-3 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-md border border-[var(--border)] p-4 md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Budget at risk</h2>
            <Link href="/reports/budgets" className="text-xs text-[var(--accent)]">
              View budgets
            </Link>
          </div>
          {atRisk.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              All active project totals look healthy this week.
            </p>
          ) : (
            <div className="space-y-3">
              {atRisk.map(({ project, burn }) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block rounded-md border border-[var(--border)] p-3 hover:bg-[var(--row-hover)]"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: project.color }}
                    />
                    <span className="text-sm font-medium">{project.name}</span>
                    <span
                      className={cn(
                        "ml-auto text-xs",
                        budgetHealth(burn) === "over"
                          ? "text-[var(--status-over)]"
                          : "text-[var(--status-near)]",
                      )}
                    >
                      {budgetHealth(burn) === "over" ? "Over total" : "Near total"}
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
            <Link href="/schedule" className="text-xs text-[var(--accent)]">
              Open schedule
            </Link>
          </div>
          <div className="space-y-2">
            {peopleLoad.map(({ person, booked, available, level }) => (
              <div
                key={person.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      level === "healthy" && "bg-[var(--status-healthy)]",
                      level === "near" && "bg-[var(--status-near)]",
                      level === "over" && "bg-[var(--status-over)]",
                      level === "unavailable" && "bg-[var(--status-unavailable)]",
                    )}
                  />
                  <span className="truncate">{person.name}</span>
                </div>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {formatHours(booked)} / {formatHours(available)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-[var(--border)] p-4 md:col-span-2 xl:col-span-3">
          <h2 className="mb-3 text-sm font-semibold">Upcoming leave</h2>
          {upcomingLeave.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No approved leave ahead.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingLeave.map((leave) => {
                const person = state.people.find((p) => p.id === leave.person_id);
                return (
                  <div
                    key={leave.id}
                    className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <div className="font-medium">{person?.name ?? "Person"}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {leave.date} · {leaveKindLabel(leave.kind)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
