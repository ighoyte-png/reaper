"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, endOfMonth, startOfMonth } from "date-fns";
import { ChartColumn, ChartLine, ChevronLeft, ChevronRight } from "lucide-react";
import {
  HoursPerWeekChart,
  ProjectProgressCharts,
} from "@/components/budgets/cumulative-hours-chart";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ContractorTag } from "@/components/projects/project-manager-person";
import { ProjectYearBurnChart } from "@/components/projects/monthly-retainer-chart";
import { BurnBar } from "@/components/ui/burn-bar";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { useData } from "@/lib/data/store";
import { useAppHref, resolveProjectBySlugs, useProjectHref } from "@/lib/hooks/use-app-href";
import {
  budgetBurn,
  budgetHealth,
  calendarYearBars,
  contractorExpenseLinesInRange,
  contractorExpenseTotalsInRange,
  contractorExpenseSplitInRange,
  formatHours,
  formatMoney,
  hoursCommitmentTotalInRange,
  isMonthlyRetainerBudget,
  normalizeBudgetMode,
  personHoursSplitInRange,
  projectDateSpan,
  projectHoursForecast,
  projectHoursSplitInRange,
  projectPlannedAmount,
  projectPlannedHours,
  weeklyProgressSeries,
  type MonthBurnBar,
} from "@/lib/domain/budget";
import { PersonAvatar } from "@/components/people/person-avatar";
import {
  contractorCommitted,
} from "@/lib/domain/contractor";
import { personAvatarColor } from "@/lib/domain/people";
import { toDateKey } from "@/lib/domain/dates";
import { projectDisplayColor, sortPeopleByName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { ProjectMember } from "@/lib/types";

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
    !project?.id || dataStatus.projects[project.id] === "ready";
  const projectDataLoading =
    Boolean(project?.id) &&
    !projectDataReady &&
    dataStatus.projects[project.id] !== "error";

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [periodMode, setPeriodMode] = useState<"month" | "year" | "lifetime">(
    "month",
  );
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });
  const [retainerTab, setRetainerTab] = useState<"calendar" | "weekly">(
    "calendar",
  );
  const client = project
    ? state.clients.find((c) => c.id === project.client_id)
    : undefined;

  const isRetainer = project ? isMonthlyRetainerBudget(project) : false;

  const projectMembers = useMemo(
    () =>
      project
        ? state.project_members.filter((m) => m.project_id === project.id)
        : [],
    [project, state.project_members],
  );
  const projectExpenses = useMemo(
    () =>
      project
        ? state.project_contractor_expenses.filter(
            (e) => e.project_id === project.id,
          )
        : [],
    [project, state.project_contractor_expenses],
  );

  const burn = useMemo(
    () =>
      project
        ? budgetBurn(
            project,
            state.assignments,
            state.people,
            false,
            new Date(),
            projectMembers,
            projectExpenses,
          )
        : null,
    [project, state.assignments, state.people, projectMembers, projectExpenses],
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
            year,
            new Date(),
            projectMembers,
            projectExpenses,
          )
        : [],
    [
      project,
      state.assignments,
      state.people,
      year,
      projectMembers,
      projectExpenses,
    ],
  );

  const weeklyPoints = useMemo(
    () =>
      project
        ? weeklyProgressSeries(
            project,
            state.assignments,
            new Date(),
            state.people,
            projectMembers,
          )
        : [],
    [project, state.assignments, state.people, projectMembers],
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

  const membersByPerson = useMemo(() => {
    const map = new Map<string, ProjectMember>();
    for (const m of projectMembers) map.set(m.person_id, m);
    return map;
  }, [projectMembers]);

  const staffTeam = useMemo(() => {
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
    return sortPeopleByName(
      state.people.filter((p) => ids.has(p.id) && !p.is_contractor),
    );
  }, [project, state.assignments, state.tasks, state.people]);

  const contractorRoster = useMemo(() => {
    if (!project) return [];
    const ids = new Set<string>();
    for (const m of projectMembers) ids.add(m.person_id);
    for (const a of state.assignments) {
      if (a.project_id === project.id) ids.add(a.person_id);
    }
    for (const t of state.tasks) {
      if (t.project_id === project.id && t.assignee_person_id) {
        ids.add(t.assignee_person_id);
      }
    }
    return sortPeopleByName(
      state.people.filter((p) => ids.has(p.id) && p.is_contractor),
    );
  }, [project, projectMembers, state.assignments, state.tasks, state.people]);

  const periodRange = useMemo(() => {
    if (periodMode === "lifetime" && project) {
      const span = projectDateSpan(project, state.assignments);
      if (span) {
        return {
          start: span.startKey,
          end: span.endKey,
          label: "Lifetime",
        };
      }
      return {
        start: project.start_date ?? toDateKey(new Date(year, 0, 1)),
        end:
          project.end_date ??
          toDateKey(endOfMonth(new Date(year, 11, 1))),
        label: "Lifetime",
      };
    }
    if (periodMode === "year") {
      return {
        start: toDateKey(new Date(year, 0, 1)),
        end: toDateKey(endOfMonth(new Date(year, 11, 1))),
        label: String(year),
      };
    }
    const d = new Date(selectedMonth.year, selectedMonth.monthIndex, 1);
    return {
      start: toDateKey(startOfMonth(d)),
      end: toDateKey(endOfMonth(d)),
      label: format(d, "MMM yyyy"),
    };
  }, [periodMode, year, selectedMonth, project, state.assignments]);

  const periodSplit = useMemo(() => {
    if (!project) return null;
    const split = projectHoursSplitInRange(
      project.id,
      state.assignments,
      state.people,
      periodRange.start,
      periodRange.end,
    );
    if (!isMonthlyRetainerBudget(project)) return split;
    const expenses = contractorExpenseSplitInRange(
      project.id,
      projectExpenses,
      state.people,
      periodRange.start,
      periodRange.end,
      new Date(),
      project,
    );
    return {
      usedHours: split.usedHours + expenses.usedHours,
      futureHours: split.futureHours + expenses.futureHours,
      usedAmount: split.usedAmount + expenses.usedAmount,
      futureAmount: split.futureAmount + expenses.futureAmount,
    };
  }, [
    project,
    state.assignments,
    state.people,
    periodRange,
    projectExpenses,
  ]);

  const periodRevenueCost = useMemo(() => {
    if (!project) {
      return { revenue: 0, cost: 0, scheduleCost: 0, expenseCost: 0 };
    }
    const byId = new Map(state.people.map((p) => [p.id, p]));
    const personIds = new Set<string>();
    for (const a of state.assignments) {
      if (a.project_id !== project.id || a.status !== "confirmed") continue;
      personIds.add(a.person_id);
    }
    let revenue = 0;
    let scheduleCost = 0;
    for (const personId of personIds) {
      const person = byId.get(personId);
      const split = personHoursSplitInRange(
        personId,
        project.id,
        state.assignments,
        periodRange.start,
        periodRange.end,
      );
      const hours = split.usedHours + split.futureHours;
      revenue += hours * (person?.bill_rate ?? 0);
      scheduleCost += hours * (person?.cost_rate ?? 0);
    }
    let expenseCost = 0;
    if (isMonthlyRetainerBudget(project)) {
      expenseCost = contractorExpenseTotalsInRange(
        project.id,
        projectExpenses,
        state.people,
        periodRange.start,
        periodRange.end,
        project,
      ).amount;
    }
    return {
      revenue,
      scheduleCost,
      expenseCost,
      cost: scheduleCost + expenseCost,
    };
  }, [project, state.assignments, state.people, periodRange, projectExpenses]);

  const selectedMonthKey =
    periodMode === "month"
      ? format(
          new Date(selectedMonth.year, selectedMonth.monthIndex, 1),
          "yyyy-MM",
        )
      : undefined;

  function handleMonthSelect(bar: MonthBurnBar) {
    setPeriodMode("month");
    setSelectedMonth({ year: bar.year, monthIndex: bar.monthIndex });
    if (bar.year !== year) setYear(bar.year);
  }

  const teamPeriod = useMemo(() => {
    if (!project) return { staff: [], contractors: [] };
    type TeamPeriodRow = {
      id: string;
      personId: string;
      name: string;
      avatar_url: string | null;
      avatar_attachment_id?: string | null;
      avatar_color?: string | null;
      usedHours: number;
      plannedHours: number;
      totalHours: number;
      moneyAmount: number | null;
      dashUsedPlanned: boolean;
      is_contractor: boolean;
      notes?: string;
    };
    const staff = staffTeam.map((person) => {
      const split = personHoursSplitInRange(
        person.id,
        project.id,
        state.assignments,
        periodRange.start,
        periodRange.end,
      );
      return {
        id: person.id,
        personId: person.id,
        name: person.name,
        avatar_url: person.avatar_url,
        avatar_attachment_id: person.avatar_attachment_id,
        avatar_color: person.avatar_color,
        usedHours: split.usedHours,
        plannedHours: split.futureHours,
        totalHours: split.usedHours + split.futureHours,
        moneyAmount: null as number | null,
        dashUsedPlanned: false,
        is_contractor: person.is_contractor,
      } satisfies TeamPeriodRow;
    });
    const contractors: TeamPeriodRow[] = [];
    const monthly = isMonthlyRetainerBudget(project);
    const asOf = new Date();

    for (const person of contractorRoster) {
      const member = membersByPerson.get(person.id);
      const mode = member?.contractor_mode ?? null;
      const isFixedFee = mode === "fixed_fee";
      const isFixedHours =
        mode === "hours" || (mode == null && person.hide_from_schedule);
      const isScheduled = mode === "scheduled" || (!isFixedFee && !isFixedHours);

      if (monthly) {
        const expenseLines = contractorExpenseLinesInRange(
          project,
          projectExpenses,
          state.people,
          periodRange.start,
          periodRange.end,
          person.id,
        );
        for (const line of expenseLines) {
          contractors.push({
            id: line.rowId,
            personId: person.id,
            name: person.name,
            avatar_url: person.avatar_url,
            avatar_attachment_id: person.avatar_attachment_id,
            avatar_color: person.avatar_color,
            usedHours: 0,
            plannedHours: 0,
            totalHours: 0,
            moneyAmount: line.amount,
            dashUsedPlanned: true,
            is_contractor: true,
            notes: line.notes || undefined,
          });
        }

        if (isFixedHours) {
          const committed = contractorCommitted(person, member);
          const totalHours = hoursCommitmentTotalInRange(
            project,
            committed.hours,
            periodRange.start,
            periodRange.end,
            asOf,
          );
          if (totalHours > 0) {
            contractors.push({
              id: `${person.id}:hours`,
              personId: person.id,
              name: person.name,
              avatar_url: person.avatar_url,
              avatar_attachment_id: person.avatar_attachment_id,
              avatar_color: person.avatar_color,
              usedHours: 0,
              plannedHours: 0,
              totalHours,
              moneyAmount: null,
              dashUsedPlanned: true,
              is_contractor: true,
            });
          }
        }

        if (isScheduled) {
          const split = personHoursSplitInRange(
            person.id,
            project.id,
            state.assignments,
            periodRange.start,
            periodRange.end,
          );
          contractors.push({
            id: person.id,
            personId: person.id,
            name: person.name,
            avatar_url: person.avatar_url,
            avatar_attachment_id: person.avatar_attachment_id,
            avatar_color: person.avatar_color,
            usedHours: split.usedHours,
            plannedHours: split.futureHours,
            totalHours: split.usedHours + split.futureHours,
            moneyAmount: null,
            dashUsedPlanned: false,
            is_contractor: true,
          });
        }
        continue;
      }

      if (isFixedFee || isFixedHours) {
        const committed = contractorCommitted(person, member);
        if (isFixedFee) {
          contractors.push({
            id: person.id,
            personId: person.id,
            name: person.name,
            avatar_url: person.avatar_url,
            avatar_attachment_id: person.avatar_attachment_id,
            avatar_color: person.avatar_color,
            usedHours: 0,
            plannedHours: 0,
            totalHours: 0,
            moneyAmount: committed.amount,
            dashUsedPlanned: true,
            is_contractor: true,
          });
        } else {
          contractors.push({
            id: person.id,
            personId: person.id,
            name: person.name,
            avatar_url: person.avatar_url,
            avatar_attachment_id: person.avatar_attachment_id,
            avatar_color: person.avatar_color,
            usedHours: 0,
            plannedHours: 0,
            totalHours: committed.hours,
            moneyAmount: null,
            dashUsedPlanned: true,
            is_contractor: true,
          });
        }
        continue;
      }

      const split = personHoursSplitInRange(
        person.id,
        project.id,
        state.assignments,
        periodRange.start,
        periodRange.end,
      );
      contractors.push({
        id: person.id,
        personId: person.id,
        name: person.name,
        avatar_url: person.avatar_url,
        avatar_attachment_id: person.avatar_attachment_id,
        avatar_color: person.avatar_color,
        usedHours: split.usedHours,
        plannedHours: split.futureHours,
        totalHours: split.usedHours + split.futureHours,
        moneyAmount: null,
        dashUsedPlanned: false,
        is_contractor: true,
      });
    }

    return {
      staff: staff.sort((a, b) => b.totalHours - a.totalHours),
      contractors: contractors.sort((a, b) => {
        const aKey = a.moneyAmount ?? a.totalHours;
        const bKey = b.moneyAmount ?? b.totalHours;
        return bKey - aKey;
      }),
    };
  }, [
    project,
    staffTeam,
    contractorRoster,
    membersByPerson,
    state.assignments,
    state.people,
    periodRange,
    projectExpenses,
  ]);

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

  if (!project || !burn || !hoursFx) {
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
  const contractorBaseline =
    chartUnit === "amount"
      ? (burn.contractorAmount ?? 0)
      : (burn.contractorHours ?? 0);
  const showHoursMetrics = mode === "hours";
  const showAmountMetrics = mode === "amount";
  const monthlyCap = isMonthlyRetainerBudget(project)
    ? mode === "amount"
      ? project.budget_amount ?? 0
      : project.budget_hours ?? 0
    : undefined;

  const burnSummary =
    burn.mode === "none"
      ? `${formatHours(burn.plannedHours)} planned`
      : burn.mode === "amount"
        ? `${formatMoney(burn.plannedAmount)} / ${formatMoney(burn.totalAmount ?? 0)}`
        : `${formatHours(burn.plannedHours)} / ${formatHours(burn.totalHours)}${
            burn.overBy > 0 ? ` · ${formatHours(burn.overBy)} over` : ""
          }`;

  const periodPlannedHours =
    (periodSplit?.usedHours ?? 0) + (periodSplit?.futureHours ?? 0);
  const periodPlannedAmount =
    (periodSplit?.usedAmount ?? 0) + (periodSplit?.futureAmount ?? 0);

  let periodBudgetCap: number | null = null;
  if (mode === "hours") {
    const monthly = project.budget_hours ?? 0;
    if (periodMode === "month" && isRetainer) {
      periodBudgetCap = monthly;
    } else if (periodMode === "year" && isRetainer) {
      periodBudgetCap = monthly * 12;
    } else {
      periodBudgetCap = project.budget_hours ?? 0;
    }
  } else if (mode === "amount") {
    const monthly = project.budget_amount ?? 0;
    if (periodMode === "month" && isRetainer) {
      periodBudgetCap = monthly;
    } else if (periodMode === "year" && isRetainer) {
      periodBudgetCap = monthly * 12;
    } else {
      periodBudgetCap = project.budget_amount ?? 0;
    }
  }

  const periodRemainingHours =
    periodBudgetCap != null && mode === "hours"
      ? periodBudgetCap - periodPlannedHours
      : null;
  const periodRemainingAmount =
    periodBudgetCap != null && mode === "amount"
      ? periodBudgetCap - periodPlannedAmount
      : null;

  const periodOverBudget =
    mode === "amount"
      ? periodRemainingAmount != null && periodRemainingAmount < 0
      : periodRemainingHours != null && periodRemainingHours < 0;

  const periodRemainingLabel =
    mode === "none"
      ? "—"
      : showAmountMetrics
        ? periodRemainingAmount == null
          ? "—"
          : formatMoney(periodRemainingAmount)
        : periodRemainingHours == null
          ? "—"
          : formatHours(periodRemainingHours);

  const periodRateMargin =
    periodRevenueCost.revenue - periodRevenueCost.scheduleCost;
  const periodRateMarginPct =
    periodRevenueCost.revenue <= 0
      ? 0
      : (periodRateMargin / periodRevenueCost.revenue) * 100;

  let periodMargin: number | null = null;
  let periodMarginPct: number | null = null;
  if (mode === "amount" && periodBudgetCap != null) {
    // Budget $ minus schedule cost rates and contractor expenses.
    periodMargin = periodBudgetCap - periodRevenueCost.cost;
    periodMarginPct =
      periodBudgetCap <= 0 ? null : (periodMargin / periodBudgetCap) * 100;
  } else if (
    mode === "hours" &&
    periodBudgetCap != null &&
    periodPlannedHours > 0
  ) {
    const scheduleHours = Math.max(
      0,
      periodPlannedHours -
        (isMonthlyRetainerBudget(project)
          ? contractorExpenseTotalsInRange(
              project.id,
              projectExpenses,
              state.people,
              periodRange.start,
              periodRange.end,
            ).hours
          : 0),
    );
    const avgCost =
      scheduleHours > 0
        ? periodRevenueCost.scheduleCost / scheduleHours
        : 0;
    const unusedHours = periodBudgetCap - periodPlannedHours;
    periodMargin = unusedHours * avgCost;
    periodMarginPct =
      periodBudgetCap <= 0
        ? null
        : ((periodBudgetCap - periodPlannedHours) / periodBudgetCap) * 100;
  }

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
              ? "No Budget"
              : mode === "amount"
                ? project.budget_monthly_reset
                  ? "Monthly Amount"
                  : "Dollar Budget"
                : project.budget_monthly_reset
                  ? "Monthly Hours"
                  : "Hours Budget"}
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
                {showAmountMetrics ? "Spend to date" : "Hours used to date"}
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">
                {showHoursMetrics
                  ? formatHours(hoursFx.hoursUsedToDate)
                  : showAmountMetrics
                    ? formatMoney(burn.usedAmount)
                    : formatHours(hoursFx.hoursUsedToDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">
                {showAmountMetrics
                  ? "Future spend planned"
                  : "Future hours planned"}
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">
                {showHoursMetrics
                  ? formatHours(hoursFx.hoursFuturePlanned)
                  : showAmountMetrics
                    ? formatMoney(burn.futureAmount)
                    : formatHours(hoursFx.hoursFuturePlanned)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">
                {showAmountMetrics ? "Budget remaining" : "Hours remaining"}
              </dt>
              <dd
                className={cn(
                  "mt-0.5 text-sm font-medium tabular-nums",
                  hoursFx.overBudget && "text-[var(--status-over)]",
                )}
              >
                {showHoursMetrics
                  ? hoursFx.hoursRemaining == null
                    ? "—"
                    : formatHours(hoursFx.hoursRemaining)
                  : showAmountMetrics
                    ? burn.remainingAmount == null
                      ? "—"
                      : formatMoney(burn.remainingAmount)
                    : "—"}
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
                  : mode === "amount"
                    ? formatMoney(burn.plannedAmount)
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
                    {chartUnit === "amount" ? "Spend per week" : "Hours per week"}
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
                  selectedMonthKey={selectedMonthKey}
                  onMonthSelect={handleMonthSelect}
                />
              ) : weeklyPoints.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No schedule dates to chart yet.
                </p>
              ) : (
                <HoursPerWeekChart points={weeklyPoints} unit={chartUnit} />
              )}
            </>
          ) : (
            <ProjectProgressCharts
              points={weeklyPoints}
              unit={chartUnit}
              budgetHours={mode === "hours" ? project.budget_hours : null}
              budgetAmount={mode === "amount" ? project.budget_amount : null}
              contractorBaseline={contractorBaseline}
            />
          )}
        </section>

        <div className="space-y-4">
          <ul className="flex flex-wrap gap-2" role="tablist" aria-label="Period">
            <li>
              <PeriodChip
                label="Month"
                selected={periodMode === "month"}
                onSelect={() => setPeriodMode("month")}
              />
            </li>
            <li>
              <PeriodChip
                label="Year"
                selected={periodMode === "year"}
                onSelect={() => setPeriodMode("year")}
              />
            </li>
            {!isRetainer ? (
              <li>
                <PeriodChip
                  label="Lifetime"
                  selected={periodMode === "lifetime"}
                  onSelect={() => setPeriodMode("lifetime")}
                />
              </li>
            ) : null}
            {periodMode === "month" ? (
              <li className="flex items-center text-xs text-[var(--text-muted)]">
                {periodRange.label}
              </li>
            ) : null}
          </ul>

          <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Forecast vs Budget</h2>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              {periodMode === "month"
                ? `${periodRange.label} · `
                : periodMode === "lifetime"
                  ? `Lifetime · `
                  : `${year} · `}
              {showHoursMetrics
                ? "Schedule Hours and Margin Against the Project Budget."
                : showAmountMetrics
                  ? "Schedule Spend and Margin Against the Project Budget."
                  : "Schedule and Margin Against the Project."}
            </p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">
                  {showAmountMetrics ? "Spend to Date" : "Hours Used"}
                </dt>
                <dd className="tabular-nums font-medium">
                  {showHoursMetrics
                    ? formatHours(periodSplit?.usedHours ?? 0)
                    : showAmountMetrics
                      ? formatMoney(periodSplit?.usedAmount ?? 0)
                      : formatHours(periodSplit?.usedHours ?? 0)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">Future Planned</dt>
                <dd className="tabular-nums font-medium">
                  {showHoursMetrics
                    ? formatHours(periodSplit?.futureHours ?? 0)
                    : showAmountMetrics
                      ? formatMoney(periodSplit?.futureAmount ?? 0)
                      : formatHours(periodSplit?.futureHours ?? 0)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">
                  {showAmountMetrics ? "Budget Remaining" : "Remaining Hours"}
                </dt>
                <dd
                  className={cn(
                    "tabular-nums font-medium",
                    periodOverBudget && "text-[var(--status-over)]",
                  )}
                >
                  {periodRemainingLabel}
                </dd>
              </div>
              {periodMargin != null ? (
                <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-2">
                  <dt className="text-[var(--text-muted)]">
                    Margin vs Budget
                  </dt>
                  <dd
                    className={cn(
                      "tabular-nums font-medium",
                      periodMargin < 0 && "text-[var(--status-over)]",
                    )}
                  >
                    {formatMoney(periodMargin)}
                    {periodMarginPct != null
                      ? ` (${periodMarginPct.toFixed(0)}%)`
                      : ""}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-2 text-xs">
                <dt className="text-[var(--text-muted)]">
                  Rate Revenue / Cost
                </dt>
                <dd className="tabular-nums text-[var(--text-muted)]">
                  {formatMoney(periodRevenueCost.revenue)} /{" "}
                  {formatMoney(periodRevenueCost.cost)}
                </dd>
              </div>
              <div className="flex justify-between gap-2 text-xs">
                <dt className="text-[var(--text-muted)]">Rate Margin</dt>
                <dd className="tabular-nums text-[var(--text-muted)]">
                  {formatMoney(periodRateMargin)} ({periodRateMarginPct.toFixed(0)}
                  %)
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <h2 className="mb-3 text-sm font-semibold">
              Team
              {periodMode === "month"
                ? ` · ${periodRange.label}`
                : periodMode === "lifetime"
                  ? " · Lifetime"
                  : ` · ${year}`}
            </h2>
            {teamPeriod.staff.length === 0 &&
            teamPeriod.contractors.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No one assigned yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[20rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                      <th className="pb-2 font-medium">Person</th>
                      <th className="pb-2 text-right font-medium">Used</th>
                      <th className="pb-2 text-right font-medium">Planned</th>
                      <th className="pb-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamPeriod.staff.map((row) => (
                      <TeamRow key={row.id} row={row} />
                    ))}
                    {teamPeriod.contractors.length > 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="border-b border-[var(--border)]/60 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                        >
                          Contractors
                        </td>
                      </tr>
                    ) : null}
                    {teamPeriod.contractors.map((row) => (
                      <TeamRow key={row.id} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

function TeamRow({
  row,
}: {
  row: {
    id: string;
    personId?: string;
    name: string;
    avatar_url: string | null;
    avatar_attachment_id?: string | null;
    avatar_color?: string | null;
    usedHours: number;
    plannedHours: number;
    totalHours: number;
    moneyAmount: number | null;
    dashUsedPlanned?: boolean;
    is_contractor: boolean;
    notes?: string;
  };
}) {
  const money = row.moneyAmount != null;
  const dashPartial = Boolean(row.dashUsedPlanned) || money;
  const avatarPersonId = row.personId ?? row.id;
  return (
    <tr className="border-b border-[var(--border)]/60">
      <td className="py-2 pr-2">
        <div className="flex items-center gap-2">
          <PersonAvatar
            avatarUrl={row.avatar_url}
            avatarAttachmentId={row.avatar_attachment_id}
            name={row.name}
            size="xs"
            fallback="initials"
            personId={avatarPersonId}
            color={personAvatarColor({
              id: avatarPersonId,
              avatar_color: row.avatar_color ?? null,
            })}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="min-w-0 truncate">{row.name}</span>
              {row.is_contractor ? <ContractorTag /> : null}
            </div>
            {row.notes ? (
              <p className="truncate text-[11px] text-[var(--text-muted)]">
                {row.notes}
              </p>
            ) : null}
          </div>
        </div>
      </td>
      <td className="py-2 text-right tabular-nums">
        {dashPartial ? "—" : formatHours(row.usedHours)}
      </td>
      <td className="py-2 text-right tabular-nums">
        {dashPartial ? "—" : formatHours(row.plannedHours)}
      </td>
      <td className="py-2 text-right tabular-nums">
        {money ? formatMoney(row.moneyAmount!) : formatHours(row.totalHours)}
      </td>
    </tr>
  );
}

function PeriodChip({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "rounded-md border px-2.5 py-1 text-sm font-medium transition-colors",
        selected
          ? "border-[var(--text)] bg-[var(--bg-elevated)] text-[var(--text)]"
          : "border-transparent text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
      )}
    >
      {label}
    </button>
  );
}
