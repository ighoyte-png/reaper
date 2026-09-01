"use client";

import Link from "next/link";
import { BurnBar } from "@/components/ui/burn-bar";
import { panelClass } from "@/components/ui/panel";
import { ProjectYearBurnChart } from "@/components/projects/monthly-retainer-chart";
import { useData } from "@/lib/data/store";
import {
  useMonthlyRetainerYearBarsMap,
  useProjectBurnsMap,
} from "@/lib/hooks/use-aggregates";
import {
  budgetBurn,
  budgetHealth,
  calendarYearBars,
  formatHours,
  formatMoney,
  isMonthlyRetainerBudget,
  normalizeBudgetMode,
  projectHoursForecast,
  type MonthBurnBar,
  type ProjectHoursForecast,
} from "@/lib/domain/budget";
import { cn } from "@/lib/cn";
import type { BudgetBurn, Project } from "@/lib/types";
import { projectCurrency } from "@/lib/domain/currency";
import { CurrencyChip } from "@/components/ui/currency-chip";

function forecastFromBurn(
  project: Project,
  burn: ReturnType<typeof budgetBurn>,
): ProjectHoursForecast {
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  return {
    hoursUsedToDate: burn.usedHours,
    hoursFuturePlanned: burn.futureHours,
    hoursTotalPlanned: burn.plannedHours,
    hoursRemaining: mode === "hours" ? burn.remainingHours : null,
    overBudget: mode === "hours" ? burn.overBy > 0 : burn.amountOverBy > 0,
    mode,
  };
}

function Pulse({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded bg-[var(--bg-elevated)]",
        className,
      )}
    />
  );
}

/** Skeleton matching BudgetCard layout while org burns/month bars load. */
export function BudgetCardSkeleton({
  showName = true,
  monthly = false,
}: {
  showName?: boolean;
  monthly?: boolean;
}) {
  return (
    <div
      className={panelClass({
        className: "flex flex-col",
      })}
      aria-busy="true"
      aria-label="Loading budget"
    >
      <div
        className={cn(
          "mb-3 flex min-w-0 items-center gap-2",
          !showName && "justify-end",
        )}
      >
        {showName ? <Pulse className="h-4 w-40 max-w-[55%]" /> : null}
        <Pulse className="ml-auto h-5 w-16 shrink-0" />
      </div>
      <div className="mt-auto space-y-3">
        <div className="space-y-2">
          <Pulse className="h-3 w-28" />
          {monthly ? (
            <Pulse className="h-24 w-full" />
          ) : (
            <Pulse className="h-3.5 w-full rounded-full" />
          )}
        </div>
        <div className="space-y-2 border-t border-[var(--border)] pt-3">
          <Pulse className="h-3 w-16" />
          <Pulse className="h-3 w-full" />
          <Pulse className="h-3 w-full" />
          <Pulse className="h-3 w-48 max-w-full" />
        </div>
      </div>
    </div>
  );
}

export function BudgetCard({
  project,
  href,
  showName = true,
  burns,
  burnsReady,
  barsByProject,
  barsReady,
}: {
  project: Project;
  href?: string;
  showName?: boolean;
  burns?: Map<string, BudgetBurn>;
  burnsReady?: boolean;
  barsByProject?: Map<string, MonthBurnBar[]>;
  barsReady?: boolean;
}) {
  const mapsProvided =
    burns != null &&
    burnsReady != null &&
    barsByProject != null &&
    barsReady != null;
  if (mapsProvided) {
    return (
      <BudgetCardView
        project={project}
        href={href}
        showName={showName}
        burns={burns}
        burnsReady={burnsReady}
        barsByProject={barsByProject}
        barsReady={barsReady}
      />
    );
  }
  return (
    <BudgetCardWithHooks
      project={project}
      href={href}
      showName={showName}
    />
  );
}

function BudgetCardWithHooks({
  project,
  href,
  showName = true,
}: {
  project: Project;
  href?: string;
  showName?: boolean;
}) {
  const year = new Date().getFullYear();
  const { burns, ready: burnsReady } = useProjectBurnsMap();
  const { barsByProject, ready: barsReady } =
    useMonthlyRetainerYearBarsMap(year);
  return (
    <BudgetCardView
      project={project}
      href={href}
      showName={showName}
      burns={burns}
      burnsReady={burnsReady}
      barsByProject={barsByProject}
      barsReady={barsReady}
    />
  );
}

function BudgetCardView({
  project,
  href,
  showName = true,
  burns,
  burnsReady,
  barsByProject,
  barsReady,
}: {
  project: Project;
  href?: string;
  showName?: boolean;
  burns: Map<string, BudgetBurn>;
  burnsReady: boolean;
  barsByProject: Map<string, MonthBurnBar[]>;
  barsReady: boolean;
}) {
  const { state, dataStatus } = useData();
  const year = new Date().getFullYear();
  const membersForProject = state.project_members.filter(
    (m) => m.project_id === project.id,
  );
  const expensesForProject = state.project_contractor_expenses.filter(
    (e) => e.project_id === project.id,
  );
  const projectReady = dataStatus.projects[project.id] === "ready";
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  const isMonthlyRetainer = isMonthlyRetainerBudget(project);
  const metricsLoading =
    !burnsReady ||
    (isMonthlyRetainer && !projectReady && !barsReady);

  if (metricsLoading) {
    const skeleton = (
      <BudgetCardSkeleton showName={showName} monthly={isMonthlyRetainer} />
    );
    if (href) {
      return (
        <Link
          id={`project-card-${project.id}`}
          href={href}
          className="block transition-opacity hover:opacity-90"
          aria-busy="true"
        >
          {skeleton}
        </Link>
      );
    }
    return skeleton;
  }

  const burn =
    burns.get(project.id) ??
    budgetBurn(
      project,
      state.assignments,
      state.people,
      false,
      new Date(),
      membersForProject,
      expensesForProject,
      state.organization_settings,
    );
  const health = budgetHealth(burn, state.organization_settings);
  const hoursFx = projectReady
    ? projectHoursForecast(
        project,
        state.assignments,
        state.people,
        new Date(),
        state.organization_settings,
      )
    : forecastFromBurn(project, burn);
  const showHoursMetrics = mode === "hours";
  const showAmountMetrics = mode === "amount";
  const yearBars = isMonthlyRetainer
    ? (barsByProject.get(project.id) ??
      (projectReady
        ? calendarYearBars(
            project,
            state.assignments,
            state.people,
            year,
            new Date(),
            membersForProject,
            expensesForProject,
            state.organization_settings,
          )
        : []))
    : [];

  const settings = state.organization_settings;
  const moneyCur = projectCurrency(project, settings.currency_enabled);
  const money = (n: number) =>
    formatMoney(n, moneyCur, settings.currency_enabled);
  const showCurrencyChip =
    settings.currency_enabled &&
    (burn.mode === "amount" || burn.mode === "hours");

  const summary =
    burn.mode === "none"
      ? formatHours(burn.plannedHours)
      : burn.mode === "amount"
        ? `${money(burn.plannedAmount)} / ${money(burn.totalAmount ?? 0)}`
        : `${formatHours(burn.plannedHours)} / ${formatHours(burn.totalHours)}${
            burn.overBy > 0 ? ` · ${formatHours(burn.overBy)} over` : ""
          }`;

  const body = (
    <>
      <div
        className={cn(
          "mb-3 flex min-w-0 items-center gap-2",
          !showName && "justify-end",
        )}
      >
        {showName ? (
          <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
            {project.name}
          </div>
        ) : null}
        <span className="shrink-0 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
          {burn.mode === "none"
            ? "No Budget"
            : burn.mode === "amount"
              ? project.budget_monthly_reset
                ? "Monthly Amount"
                : "Dollar"
              : project.budget_monthly_reset
                ? "Monthly Hours"
                : "Hours"}
        </span>
        {showCurrencyChip ? <CurrencyChip currency={moneyCur} /> : null}
      </div>
      <div className="mt-auto space-y-3">
        <div>
          <div
            className={cn(
              "mb-1.5 text-xs tabular-nums",
              health === "over" && "text-[var(--status-over)]",
              health === "near" && "text-[var(--status-near)]",
              (health === "healthy" || health === "none") &&
                "text-[var(--text-muted)]",
            )}
          >
            {summary}
            {isMonthlyRetainer ? " · this month" : ""}
          </div>
          {isMonthlyRetainer ? (
            <ProjectYearBurnChart
              bars={yearBars}
              unit={mode === "amount" ? "amount" : "hours"}
              monthlyCap={
                mode === "amount"
                  ? project.budget_amount ?? 0
                  : project.budget_hours ?? 0
              }
              year={year}
              compact
              interactive={false}
            />
          ) : (
            <BurnBar
              burn={burn}
              compact
              settings={state.organization_settings}
              currency={moneyCur}
            />
          )}
        </div>
        <div className="border-t border-[var(--border)] pt-3">
          <div className="mb-2 text-xs font-semibold text-[var(--text)]">
            Forecast
          </div>
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">
                {showAmountMetrics ? "Spend to Date" : "Hours Used"}
              </dt>
              <dd className="tabular-nums font-medium">
                {showHoursMetrics
                  ? formatHours(hoursFx.hoursUsedToDate)
                  : showAmountMetrics
                    ? money(burn.usedAmount)
                    : formatHours(hoursFx.hoursUsedToDate)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">Future Planned</dt>
              <dd className="tabular-nums font-medium">
                {showHoursMetrics
                  ? formatHours(hoursFx.hoursFuturePlanned)
                  : showAmountMetrics
                    ? money(burn.futureAmount)
                    : formatHours(hoursFx.hoursFuturePlanned)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-muted)]">
                {showAmountMetrics ? "Budget Remaining" : "Remaining"}
              </dt>
              <dd
                className={cn(
                  "tabular-nums font-medium",
                  (burn.overBy > 0 || burn.amountOverBy > 0) &&
                    "text-[var(--status-over)]",
                )}
              >
                {showHoursMetrics
                  ? burn.remainingHours == null
                    ? "—"
                    : formatHours(burn.remainingHours)
                  : showAmountMetrics
                    ? burn.remainingAmount == null
                      ? "—"
                      : money(burn.remainingAmount)
                    : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </>
  );

  const className = panelClass({
    className: "flex flex-col transition-colors",
  });

  if (href) {
    return (
      <Link
        id={`project-card-${project.id}`}
        href={href}
        className={cn(className, "hover:bg-[var(--row-hover)]")}
      >
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

function budgetModeLabel(
  mode: ReturnType<typeof normalizeBudgetMode>,
  monthlyReset: boolean | null | undefined,
): string {
  if (mode === "none") return "No Budget";
  if (mode === "amount") return monthlyReset ? "Monthly Amount" : "Dollar";
  return monthlyReset ? "Monthly Hours" : "Hours";
}

/** Numbers-only list row for the budgets report (no burn chart / bar). */
export function BudgetListRow({
  project,
  href,
  burns,
  burnsReady,
}: {
  project: Project;
  href: string;
  burns?: Map<string, BudgetBurn>;
  burnsReady?: boolean;
}) {
  const mapsProvided = burns != null && burnsReady != null;
  if (mapsProvided) {
    return (
      <BudgetListRowView
        project={project}
        href={href}
        burns={burns}
        burnsReady={burnsReady}
      />
    );
  }
  return <BudgetListRowWithHooks project={project} href={href} />;
}

function BudgetListRowWithHooks({
  project,
  href,
}: {
  project: Project;
  href: string;
}) {
  const { burns, ready: burnsReady } = useProjectBurnsMap();
  return (
    <BudgetListRowView
      project={project}
      href={href}
      burns={burns}
      burnsReady={burnsReady}
    />
  );
}

function BudgetListRowView({
  project,
  href,
  burns,
  burnsReady,
}: {
  project: Project;
  href: string;
  burns: Map<string, BudgetBurn>;
  burnsReady: boolean;
}) {
  const { state, dataStatus } = useData();
  const membersForProject = state.project_members.filter(
    (m) => m.project_id === project.id,
  );
  const expensesForProject = state.project_contractor_expenses.filter(
    (e) => e.project_id === project.id,
  );
  const projectReady = dataStatus.projects[project.id] === "ready";
  const mode = normalizeBudgetMode(
    project.budget_mode,
    project.budget_hours,
    project.budget_amount,
  );
  const isMonthlyRetainer = isMonthlyRetainerBudget(project);
  const metricsLoading = !burnsReady;

  if (metricsLoading) {
    return (
      <Link
        href={href}
        className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0 hover:bg-[var(--row-hover)]"
        aria-busy="true"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Pulse className="h-4 w-40 max-w-[55%]" />
          <Pulse className="h-3 w-56 max-w-full" />
        </div>
      </Link>
    );
  }

  const burn =
    burns.get(project.id) ??
    budgetBurn(
      project,
      state.assignments,
      state.people,
      false,
      new Date(),
      membersForProject,
      expensesForProject,
      state.organization_settings,
    );
  const health = budgetHealth(burn, state.organization_settings);
  const hoursFx = projectReady
    ? projectHoursForecast(
        project,
        state.assignments,
        state.people,
        new Date(),
        state.organization_settings,
      )
    : forecastFromBurn(project, burn);
  const showHoursMetrics = mode === "hours";
  const showAmountMetrics = mode === "amount";
  const settings = state.organization_settings;
  const moneyCur = projectCurrency(project, settings.currency_enabled);
  const money = (n: number) =>
    formatMoney(n, moneyCur, settings.currency_enabled);
  const showCurrencyChip =
    settings.currency_enabled &&
    (burn.mode === "amount" || burn.mode === "hours");

  const summary =
    burn.mode === "none"
      ? formatHours(burn.plannedHours)
      : burn.mode === "amount"
        ? `${money(burn.plannedAmount)} / ${money(burn.totalAmount ?? 0)}`
        : `${formatHours(burn.plannedHours)} / ${formatHours(burn.totalHours)}${
            burn.overBy > 0 ? ` · ${formatHours(burn.overBy)} over` : ""
          }`;

  const usedLabel = showAmountMetrics
    ? money(burn.usedAmount)
    : formatHours(hoursFx.hoursUsedToDate);
  const futureLabel = showAmountMetrics
    ? money(burn.futureAmount)
    : formatHours(hoursFx.hoursFuturePlanned);
  const remainingLabel = showHoursMetrics
    ? burn.remainingHours == null
      ? "—"
      : formatHours(burn.remainingHours)
    : showAmountMetrics
      ? burn.remainingAmount == null
        ? "—"
        : money(burn.remainingAmount)
      : "—";

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 last:border-b-0 hover:bg-[var(--row-hover)]",
        project.status === "archived" && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold leading-tight">
            {project.name}
          </span>
          <span className="shrink-0 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
            {budgetModeLabel(mode, project.budget_monthly_reset)}
          </span>
          {showCurrencyChip ? <CurrencyChip currency={moneyCur} /> : null}
        </div>
        <div
          className={cn(
            "mt-0.5 text-xs tabular-nums",
            health === "over" && "text-[var(--status-over)]",
            health === "near" && "text-[var(--status-near)]",
            (health === "healthy" || health === "none") &&
              "text-[var(--text-muted)]",
          )}
        >
          {summary}
          {isMonthlyRetainer ? " · this month" : ""}
        </div>
        {burn.mode !== "none" ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
            <span className="tabular-nums">
              {showAmountMetrics ? "Spend" : "Used"} {usedLabel}
            </span>
            <span className="tabular-nums">Future {futureLabel}</span>
            <span
              className={cn(
                "tabular-nums",
                (burn.overBy > 0 || burn.amountOverBy > 0) &&
                  "text-[var(--status-over)]",
              )}
            >
              Remaining {remainingLabel}
            </span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
