"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChartColumn, ChartLine, ChevronLeft, ChevronRight } from "lucide-react";
import {
  HoursPerWeekChart,
  ProjectProgressCharts,
} from "@/components/budgets/cumulative-hours-chart";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { ProjectYearBurnChart } from "@/components/projects/monthly-retainer-chart";
import { BurnBar } from "@/components/ui/burn-bar";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { useData } from "@/lib/data/store";
import { useAppHref, resolveProjectBySlugs, useProjectHref } from "@/lib/hooks/use-app-href";
import {
  assignmentHours,
  assignmentHoursInMonth,
  budgetBurn,
  budgetHealth,
  calendarYearBars,
  formatHours,
  formatMoney,
  normalizeBudgetMode,
  projectHoursForecast,
  projectPlannedAmount,
  projectPlannedHours,
  weeklyProgressSeries,
} from "@/lib/domain/budget";
import { projectForecast } from "@/lib/domain/forecast";
import { projectDisplayColor, sortPeopleByName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";

export default function ProjectBudgetDetailPage() {
  const params = useParams<{ clientSlug: string; projectSlug: string }>();
  const router = useRouter();
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const {
    state,
    ensureProjectData,
    setActiveRealtimeProjectIds,
    dataStatus,
  } = useData();
  const project = resolveProjectBySlugs(
    state.clients,
    state.projects,
    params.clientSlug,
    params.projectSlug,
  );

  useEffect(() => {
    if (!project?.id) return;
    void ensureProjectData(project.id);
    setActiveRealtimeProjectIds([project.id]);
    return () => setActiveRealtimeProjectIds([]);
  }, [project?.id, ensureProjectData, setActiveRealtimeProjectIds]);

  const projectDataReady =
    !project?.id ||
    dataStatus.orgHeavy === "ready" ||
    dataStatus.projects[project.id] === "ready";
  const projectDataLoading =
    Boolean(project?.id) &&
    !projectDataReady &&
    dataStatus.projects[project.id] !== "error";

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [retainerTab, setRetainerTab] = useState<"calendar" | "weekly">(
    "calendar",
  );
  const client = project
    ? state.clients.find((c) => c.id === project.client_id)
    : undefined;

  const isRetainer = Boolean(project?.budget_monthly_reset);

  const burn = useMemo(
    () =>
      project
        ? budgetBurn(project, state.assignments, state.people)
        : null,
    [project, state.assignments, state.people],
  );

  const forecast = useMemo(
    () =>
      project
        ? projectForecast(project, state.assignments, state.people)
        : null,
    [project, state.assignments, state.people],
  );

  const hoursFx = useMemo(
    () =>
      project
        ? projectHoursForecast(project, state.assignments, state.people)
        : null,
    [project, state.assignments, state.people],
  );

  const yearBars = useMemo(
    () =>
      project
        ? calendarYearBars(
            project,
            state.assignments,
            state.people,
            new Date(year, 0, 1),
          )
        : [],
    [project, state.assignments, state.people, year],
  );

  const weeklyPoints = useMemo(
    () =>
      project ? weeklyProgressSeries(project, state.assignments) : [],
    [project, state.assignments],
  );

  const yearTotals = useMemo(() => {
    if (!project) return { hours: 0, amount: 0 };
    let hours = 0;
    let amount = 0;
    for (let m = 0; m < 12; m++) {
      hours += projectPlannedHours(project.id, state.assignments, false, {
        year,
        monthIndex: m,
      });
      amount += projectPlannedAmount(
        project.id,
        state.assignments,
        state.people,
        false,
        { year, monthIndex: m },
      );
    }
    return { hours, amount };
  }, [project, state.assignments, state.people, year]);

  const team = useMemo(() => {
    if (!project) return [];
    const ids = new Set<string>();
    for (const a of state.assignments) {
      if (a.project_id === project.id) ids.add(a.person_id);
    }
    for (const t of state.tasks) {
      if (t.project_id === project.id && t.assignee_person_id) {
        ids.add(t.assignee_person_id);
      }
    }
    return sortPeopleByName(state.people.filter((p) => ids.has(p.id)));
  }, [project, state.assignments, state.tasks, state.people]);

  const teamYear = useMemo(() => {
    if (!project) return [];
    const byPerson = new Map<
      string,
      {
        id: string;
        name: string;
        avatar_url: string | null;
        hours: number;
        revenue: number;
        cost: number;
      }
    >();
    for (const a of state.assignments) {
      if (a.project_id !== project.id || a.status !== "confirmed") continue;
      const person = state.people.find((p) => p.id === a.person_id);
      if (!person) continue;
      let hours = 0;
      if (isRetainer) {
        for (let m = 0; m < 12; m++) {
          hours += assignmentHoursInMonth(a, year, m);
        }
      } else {
        hours = assignmentHours(a);
      }
      if (hours <= 0) continue;
      const row = byPerson.get(person.id) ?? {
        id: person.id,
        name: person.name,
        avatar_url: person.avatar_url,
        hours: 0,
        revenue: 0,
        cost: 0,
      };
      row.hours += hours;
      row.revenue += hours * (person.bill_rate ?? 0);
      row.cost += hours * (person.cost_rate ?? 0);
      byPerson.set(person.id, row);
    }
    // Include team members with 0 hours so avatars still show
    for (const p of team) {
      if (!byPerson.has(p.id)) {
        byPerson.set(p.id, {
          id: p.id,
          name: p.name,
          avatar_url: p.avatar_url,
          hours: 0,
          revenue: 0,
          cost: 0,
        });
      }
    }
    return [...byPerson.values()].sort((a, b) => b.hours - a.hours);
  }, [project, state.assignments, state.people, year, isRetainer, team]);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(appHref("/reports/budgets"));
    }
  }

  if (project && projectDataLoading) {
    return (
      <PageContainer className="overflow-y-auto">
        <PageHeader title={project.name} onBack={goBack} />
        <div className="py-5 text-sm text-[var(--text-muted)]">Loading budget…</div>
      </PageContainer>
    );
  }

  if (!project || !burn || !forecast || !hoursFx) {
    return (
      <PageContainer className="overflow-y-auto">
        <PageHeader title="Budget" onBack={goBack} />
        <div className="py-5 text-sm text-[var(--text-muted)]">
          Project not found.{" "}
          <Link
            href={appHref("/reports/budgets")}
            className="text-[var(--accent)]"
          >
            Back to budgets
          </Link>
        </div>
      </PageContainer>
    );
  }

  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  const health = budgetHealth(burn);
  const chartUnit = mode === "amount" ? "amount" : "hours";
  const monthlyCap =
    mode === "hours" && project.budget_monthly_reset
      ? project.budget_hours ?? 0
      : undefined;

  const burnSummary =
    burn.mode === "none"
      ? `${formatHours(burn.plannedHours)} planned`
      : burn.mode === "amount"
        ? `${formatMoney(burn.plannedAmount)} / ${formatMoney(burn.totalAmount ?? 0)}`
        : `${formatHours(burn.plannedHours)} / ${formatHours(burn.totalHours)}${
            burn.overBy > 0 ? ` · ${formatHours(burn.overBy)} over` : ""
          }`;

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader
        title={
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1.5 text-sm"
          >
            <Link
              href={appHref("/reports")}
              className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Reports
            </Link>
            <span className="text-[var(--text-muted)]" aria-hidden>
              /
            </span>
            <Link
              href={appHref("/reports/budgets")}
              className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Budgets
            </Link>
            <span className="text-[var(--text-muted)]" aria-hidden>
              /
            </span>
            <span className="truncate font-semibold tracking-tight">
              {client?.name ? `${client.name} · ${project.name}` : project.name}
            </span>
          </nav>
        }
        documentTitle={
          client?.name ? `${client.name} · ${project.name}` : project.name
        }
        onBack={goBack}
        actions={
          <Link
            href={projectHref(project)}
            className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
          >
            Project Hub
          </Link>
        }
      />

      <div className="w-full space-y-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <ProjectColorBar
            color={projectDisplayColor(project, state.clients)}
          />
          <span className="text-sm text-[var(--text-muted)]">
            {client?.name ?? "No client"} ·{" "}
            {project.status.replace("_", " ")}
            {project.start_date || project.end_date
              ? ` · ${
                  project.start_date
                    ? format(parseISO(project.start_date), "MMM d, yyyy")
                    : "…"
                } – ${
                  project.end_date
                    ? format(parseISO(project.end_date), "MMM d, yyyy")
                    : "…"
                }`
              : null}
          </span>
          <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
            {mode === "none"
              ? "No budget"
              : mode === "amount"
                ? "Dollar budget"
                : project.budget_monthly_reset
                  ? "Monthly hours"
                  : "Hours budget"}
          </span>
        </div>

        <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Budget Burn</h2>
          <p
            className={cn(
              "mb-2 text-sm tabular-nums",
              health === "over" && "text-[var(--status-over)]",
              health === "near" && "text-[var(--status-near)]",
              (health === "healthy" || health === "none") &&
                "text-[var(--text-muted)]",
            )}
          >
            {burnSummary}
            {project.budget_monthly_reset ? " · this month" : ""}
          </p>
          <BurnBar burn={burn} />
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[var(--text-muted)]">
                Hours used to date
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">
                {formatHours(hoursFx.hoursUsedToDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">
                Future hours planned
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">
                {formatHours(hoursFx.hoursFuturePlanned)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">
                Hours remaining
              </dt>
              <dd
                className={cn(
                  "mt-0.5 text-sm font-medium tabular-nums",
                  hoursFx.overBudget && "text-[var(--status-over)]",
                )}
              >
                {hoursFx.hoursRemaining == null
                  ? "—"
                  : formatHours(hoursFx.hoursRemaining)}
              </dd>
            </div>
          </dl>
          <dl className="mt-3 grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[var(--text-muted)]">
                {mode === "amount" ? "Budget $" : "Budget"}
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">
                {mode === "none"
                  ? "—"
                  : mode === "amount"
                    ? formatMoney(burn.totalAmount ?? 0)
                    : formatHours(burn.totalHours)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">
                {mode === "amount" ? "$ remaining" : "Budget remaining"}
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">
                {mode === "none"
                  ? "—"
                  : mode === "amount"
                    ? formatMoney(burn.remainingAmount ?? 0)
                    : formatHours(burn.remainingHours)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">
                {isRetainer ? `${year} planned` : "Total planned"}
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">
                {isRetainer
                  ? mode === "amount"
                    ? formatMoney(yearTotals.amount)
                    : formatHours(yearTotals.hours)
                  : formatHours(hoursFx.hoursTotalPlanned)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
          {isRetainer ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRetainerTab("calendar")}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                      retainerTab === "calendar"
                        ? "border-[var(--text-muted)] bg-[var(--bg)] text-[var(--text)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
                    )}
                  >
                    <ChartLine size={14} strokeWidth={2} />
                    {year} Calendar
                  </button>
                  <button
                    type="button"
                    onClick={() => setRetainerTab("weekly")}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                      retainerTab === "weekly"
                        ? "border-[var(--text-muted)] bg-[var(--bg)] text-[var(--text)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
                    )}
                  >
                    <ChartColumn size={14} strokeWidth={2} />
                    Hours per week
                  </button>
                </div>
                {retainerTab === "calendar" ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--row-hover)]"
                      onClick={() => setYear((y) => y - 1)}
                      aria-label="Previous year"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--row-hover)]"
                      onClick={() => setYear((y) => y + 1)}
                      aria-label="Next year"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                ) : null}
              </div>
              {retainerTab === "calendar" ? (
                <ProjectYearBurnChart
                  bars={yearBars}
                  unit={chartUnit}
                  monthlyCap={monthlyCap}
                  year={year}
                />
              ) : weeklyPoints.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No schedule dates to chart yet.
                </p>
              ) : (
                <HoursPerWeekChart points={weeklyPoints} />
              )}
            </>
          ) : (
            <ProjectProgressCharts
              points={weeklyPoints}
              budgetHours={project.budget_hours ?? null}
            />
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Forecast vs budget</h2>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Schedule hours and margin against the project budget.
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">Hours used</dt>
                <dd className="tabular-nums font-medium">
                  {formatHours(forecast.hoursUsedToDate)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">Future planned</dt>
                <dd className="tabular-nums font-medium">
                  {formatHours(forecast.hoursFuturePlanned)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">Remaining hours</dt>
                <dd
                  className={cn(
                    "tabular-nums font-medium",
                    forecast.overBudget && "text-[var(--status-over)]",
                  )}
                >
                  {forecast.hoursRemaining == null
                    ? "—"
                    : formatHours(forecast.hoursRemaining)}
                </dd>
              </div>
              {forecast.budgetMargin != null ? (
                <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-2">
                  <dt className="text-[var(--text-muted)]">
                    Margin vs budget
                  </dt>
                  <dd
                    className={cn(
                      "tabular-nums font-medium",
                      forecast.budgetMargin < 0 && "text-[var(--status-over)]",
                    )}
                  >
                    {mode === "amount"
                      ? formatMoney(forecast.budgetMargin)
                      : formatMoney(forecast.budgetMargin)}
                    {forecast.budgetMarginPct != null
                      ? ` (${forecast.budgetMarginPct.toFixed(0)}%)`
                      : ""}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-2 text-xs">
                <dt className="text-[var(--text-muted)]">
                  Rate revenue / cost
                </dt>
                <dd className="tabular-nums text-[var(--text-muted)]">
                  {formatMoney(forecast.revenue)} / {formatMoney(forecast.cost)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 text-xs">
                <dt className="text-[var(--text-muted)]">Rate margin</dt>
                <dd className="tabular-nums text-[var(--text-muted)]">
                  {formatMoney(forecast.margin)} ({forecast.marginPct.toFixed(0)}
                  %)
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <h2 className="mb-3 text-sm font-semibold">
              Team{isRetainer ? ` · ${year}` : ""}
            </h2>
            {teamYear.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No one assigned yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[20rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                      <th className="pb-2 font-medium">Person</th>
                      <th className="pb-2 text-right font-medium">Hours</th>
                      <th className="pb-2 text-right font-medium">Revenue</th>
                      <th className="pb-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamYear.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[var(--border)]/60"
                      >
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2">
                            <PersonAvatar
                              avatarUrl={row.avatar_url}
                              name={row.name}
                              size="xs"
                              fallback="initials"
                            />
                            <span className="min-w-0 truncate">{row.name}</span>
                          </div>
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatHours(row.hours)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatMoney(row.revenue)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatMoney(row.cost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </PageContainer>
  );
}
