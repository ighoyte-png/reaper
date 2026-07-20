"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ProjectYearBurnChart } from "@/components/projects/monthly-retainer-chart";
import { BurnBar } from "@/components/ui/burn-bar";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import {
  assignmentHoursInMonth,
  budgetBurn,
  budgetHealth,
  calendarYearBars,
  formatHours,
  formatMoney,
  normalizeBudgetMode,
  projectPlannedAmount,
  projectPlannedHours,
} from "@/lib/domain/budget";
import { projectForecast } from "@/lib/domain/forecast";
import { projectDisplayColor } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";

export default function ProjectBudgetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const appHref = useAppHref();
  const { state } = useData();
  const project = state.projects.find((p) => p.id === params.id);
  const client = project
    ? state.clients.find((c) => c.id === project.client_id)
    : undefined;

  const year = new Date().getFullYear();

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

  const teamYear = useMemo(() => {
    if (!project) return [];
    const byPerson = new Map<
      string,
      { name: string; hours: number; revenue: number; cost: number }
    >();
    for (const a of state.assignments) {
      if (a.project_id !== project.id || a.status !== "confirmed") continue;
      const person = state.people.find((p) => p.id === a.person_id);
      if (!person) continue;
      let hours = 0;
      for (let m = 0; m < 12; m++) {
        hours += assignmentHoursInMonth(a, year, m);
      }
      if (hours <= 0) continue;
      const row = byPerson.get(person.id) ?? {
        name: person.name,
        hours: 0,
        revenue: 0,
        cost: 0,
      };
      row.hours += hours;
      row.revenue += hours * (person.bill_rate ?? 0);
      row.cost += hours * (person.cost_rate ?? 0);
      byPerson.set(person.id, row);
    }
    return [...byPerson.values()].sort((a, b) => b.hours - a.hours);
  }, [project, state.assignments, state.people, year]);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(appHref("/reports/budgets"));
    }
  }

  if (!project || !burn || !forecast) {
    return (
      <PageContainer className="overflow-y-auto">
        <PageHeader title="Budget" onBack={goBack} />
        <div className="p-5 text-sm text-[var(--text-muted)]">
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
        onBack={goBack}
        actions={
          <Link
            href={appHref(`/projects/${project.id}`)}
            className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
          >
            Project hub
          </Link>
        }
      />

      <div className="w-full space-y-6 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{
              background: projectDisplayColor(project, state.clients),
            }}
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

        <section className="rounded-md border border-[var(--border)] p-4">
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
                {mode === "amount" ? "Budget" : "Hours budget"}
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
              <dt className="text-xs text-[var(--text-muted)]">Remaining</dt>
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
                {year} Planned
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">
                {mode === "amount"
                  ? formatMoney(yearTotals.amount)
                  : formatHours(yearTotals.hours)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-md border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-semibold">{year} Calendar</h2>
          <ProjectYearBurnChart
            bars={yearBars}
            unit={chartUnit}
            monthlyCap={monthlyCap}
            year={year}
          />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-md border border-[var(--border)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Forecast</h2>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Confirmed schedule only — full project lifetime.
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">Planned hours</dt>
                <dd className="tabular-nums font-medium">
                  {formatHours(forecast.plannedHours)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">Revenue</dt>
                <dd className="tabular-nums font-medium">
                  {formatMoney(forecast.revenue)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">Cost</dt>
                <dd className="tabular-nums font-medium">
                  {formatMoney(forecast.cost)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-2">
                <dt className="text-[var(--text-muted)]">Margin</dt>
                <dd className="tabular-nums font-medium">
                  {formatMoney(forecast.margin)} ({forecast.marginPct.toFixed(0)}
                  %)
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-md border border-[var(--border)] p-4">
            <h2 className="mb-3 text-sm font-semibold">
              Team · {year}
            </h2>
            {teamYear.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No confirmed assignments in {year}.
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
                        key={row.name}
                        className="border-b border-[var(--border)]/60"
                      >
                        <td className="py-2 pr-2">{row.name}</td>
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
