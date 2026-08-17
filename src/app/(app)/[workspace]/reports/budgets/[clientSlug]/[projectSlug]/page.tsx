"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO, endOfMonth, startOfMonth } from "date-fns";
import { ChartColumn, ChartLine, ChevronLeft, ChevronRight } from "lucide-react";
import {
  HoursPerWeekChart,
  OutsideDatesChartNote,
  ProjectProgressCharts,
} from "@/components/budgets/cumulative-hours-chart";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ContractorTag } from "@/components/projects/project-manager-person";
import { ProjectYearBurnChart } from "@/components/projects/monthly-retainer-chart";
import { BurnBar } from "@/components/ui/burn-bar";
import { CurrencyChip, CurrencyToggle } from "@/components/ui/currency-chip";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { useData } from "@/lib/data/store";
import { useAppHref, resolveProjectBySlugs, useProjectHref } from "@/lib/hooks/use-app-href";
import {
  budgetBurn,
  budgetHealth,
  calendarRangeBars,
  calendarYearBars,
  contractorExpenseLinesInRange,
  contractorExpenseAggregatesInRange,
  contractorExpenseSplitInRange,
  eachMonthKeyInRange,
  formatHours,
  formatMoney,
  hoursCommitmentAppliesInMonth,
  hoursCommitmentTotalInRange,
  isMonthlyRetainerBudget,
  normalizeBudgetMode,
  personHoursSplitInRange,
  projectDateSpan,
  projectToDateSpan,
  projectHoursForecast,
  projectHoursSplitInRange,
  projectPlannedAmount,
  projectPlannedHours,
  spendHealth,
  weeklyProgressSeries,
  scheduleOutsideProjectDates,
  type MonthBurnBar,
} from "@/lib/domain/budget";
import { PersonAvatar } from "@/components/people/person-avatar";
import {
  contractorCommitted,
  isCommitContractor,
  isProjectBasisContractor,
} from "@/lib/domain/contractor";
import { remainingTargetCostAllowance, targetCostPct } from "@/lib/domain/org-settings";
import {
  convertAmount,
  convertBurnToCurrency,
  personAmountToProject,
  personCurrency,
  projectCurrency,
} from "@/lib/domain/currency";
import { projectPeriodEconomics } from "@/lib/domain/forecast";
import { personAvatarColor } from "@/lib/domain/people";
import { toDateKey } from "@/lib/domain/dates";
import { projectDisplayColor, sortPeopleByName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { CurrencyCode, ProjectMember } from "@/lib/types";

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
  const [periodProjectId, setPeriodProjectId] = useState<string | null>(null);
  const [periodMode, setPeriodMode] = useState<
    "month" | "year" | "lifetime" | "term" | "todate"
  >("month");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });
  const [retainerTab, setRetainerTab] = useState<"calendar" | "weekly">(
    "calendar",
  );
  const [viewCurrency, setViewCurrency] = useState<CurrencyCode | null>(null);
  const client = project
    ? state.clients.find((c) => c.id === project.client_id)
    : undefined;

  const isRetainer = project ? isMonthlyRetainerBudget(project) : false;
  const hasContractTerm = Boolean(project?.start_date && project?.end_date);

  if (project?.id && project.id !== periodProjectId) {
    setPeriodProjectId(project.id);
    setPeriodMode(isMonthlyRetainerBudget(project) ? "month" : "todate");
  }

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
            state.organization_settings,
          )
        : null,
    [
      project,
      state.assignments,
      state.people,
      projectMembers,
      projectExpenses,
      state.organization_settings,
    ],
  );

  const hoursFx = useMemo(
    () =>
      project
        ? projectHoursForecast(
            project,
            state.assignments,
            state.people,
            new Date(),
            state.organization_settings,
          )
        : null,
    [project, state.assignments, state.people, state.organization_settings],
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
            state.organization_settings,
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

  const termBars = useMemo(
    () =>
      project?.start_date && project.end_date
        ? calendarRangeBars(
            project,
            state.assignments,
            state.people,
            project.start_date,
            project.end_date,
            new Date(),
            projectMembers,
            projectExpenses,
            state.organization_settings,
          )
        : [],
    [
      project,
      state.assignments,
      state.people,
      projectMembers,
      projectExpenses,
    ],
  );

  const scheduleOutsideDates = useMemo(
    () =>
      project
        ? scheduleOutsideProjectDates(project, state.assignments)
        : false,
    [project, state.assignments],
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
            state.organization_settings,
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
        state.organization_settings,
        project,
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
    if (periodMode === "todate" && project) {
      const span = projectToDateSpan(project, state.assignments);
      if (span) {
        return {
          start: span.startKey,
          end: span.endKey,
          label: "Project to Date",
        };
      }
      const today = toDateKey(new Date());
      return { start: today, end: today, label: "Project to Date" };
    }
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
    if (periodMode === "term" && project?.start_date && project?.end_date) {
      return {
        start: project.start_date,
        end: project.end_date,
        label: "Contract Term",
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
    const asOf = new Date();
    const peopleById = new Map(state.people.map((p) => [p.id, p]));

    if (!isMonthlyRetainerBudget(project)) {
      const personIds = new Set<string>();
      for (const a of state.assignments) {
        if (a.project_id !== project.id || a.status !== "confirmed") continue;
        personIds.add(a.person_id);
      }
      for (const m of projectMembers) personIds.add(m.person_id);

      const commitIds = new Set<string>();
      for (const personId of personIds) {
        const person = peopleById.get(personId);
        if (!person) continue;
        if (isCommitContractor(person, membersByPerson.get(personId))) {
          commitIds.add(personId);
        }
      }

      const scheduleAssignments =
        commitIds.size > 0
          ? state.assignments.filter(
              (a) =>
                a.project_id !== project.id || !commitIds.has(a.person_id),
            )
          : state.assignments;
      const split = projectHoursSplitInRange(
        project.id,
        scheduleAssignments,
        state.people,
        periodRange.start,
        periodRange.end,
        asOf,
        state.organization_settings,
      );

      let usedHours = split.usedHours;
      const futureHours = split.futureHours;
      let usedAmount = split.usedAmount;
      const futureAmount = split.futureAmount;
      for (const personId of commitIds) {
        const person = peopleById.get(personId);
        if (!person) continue;
        const committed = contractorCommitted(
          person,
          membersByPerson.get(personId),
          { settings: state.organization_settings },
        );
        usedHours += committed.hours;
        usedAmount += committed.amount;
      }
      return { usedHours, futureHours, usedAmount, futureAmount };
    }

    const split = projectHoursSplitInRange(
      project.id,
      state.assignments,
      state.people,
      periodRange.start,
      periodRange.end,
      asOf,
      state.organization_settings,
    );

    const todayKey = toDateKey(asOf);
    const expenses = contractorExpenseSplitInRange(
      project.id,
      projectExpenses,
      state.people,
      periodRange.start,
      periodRange.end,
      asOf,
      project,
    );

    let usedHours = split.usedHours + expenses.usedHours;
    let futureHours = split.futureHours + expenses.futureHours;
    let usedAmount = split.usedAmount + expenses.usedAmount;
    let futureAmount = split.futureAmount + expenses.futureAmount;

    for (const member of projectMembers) {
      const person = peopleById.get(member.person_id);
      if (!person || !isProjectBasisContractor(person)) continue;
      if (member.contractor_mode !== "hours") continue;
      const committed = contractorCommitted(person, member, {
        settings: state.organization_settings,
      });
      if (committed.hours <= 0) continue;

      for (const mk of eachMonthKeyInRange(
        periodRange.start,
        periodRange.end,
      )) {
        if (!hoursCommitmentAppliesInMonth(project, mk, asOf)) continue;
        const monthStart = toDateKey(
          startOfMonth(
            new Date(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)) - 1, 1),
          ),
        );
        if (monthStart > todayKey) {
          futureHours += committed.hours;
          futureAmount += committed.amount;
        } else {
          usedHours += committed.hours;
          usedAmount += committed.amount;
        }
      }
    }

    return { usedHours, futureHours, usedAmount, futureAmount };
  }, [
    project,
    state.assignments,
    state.people,
    state.organization_settings,
    periodRange,
    projectExpenses,
    projectMembers,
    membersByPerson,
  ]);

  const periodRevenueCost = useMemo(() => {
    if (!project) {
      return {
        revenue: 0,
        cost: 0,
        scheduleCost: 0,
        expenseCost: 0,
        contractorCost: 0,
        contractorHours: 0,
        contractorRevenue: 0,
        scheduleHours: 0,
      };
    }
    return projectPeriodEconomics(
      project,
      state.assignments,
      state.people,
      projectMembers,
      projectExpenses,
      periodRange.start,
      periodRange.end,
      state.organization_settings,
    );
  }, [
    project,
    state.assignments,
    state.people,
    state.organization_settings,
    periodRange,
    projectExpenses,
    projectMembers,
  ]);

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
      mixedCurrency?: boolean;
      nativeCurrency?: CurrencyCode;
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
        if (isFixedFee) {
          if (periodMode === "month") {
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
                moneyAmount: personAmountToProject(
                  line.amount,
                  person,
                  project,
                  state.organization_settings,
                ),
                dashUsedPlanned: true,
                is_contractor: true,
                notes: line.notes || undefined,
            mixedCurrency:
              state.organization_settings.currency_enabled &&
              personCurrency(person, true) !== projectCurrency(project, true),
            nativeCurrency: personCurrency(person, true),
              });
            }
          } else {
            const aggregates = contractorExpenseAggregatesInRange(
              project,
              projectExpenses,
              state.people,
              periodRange.start,
              periodRange.end,
              person.id,
            );
            for (const line of aggregates) {
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
                moneyAmount: personAmountToProject(
                  line.amount,
                  person,
                  project,
                  state.organization_settings,
                ),
                dashUsedPlanned: true,
                is_contractor: true,
            mixedCurrency:
              state.organization_settings.currency_enabled &&
              personCurrency(person, true) !== projectCurrency(project, true),
            nativeCurrency: personCurrency(person, true),
              });
            }
          }
        }

        if (isFixedHours) {
          const hourLines =
            periodMode === "month"
              ? contractorExpenseLinesInRange(
                  project,
                  projectExpenses,
                  state.people,
                  periodRange.start,
                  periodRange.end,
                  person.id,
                ).filter((line) => line.hours > 0)
              : contractorExpenseAggregatesInRange(
                  project,
                  projectExpenses,
                  state.people,
                  periodRange.start,
                  periodRange.end,
                  person.id,
                ).filter((line) => line.hours > 0);
          if (hourLines.length > 0) {
            for (const line of hourLines) {
              contractors.push({
                id: line.rowId,
                personId: person.id,
                name: person.name,
                avatar_url: person.avatar_url,
                avatar_attachment_id: person.avatar_attachment_id,
                avatar_color: person.avatar_color,
                usedHours: 0,
                plannedHours: 0,
                totalHours: line.hours,
                moneyAmount: null,
                dashUsedPlanned: true,
                is_contractor: true,
                notes:
                  "notes" in line
                    ? String(line.notes ?? "") || undefined
                    : undefined,
              });
            }
          } else {
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
            moneyAmount: personAmountToProject(
              committed.amount,
              person,
              project,
              state.organization_settings,
            ),
            dashUsedPlanned: true,
            is_contractor: true,
            mixedCurrency:
              state.organization_settings.currency_enabled &&
              personCurrency(person, true) !== projectCurrency(project, true),
            nativeCurrency: personCurrency(person, true),
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
    periodMode,
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
  const settings = state.organization_settings;
  const projectCur = projectCurrency(project, settings.currency_enabled);
  const activeView = viewCurrency ?? projectCur;
  const fx = (n: number) =>
    convertAmount(
      n,
      projectCur,
      activeView,
      settings.usd_to_cad_rate,
      settings.currency_enabled,
    );
  const money = (n: number) =>
    formatMoney(fx(n), activeView, settings.currency_enabled);
  const displayBurn = convertBurnToCurrency(
    burn,
    projectCur,
    activeView,
    settings,
  );
  const health = budgetHealth(burn, settings);
  const chartUnit = mode === "amount" ? "amount" : "hours";
  const contractorBaseline =
    chartUnit === "amount"
      ? (displayBurn.contractorAmount ?? 0)
      : (burn.contractorHours ?? 0);
  const showHoursMetrics = mode === "hours";
  const showAmountMetrics = mode === "amount";
  const monthlyCap = isMonthlyRetainerBudget(project)
    ? mode === "amount"
      ? fx(project.budget_amount ?? 0)
      : project.budget_hours ?? 0
    : undefined;

  const viewBars = (bars: MonthBurnBar[]) => {
    if (chartUnit !== "amount" || !settings.currency_enabled) return bars;
    return bars.map((bar) => ({
      ...bar,
      plannedAmount: fx(bar.plannedAmount),
      usedAmount: fx(bar.usedAmount),
      futureAmount: fx(bar.futureAmount),
      contractorAmount: fx(bar.contractorAmount),
      contractorUsedAmount: fx(bar.contractorUsedAmount),
      contractorFutureAmount: fx(bar.contractorFutureAmount),
      value: fx(bar.value),
      cap: fx(bar.cap),
    }));
  };

  const viewWeeklyPoints = (points: typeof weeklyPoints) => {
    if (chartUnit !== "amount" || !settings.currency_enabled) return points;
    return points.map((p) => ({
      ...p,
      weekAmount: fx(p.weekAmount),
      cumulativeUsedAmount: fx(p.cumulativeUsedAmount),
      cumulativePlannedAmount: fx(p.cumulativePlannedAmount),
    }));
  };

  const burnSummary =
    burn.mode === "none"
      ? `${formatHours(burn.plannedHours)} planned`
      : burn.mode === "amount"
        ? `${money(burn.plannedAmount)} / ${money(burn.totalAmount ?? 0)}`
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
    } else if (periodMode === "term" && isRetainer) {
      periodBudgetCap =
        monthly *
        eachMonthKeyInRange(periodRange.start, periodRange.end).length;
    } else {
      periodBudgetCap = project.budget_hours ?? 0;
    }
  } else if (mode === "amount") {
    const monthly = project.budget_amount ?? 0;
    if (periodMode === "month" && isRetainer) {
      periodBudgetCap = monthly;
    } else if (periodMode === "year" && isRetainer) {
      periodBudgetCap = monthly * 12;
    } else if (periodMode === "term" && isRetainer) {
      periodBudgetCap =
        monthly *
        eachMonthKeyInRange(periodRange.start, periodRange.end).length;
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

  // Hours (incl. monthly hours retainers): Gross Profit color tracks hours_* vs the hour cap.
  // Amount: amount_* on cost vs fee.
  const periodSpendHealth =
    periodBudgetCap != null && (mode === "hours" || mode === "amount")
      ? spendHealth(
          mode,
          mode === "amount" ? periodRevenueCost.cost : periodPlannedHours,
          periodBudgetCap,
          state.organization_settings,
        )
      : "none";
  const marginToneClass =
    periodSpendHealth === "over"
      ? "text-[var(--status-over)]"
      : periodSpendHealth === "near"
        ? "text-[var(--status-near)]"
        : periodSpendHealth === "healthy"
          ? "text-[var(--accent)]"
          : undefined;

  const profitLine =
    mode === "amount" && (project.budget_amount ?? 0) > 0
      ? fx(
          (project.budget_amount ?? 0) *
            (targetCostPct(state.organization_settings) / 100),
        )
      : null;

  const periodRemainingLabel =
    mode === "none"
      ? "—"
      : showAmountMetrics
        ? periodRemainingAmount == null
          ? "—"
          : money(periodRemainingAmount)
        : periodRemainingHours == null
          ? "—"
          : formatHours(periodRemainingHours);

  const periodRevenue =
    mode === "amount" && periodBudgetCap != null
      ? periodBudgetCap
      : periodRevenueCost.revenue;
  const periodMargin =
    mode === "amount" && periodBudgetCap != null
      ? periodRevenue - periodRevenueCost.cost
      : mode === "hours" && periodRevenue > 0
        ? periodRevenue - periodRevenueCost.cost
        : null;
  const periodMarginPct =
    periodMargin == null || periodRevenue <= 0
      ? null
      : (periodMargin / periodRevenue) * 100;

  const targetCostLeft =
    mode === "amount" && periodBudgetCap != null
      ? remainingTargetCostAllowance(
          periodBudgetCap,
          periodRevenueCost.cost,
          state.organization_settings,
        )
      : null;

  const periodHeading =
    periodMode === "month"
      ? periodRange.label
      : periodMode === "todate"
        ? "Project to Date"
        : periodMode === "lifetime"
          ? "Lifetime"
          : periodMode === "term"
            ? "Contract Term"
            : String(year);

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
          {settings.currency_enabled ? (
            <>
              <CurrencyChip currency={projectCur} />
              <CurrencyToggle
                value={activeView}
                onChange={setViewCurrency}
              />
            </>
          ) : null}
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
          <BurnBar
            burn={displayBurn}
            settings={settings}
            currency={activeView}
          />
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[var(--text-muted)]">
                {showAmountMetrics ? "Spend to date" : "Hours used to date"}
              </dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums">
                {showHoursMetrics
                  ? formatHours(
                      isRetainer ? burn.usedHours : hoursFx.hoursUsedToDate,
                    )
                  : showAmountMetrics
                    ? money(burn.usedAmount)
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
                  ? formatHours(
                      isRetainer
                        ? burn.futureHours
                        : hoursFx.hoursFuturePlanned,
                    )
                  : showAmountMetrics
                    ? money(burn.futureAmount)
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
                  (isRetainer
                    ? burn.overBy > 0
                    : hoursFx.overBudget) && "text-[var(--status-over)]",
                )}
              >
                {showHoursMetrics
                  ? isRetainer
                    ? formatHours(burn.remainingHours)
                    : hoursFx.hoursRemaining == null
                      ? "—"
                      : formatHours(hoursFx.hoursRemaining)
                  : showAmountMetrics
                    ? burn.remainingAmount == null
                      ? "—"
                      : money(burn.remainingAmount)
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
                    ? money(burn.totalAmount ?? 0)
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
                    ? money(burn.remainingAmount ?? 0)
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
                    ? money(yearTotals.amount)
                    : formatHours(yearTotals.hours)
                  : mode === "amount"
                    ? money(burn.plannedAmount)
                    : formatHours(hoursFx.hoursTotalPlanned)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
          {isRetainer ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
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
                    {periodMode === "term" ? "Calendar" : `${year} Calendar`}
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
                    {chartUnit === "amount" ? "Spend Per Week" : "Hours Per Week"}
                  </button>
                  {scheduleOutsideDates ? (
                    <OutsideDatesChartNote className="min-w-0 flex-1 text-right sm:min-w-[12rem]" />
                  ) : null}
                </div>
                {retainerTab === "calendar" && periodMode !== "term" ? (
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
                  bars={viewBars(periodMode === "term" ? termBars : yearBars)}
                  unit={chartUnit}
                  monthlyCap={monthlyCap}
                  year={periodMode === "term" ? undefined : year}
                  selectedMonthKey={selectedMonthKey}
                  onMonthSelect={handleMonthSelect}
                />
              ) : weeklyPoints.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No schedule dates to chart yet.
                </p>
              ) : (
                <HoursPerWeekChart points={viewWeeklyPoints(weeklyPoints)} unit={chartUnit} />
              )}
            </>
          ) : (
            <ProjectProgressCharts
              points={viewWeeklyPoints(weeklyPoints)}
              unit={chartUnit}
              budgetHours={mode === "hours" ? project.budget_hours : null}
              budgetAmount={
                mode === "amount" ? fx(project.budget_amount ?? 0) : null
              }
              contractorBaseline={contractorBaseline}
              profitLine={profitLine}
              outsideDatesNote={scheduleOutsideDates}
            />
          )}
        </section>

        <div className="space-y-4">
          <ul className="flex flex-wrap gap-2" role="tablist" aria-label="Period">
            {isRetainer ? (
              <li>
                <PeriodChip
                  label="Month"
                  selected={periodMode === "month"}
                  onSelect={() => setPeriodMode("month")}
                />
              </li>
            ) : (
              <li>
                <PeriodChip
                  label="Project to Date"
                  selected={periodMode === "todate"}
                  onSelect={() => setPeriodMode("todate")}
                />
              </li>
            )}
            <li>
              <PeriodChip
                label="Year"
                selected={periodMode === "year"}
                onSelect={() => setPeriodMode("year")}
              />
            </li>
            {isRetainer && hasContractTerm ? (
              <li>
                <PeriodChip
                  label="Contract Term"
                  selected={periodMode === "term"}
                  onSelect={() => setPeriodMode("term")}
                />
              </li>
            ) : null}
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
            {periodMode === "term" && project.start_date && project.end_date ? (
              <li className="flex items-center text-xs text-[var(--text-muted)]">
                {format(parseISO(project.start_date), "MMM d, yyyy")} –{" "}
                {format(parseISO(project.end_date), "MMM d, yyyy")}
              </li>
            ) : null}
          </ul>

          <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <h2 className="mb-3 text-sm font-semibold">Forecast vs Budget</h2>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              {periodHeading} ·{" "}
              {showHoursMetrics
                ? isRetainer
                  ? "Hour bucket vs planned time, and profit from contracted revenue minus cost."
                  : "Hours, contractor markup, and profit against billed time."
                : showAmountMetrics
                  ? "Spend, contractor expense, and profit against the project fee."
                  : "Schedule and margin against the project."}
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
                      ? money(periodSplit?.usedAmount ?? 0)
                      : formatHours(periodSplit?.usedHours ?? 0)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">Future Planned</dt>
                <dd className="tabular-nums font-medium">
                  {showHoursMetrics
                    ? formatHours(periodSplit?.futureHours ?? 0)
                    : showAmountMetrics
                      ? money(periodSplit?.futureAmount ?? 0)
                      : formatHours(periodSplit?.futureHours ?? 0)}
                </dd>
              </div>
              {periodRevenueCost.contractorCost > 0 ||
              periodRevenueCost.contractorHours > 0 ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-muted)]">Contractor</dt>
                  <dd className="text-right tabular-nums font-medium">
                    {showHoursMetrics ? (
                      <>
                        {formatHours(periodRevenueCost.contractorHours)}
                        <span className="block text-[11px] font-normal text-[var(--text-muted)]">
                          {isRetainer
                            ? `cost ${money(periodRevenueCost.contractorCost)}`
                            : `billed ${money(periodRevenueCost.contractorRevenue)} · cost ${money(periodRevenueCost.contractorCost)}`}
                        </span>
                      </>
                    ) : (
                      money(periodRevenueCost.contractorCost)
                    )}
                  </dd>
                </div>
              ) : null}
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
                  <dt className={cn(marginToneClass ?? "text-[var(--text-muted)]")}>
                    Gross Profit
                  </dt>
                  <dd
                    className={cn(
                      "tabular-nums font-medium",
                      marginToneClass,
                    )}
                  >
                    {money(periodMargin)}
                    {periodMarginPct != null
                      ? ` (${periodMarginPct.toFixed(0)}%)`
                      : ""}
                  </dd>
                </div>
              ) : null}
              {targetCostLeft != null ? (
                <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-2">
                  <dt className="text-[var(--text-muted)]">
                    Remaining Target Cost
                  </dt>
                  <dd
                    className={cn(
                      "tabular-nums font-medium",
                      targetCostLeft < 0 && "text-[var(--status-over)]",
                    )}
                  >
                    {money(targetCostLeft)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-2 text-xs">
                <dt className="text-[var(--text-muted)]">
                  {mode === "hours" ? "Revenue / Cost" : "Fee Burn (Cost)"}
                </dt>
                <dd className="tabular-nums text-[var(--text-muted)]">
                  {mode === "hours"
                    ? `${money(periodRevenue)} / ${money(periodRevenueCost.cost)}`
                    : money(periodRevenueCost.cost)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <h2 className="mb-3 text-sm font-semibold">
              Team · {periodHeading}
            </h2>
            {teamPeriod.staff.length === 0 &&
            teamPeriod.contractors.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">
                No one assigned yet.
              </p>
            ) : (
              <div className="min-w-0 overflow-x-auto">
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
                      <TeamRow key={row.id} row={row} formatAmount={money} />
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
                      <TeamRow key={row.id} row={row} formatAmount={money} />
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
  formatAmount,
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
    mixedCurrency?: boolean;
    nativeCurrency?: CurrencyCode;
  };
  formatAmount: (n: number) => string;
}) {
  const showMoney = row.moneyAmount != null;
  const dashPartial = Boolean(row.dashUsedPlanned) || showMoney;
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
              {row.mixedCurrency && row.nativeCurrency ? (
                <CurrencyChip currency={row.nativeCurrency} />
              ) : null}
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
        {showMoney ? formatAmount(row.moneyAmount!) : formatHours(row.totalHours)}
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
