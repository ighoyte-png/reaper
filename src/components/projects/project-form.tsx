"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  addYears,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Field, inputClass, DateInput, ConfirmDialog } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  PodFilterBar,
  usePodFilter,
} from "@/components/people/pod-filter-bar";
import { ContractorTag } from "@/components/projects/project-manager-person";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import {
  contractorAmountFromHours,
  contractorHoursFromFixedFee,
  defaultContractorTermsForPerson,
  isFullTimeStyleContractor,
  isProjectBasisContractor,
  sortPeopleContractorsLast,
  type ContractorTerms,
} from "@/lib/domain/contractor";
import { filterPeopleByPod } from "@/lib/domain/pods";
import {
  formatHours,
  formatMoney,
  isMonthlyRetainerBudget,
  roundAssignmentHours,
} from "@/lib/domain/budget";
import type {
  BudgetMode,
  ContractorMode,
  Person,
  Pod,
  PodMember,
  Project,
  ProjectContractorExpense,
  ProjectMember,
  ProjectStatus,
  ProjectTemplate,
} from "@/lib/types";

const DEFAULT_PROJECT_COLOR = "#3498DB";

const SANDBOX_ENABLE_WARNING =
  "Changing this project to Sandbox Mode will remove budgets, timelines, and milestones (and other reporting data). Schedule assignments and tasks are kept. The project will be excluded from reporting.";

const SANDBOX_DESCRIPTION =
  "Enable Sandbox Mode to create a project that is 'off the record'. Sandbox Mode projects allow all Team Members to contribute equally, there is no Project Manager. Sandbox Projects can be used for brainstorming new ideas, discussing concepts for a future project, really anything that you can think of. Keep it isolated from the rest of the 'real work'!";

const TABS = [
  { id: "details", label: "Details" },
  { id: "team", label: "Team" },
  { id: "timeline", label: "Timeline" },
  { id: "budget", label: "Budget" },
  { id: "expenses", label: "Contractor Expenses" },
  { id: "sandbox", label: "Sandbox Mode" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function monthKeyFromDate(d: Date): string {
  return format(d, "yyyy-MM-01");
}

function monthLabel(monthKey: string): string {
  try {
    return format(parseISO(monthKey.slice(0, 10)), "MMMM yyyy");
  } catch {
    return monthKey.slice(0, 7);
  }
}

export function ProjectForm({
  project,
  clients,
  people,
  pods = [],
  podMembers = [],
  memberIds,
  onMemberIdsChange,
  contractorTerms = {},
  onContractorTermsChange,
  onChange,
  onSave,
  onCancel,
  onDelete,
  templates = [],
  templateId = "",
  onTemplateIdChange,
  showTemplateSelect = false,
  pmDailyHours,
  onPmDailyHoursChange,
  sandboxWipeRisk = false,
}: {
  project: Omit<Project, "organization_id">;
  clients: { id: string; name: string; color?: string }[];
  people: Person[];
  pods?: Pod[];
  podMembers?: PodMember[];
  memberIds: string[];
  onMemberIdsChange: (ids: string[]) => void;
  contractorTerms?: Record<
    string,
    Pick<
      ProjectMember,
      "contractor_mode" | "contractor_fixed_fee" | "contractor_hours"
    >
  >;
  onContractorTermsChange?: (
    next: Record<string, ContractorTerms>,
  ) => void;
  onChange: (p: Omit<Project, "organization_id">) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  templates?: ProjectTemplate[];
  templateId?: string;
  onTemplateIdChange?: (id: string) => void;
  /** When true, show optional template picker (new projects only). */
  showTemplateSelect?: boolean;
  /** Optional PM daily hours for schedule booking (null/undefined = blank). */
  pmDailyHours?: number | null;
  onPmDailyHoursChange?: (hours: number | null) => void;
  /** When true, enabling sandbox prompts a wipe warning. */
  sandboxWipeRisk?: boolean;
}) {
  const {
    state,
    newId,
    upsertProjectContractorExpense,
    deleteProjectContractorExpense,
  } = useData();
  const [tab, setTab] = useState<TabId>("details");
  const { showPods, podTabs, podFilter, setPodFilter } = usePodFilter(pods);
  const clientsSorted = [...clients].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const peopleSorted = [...people].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const teamPeople = useMemo(() => {
    const filtered = filterPeopleByPod(
      peopleSorted,
      pods,
      podMembers,
      podFilter,
    );
    return sortPeopleContractorsLast(filtered);
  }, [peopleSorted, pods, podMembers, podFilter]);

  const projectBasisTeamMembers = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return memberIds
      .map((id) => byId.get(id))
      .filter((p): p is Person => Boolean(p && isProjectBasisContractor(p)));
  }, [memberIds, people]);

  const fullTimeStyleTeamMembers = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return memberIds
      .map((id) => byId.get(id))
      .filter((p): p is Person => Boolean(p && isFullTimeStyleContractor(p)));
  }, [memberIds, people]);

  function setContractorTerms(
    personId: string,
    patch: Partial<ContractorTerms>,
  ) {
    if (!onContractorTermsChange) return;
    const existing =
      contractorTerms[personId] ??
      defaultContractorTermsForPerson(
        people.find((p) => p.id === personId)!,
      );
    onContractorTermsChange({
      ...contractorTerms,
      [personId]: { ...existing, ...patch },
    });
  }

  function toggleTeamMember(person: Person, checked: boolean) {
    if (checked) {
      onMemberIdsChange([...memberIds, person.id]);
      if (
        onContractorTermsChange &&
        isProjectBasisContractor(person) &&
        !contractorTerms[person.id]
      ) {
        const defaults = defaultContractorTermsForPerson(person);
        onContractorTermsChange({
          ...contractorTerms,
          [person.id]:
            isMonthlyRetainer && defaults.contractor_mode === "fixed_fee"
              ? {
                  ...defaults,
                  contractor_mode: person.hide_from_schedule
                    ? "hours"
                    : "scheduled",
                }
              : defaults,
        });
      }
      return;
    }
    onMemberIdsChange(memberIds.filter((id) => id !== person.id));
    if (onContractorTermsChange && contractorTerms[person.id]) {
      const { [person.id]: _removed, ...rest } = contractorTerms;
      onContractorTermsChange(rest);
    }
  }
  const templatesSorted = [...templates].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  const isMonthlyRetainer = isMonthlyRetainerBudget(project);

  const visibleTabs = useMemo(
    () =>
      TABS.filter((item) => {
        if (
          project.sandbox_mode &&
          (item.id === "timeline" ||
            item.id === "budget" ||
            item.id === "expenses")
        ) {
          return false;
        }
        if (item.id === "expenses" && !isMonthlyRetainer) {
          return false;
        }
        return true;
      }),
    [project.sandbox_mode, isMonthlyRetainer],
  );

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) {
      setTab("details");
    }
  }, [visibleTabs, tab]);

  const [confirmSandbox, setConfirmSandbox] = useState(false);

  const showPmHours =
    Boolean(project.manager_person_id) &&
    Boolean(onPmDailyHoursChange) &&
    !project.sandbox_mode;

  function setMode(mode: BudgetMode) {
    onChange({
      ...project,
      budget_mode: mode,
      budget_hours: mode === "hours" ? (project.budget_hours ?? 80) : null,
      budget_amount: mode === "amount" ? (project.budget_amount ?? 0) : null,
      budget_monthly_reset:
        mode === "hours" || mode === "amount"
          ? Boolean(project.budget_monthly_reset)
          : false,
    });
  }

  function enableSandbox() {
    onChange({
      ...project,
      sandbox_mode: true,
      manager_person_id: null,
    });
  }

  function toggleSandbox(enable: boolean) {
    if (enable) {
      if (sandboxWipeRisk) {
        setConfirmSandbox(true);
        return;
      }
      enableSandbox();
      return;
    }
    onChange({
      ...project,
      sandbox_mode: false,
    });
  }

  return (
    <div className="flex min-h-[22rem] flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-0">
        <nav
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border)] pb-2 sm:w-40 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3"
          aria-label="Project sections"
        >
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "cursor-pointer rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors",
                tab === item.id
                  ? "bg-[var(--row-hover)] font-medium text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
              )}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 min-w-0 flex-1 space-y-3 sm:pl-4">
          {tab === "details" ? (
            <>
              <Field label="Name">
                <input
                  className={inputClass}
                  value={project.name}
                  onChange={(e) =>
                    onChange({ ...project, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Client">
                <Select
                  searchable
                  value={project.client_id ?? ""}
                  onChange={(clientId) => {
                    if (!clientId) return;
                    const client = clientsSorted.find((c) => c.id === clientId);
                    if (!client) return;
                    onChange({
                      ...project,
                      client_id: clientId,
                      color: client.color ?? DEFAULT_PROJECT_COLOR,
                    });
                  }}
                  placeholder={
                    clientsSorted.length === 0
                      ? "Create a client first…"
                      : "Select a client…"
                  }
                  options={[
                    {
                      value: "",
                      label:
                        clientsSorted.length === 0
                          ? "Create a client first…"
                          : "Select a client…",
                      disabled: true,
                    },
                    ...clientsSorted.map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  ]}
                />
              </Field>
              {showTemplateSelect && onTemplateIdChange ? (
                <Field label="Template">
                  <Select
                    searchable
                    value={templateId}
                    onChange={onTemplateIdChange}
                    options={[
                      { value: "", label: "None" },
                      ...templatesSorted.map((t) => ({
                        value: t.id,
                        label: t.name,
                      })),
                    ]}
                  />
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Applies milestones and tasks undated and unassigned after
                    create.
                  </p>
                </Field>
              ) : null}
              <Field label="Status">
                <Select
                  value={project.status}
                  onChange={(v) =>
                    onChange({
                      ...project,
                      status: v as ProjectStatus,
                    })
                  }
                  options={[
                    { value: "active", label: "Active" },
                    { value: "on_hold", label: "On Hold" },
                    { value: "completed", label: "Completed" },
                    { value: "archived", label: "Archived" },
                  ]}
                />
              </Field>
              <Field label="Notes">
                <textarea
                  className={`${inputClass} h-24 py-2`}
                  value={project.notes}
                  onChange={(e) =>
                    onChange({ ...project, notes: e.target.value })
                  }
                />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={Boolean(project.hide_from_public_share)}
                  onChange={(e) =>
                    onChange({
                      ...project,
                      hide_from_public_share: e.target.checked,
                    })
                  }
                />
                <span>
                  Hide Project From Public Share
                  <span className="block text-xs text-[var(--text-muted)]">
                    Omit this project from the org-wide public schedule and
                    reports link
                  </span>
                </span>
              </label>
            </>
          ) : null}

          {tab === "team" ? (
            <>
              <Field label="Team Members">
                {showPods ? (
                  <PodFilterBar
                    pods={podTabs}
                    podFilter={podFilter}
                    onSelect={setPodFilter}
                    className="mb-2"
                    allLabel="All people"
                  />
                ) : null}
                <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-md border border-[var(--border)] p-2">
                  {teamPeople.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      {peopleSorted.length === 0
                        ? "Add people in the directory first."
                        : "No people in this pod."}
                    </p>
                  ) : (
                    teamPeople.map((p) => {
                      const checked = memberIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              toggleTeamMember(p, e.target.checked)
                            }
                          />
                          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                            <span className="min-w-0 truncate">
                              {p.name}
                              {p.role_title ? (
                                <span className="text-[var(--text-muted)]">
                                  {" "}
                                  · {p.role_title}
                                </span>
                              ) : null}
                            </span>
                            {p.is_contractor ? <ContractorTag /> : null}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </Field>
              {!project.sandbox_mode ? (
              <Field label="Project Manager">
                <Select
                  searchable
                  value={project.manager_person_id ?? ""}
                  onChange={(v) =>
                    onChange({
                      ...project,
                      manager_person_id: v || null,
                    })
                  }
                  options={[
                    { value: "", label: "None" },
                    ...peopleSorted.map((p) => ({
                      value: p.id,
                      label: p.role_title
                        ? `${p.name} · ${p.role_title}`
                        : p.name,
                    })),
                  ]}
                />
              </Field>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  Sandbox Mode is on — all team members share project
                  management powers. There is no Project Manager.
                </p>
              )}
            </>
          ) : null}

          {tab === "timeline" ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start Date">
                  <DateInput
                    className={inputClass}
                    value={project.start_date ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...project,
                        start_date: e.target.value || null,
                      })
                    }
                  />
                </Field>
                <Field label="Completion Date">
                  <DateInput
                    className={inputClass}
                    value={project.end_date ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...project,
                        end_date: e.target.value || null,
                      })
                    }
                  />
                </Field>
              </div>
              {showPmHours ? (
                <Field label="Project Manager Daily Hours (Optional)">
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    className={inputClass}
                    value={pmDailyHours ?? ""}
                    placeholder="e.g. 1"
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        onPmDailyHoursChange?.(null);
                        return;
                      }
                      onPmDailyHoursChange?.(Number(raw) || 0);
                    }}
                    onBlur={() => {
                      if (pmDailyHours == null || pmDailyHours <= 0) {
                        onPmDailyHoursChange?.(null);
                        return;
                      }
                      onPmDailyHoursChange?.(
                        Math.max(0.01, roundAssignmentHours(pmDailyHours)),
                      );
                    }}
                  />
                  <p className="mt-1.5 text-[11px] leading-snug text-[var(--text-muted)]">
                    Project Management time isn&apos;t free! Estimate your daily
                    average for the duration of the project timeline to keep
                    reporting accurate. The assignment will automatically be
                    added to your schedule.
                  </p>
                </Field>
              ) : null}
            </div>
          ) : null}

          {tab === "budget" ? (
            <>
              <Field label="Budget Type">
                <Select
                  value={project.budget_mode}
                  onChange={(v) => setMode(v as BudgetMode)}
                  options={[
                    {
                      value: "none",
                      label: "None (Internal / Time-Off Tracking)",
                    },
                    {
                      value: "hours",
                      label: "Hourly (Total Hours Bucket)",
                    },
                    {
                      value: "amount",
                      label: "Dollar Amount (Hours × Bill Rates)",
                    },
                  ]}
                />
              </Field>
              {project.budget_mode === "hours" ? (
                <Field label="Total Budget (Hours)">
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={project.budget_hours ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...project,
                        budget_hours: Number(e.target.value) || 0,
                      })
                    }
                  />
                </Field>
              ) : null}
              {project.budget_mode === "amount" ? (
                <Field label="Total Budget ($)">
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={project.budget_amount ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...project,
                        budget_amount:
                          e.target.value === ""
                            ? null
                            : Number(e.target.value) || 0,
                      })
                    }
                  />
                </Field>
              ) : null}
              {project.budget_mode === "hours" ||
              project.budget_mode === "amount" ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={Boolean(project.budget_monthly_reset)}
                    onChange={(e) =>
                      onChange({
                        ...project,
                        budget_monthly_reset: e.target.checked,
                      })
                    }
                  />
                  <span>
                    Monthly Reset
                    <span className="block text-xs text-[var(--text-muted)]">
                      {project.budget_mode === "amount"
                        ? "Treat the dollar budget as a recurring monthly retainer"
                        : "Treat the hours budget as a recurring monthly retainer"}
                    </span>
                  </span>
                </label>
              ) : null}
              {fullTimeStyleTeamMembers.length > 0 ? (
                <p className="text-xs leading-snug text-[var(--text-muted)]">
                  {fullTimeStyleTeamMembers.length === 1
                    ? `${fullTimeStyleTeamMembers[0]!.name} is a contractor on the schedule — no per-project terms needed.`
                    : `${fullTimeStyleTeamMembers.length} contractors on the schedule use their profile rates — no per-project terms needed.`}
                </p>
              ) : null}
              {isMonthlyRetainer && projectBasisTeamMembers.length > 0 ? (
                <p className="text-xs leading-snug text-[var(--text-muted)]">
                  Dollar fees go on the Contractor Expenses tab. Hours and
                  Scheduled Time terms below still apply each month.
                </p>
              ) : null}
              {projectBasisTeamMembers.length > 0 ? (
                <div className="space-y-4 border-t border-[var(--border)] pt-3">
                  <p className="text-xs font-medium text-[var(--text-muted)]">
                    Contractor Terms
                  </p>
                  {projectBasisTeamMembers.map((person) => {
                    const terms =
                      contractorTerms[person.id] ??
                      defaultContractorTermsForPerson(person);
                    const mode = terms.contractor_mode ?? "fixed_fee";
                    const fixedFee = terms.contractor_fixed_fee ?? 0;
                    const hours = terms.contractor_hours ?? 0;
                    const computedHours = contractorHoursFromFixedFee(
                      fixedFee,
                      person,
                    );
                    const computedAmount = contractorAmountFromHours(
                      hours,
                      person,
                    );
                    const termOptions = (
                      isMonthlyRetainer
                        ? ([
                            { value: "hours", label: "Hours" },
                            {
                              value: "scheduled",
                              label: "Use Scheduled Time",
                              disabled: person.hide_from_schedule,
                            },
                          ] as const)
                        : ([
                            { value: "fixed_fee", label: "Fixed Fee" },
                            { value: "hours", label: "Hours" },
                            {
                              value: "scheduled",
                              label: "Use Scheduled Time",
                              disabled: person.hide_from_schedule,
                            },
                          ] as const)
                    );

                    return (
                      <div
                        key={person.id}
                        className="space-y-2 rounded-md border border-[var(--border)] p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {person.name}
                          </span>
                          <ContractorTag />
                        </div>
                        <div className="flex flex-wrap gap-3 text-sm">
                          {termOptions.map((opt) => (
                            <label
                              key={opt.value}
                              className={cn(
                                "flex cursor-pointer items-center gap-1.5",
                                "disabled" in opt && opt.disabled
                                  ? "cursor-not-allowed opacity-40"
                                  : "",
                              )}
                            >
                              <input
                                type="radio"
                                name={`contractor-mode-${person.id}`}
                                checked={mode === opt.value}
                                disabled={"disabled" in opt && opt.disabled}
                                onChange={() =>
                                  setContractorTerms(person.id, {
                                    contractor_mode: opt.value as ContractorMode,
                                  })
                                }
                              />
                              {opt.label}
                            </label>
                          ))}
                        </div>
                        {isMonthlyRetainer && mode === "fixed_fee" ? (
                          <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                            Use the Contractor Expenses tab for fixed dollar
                            fees on monthly projects.
                          </p>
                        ) : null}
                        {!isMonthlyRetainer && mode === "fixed_fee" ? (
                          <div className="space-y-1">
                            <label className="block text-xs text-[var(--text-muted)]">
                              Fixed Fee ($)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className={inputClass}
                              value={terms.contractor_fixed_fee ?? ""}
                              onChange={(e) =>
                                setContractorTerms(person.id, {
                                  contractor_fixed_fee:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value) || 0,
                                })
                              }
                            />
                            {fixedFee > 0 ? (
                              <p className="text-[11px] text-[var(--text-muted)]">
                                ≈ {formatHours(computedHours)} at profile rate
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {mode === "hours" ? (
                          <div className="space-y-1">
                            <label className="block text-xs text-[var(--text-muted)]">
                              Hours
                              {isMonthlyRetainer ? " (Per Month)" : ""}
                            </label>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className={inputClass}
                              value={terms.contractor_hours ?? ""}
                              onChange={(e) =>
                                setContractorTerms(person.id, {
                                  contractor_hours:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value) || 0,
                                })
                              }
                            />
                            {hours > 0 ? (
                              <p className="text-[11px] text-[var(--text-muted)]">
                                ≈ {formatMoney(computedAmount)} at profile rate
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {mode === "scheduled" ? (
                          <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                            Budget uses scheduled assignment hours for this
                            contractor.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : null}

          {tab === "expenses" && isMonthlyRetainer ? (
            <ContractorExpensesPanel
              project={project}
              contractors={projectBasisTeamMembers}
              expenses={state.project_contractor_expenses.filter(
                (e) => e.project_id === project.id,
              )}
              newId={newId}
              onUpsert={upsertProjectContractorExpense}
              onDelete={deleteProjectContractorExpense}
            />
          ) : null}

          {tab === "sandbox" ? (
            <div className="space-y-4">
              <Button
                type="button"
                variant={project.sandbox_mode ? "secondary" : "primary"}
                onClick={() => toggleSandbox(!project.sandbox_mode)}
              >
                {project.sandbox_mode
                  ? "Disable Sandbox Mode"
                  : "Enable Sandbox Mode"}
              </Button>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                {SANDBOX_DESCRIPTION}
              </p>
              {project.sandbox_mode ? (
                <p className="text-xs leading-snug text-[var(--text-muted)]">
                  Save to apply. Enabling Sandbox Mode removes budgets,
                  timelines, and milestones (tasks and schedule assignments are
                  kept). The project stays off reporting. Disabling restores the
                  standard project layout.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex justify-between border-t border-[var(--border)] pt-3">
        {onDelete ? (
          <button
            type="button"
            className="cursor-pointer text-sm text-[var(--status-over)]"
            onClick={onDelete}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className="h-9 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-9 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm text-[var(--accent-fg)] disabled:opacity-40"
            disabled={!project.client_id || clientsSorted.length === 0}
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
      {confirmSandbox ? (
        <ConfirmDialog
          title="Enable Sandbox Mode?"
          message={SANDBOX_ENABLE_WARNING}
          confirmLabel="Enable"
          onCancel={() => setConfirmSandbox(false)}
          onConfirm={() => {
            setConfirmSandbox(false);
            enableSandbox();
          }}
        />
      ) : null}
    </div>
  );
}

function ContractorExpensesPanel({
  project,
  contractors,
  expenses,
  newId,
  onUpsert,
  onDelete,
}: {
  project: Omit<Project, "organization_id">;
  contractors: Person[];
  expenses: ProjectContractorExpense[];
  newId: (prefix: string) => string;
  onUpsert: (
    expense: Omit<ProjectContractorExpense, "organization_id"> & {
      organization_id?: string;
    },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { state } = useData();
  const thisMonth = startOfMonth(new Date());
  const [month, setMonth] = useState(thisMonth);
  const [personId, setPersonId] = useState(contractors[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editRepeat, setEditRepeat] = useState(false);

  const viewedMonthKey = monthKeyFromDate(month);
  const viewedPrefix = viewedMonthKey.slice(0, 7);
  const isViewingCurrentMonth = isSameMonth(month, thisMonth);

  useEffect(() => {
    if (!personId && contractors[0]) setPersonId(contractors[0].id);
  }, [contractors, personId]);

  const monthRows = useMemo(() => {
    return expenses
      .filter((e) => {
        const expenseMonth = e.month_key.slice(0, 7);
        if (e.repeat_monthly) return expenseMonth <= viewedPrefix;
        return expenseMonth === viewedPrefix;
      })
      .sort((a, b) => {
        const an =
          contractors.find((c) => c.id === a.person_id)?.name ??
          state.people.find((p) => p.id === a.person_id)?.name ??
          "";
        const bn =
          contractors.find((c) => c.id === b.person_id)?.name ??
          state.people.find((p) => p.id === b.person_id)?.name ??
          "";
        return an.localeCompare(bn, undefined, { sensitivity: "base" });
      });
  }, [expenses, viewedPrefix, contractors, state.people]);

  function personName(personIdValue: string) {
    return (
      contractors.find((c) => c.id === personIdValue)?.name ??
      state.people.find((p) => p.id === personIdValue)?.name ??
      "Contractor"
    );
  }

  async function addExpense() {
    if (!personId || !project.id) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) return;
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      await onUpsert({
        id: newId("pce"),
        project_id: project.id,
        person_id: personId,
        month_key: viewedMonthKey,
        amount: value,
        notes: notes.trim(),
        repeat_monthly: repeatMonthly,
        created_at: nowIso,
        updated_at: nowIso,
        created_by_profile_id: null,
      });
      setAmount("");
      setNotes("");
      setRepeatMonthly(false);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(row: ProjectContractorExpense) {
    const value = Number(editAmount);
    if (!Number.isFinite(value) || value < 0) return;
    setSaving(true);
    try {
      await onUpsert({
        ...row,
        amount: value,
        notes: editNotes.trim(),
        repeat_monthly: editRepeat,
        updated_at: new Date().toISOString(),
      });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  if (!project.id) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Save the project first, then add contractor expenses.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <p className="text-sm text-[var(--text-muted)]">
        Add contractor costs for the selected month. Repeat Monthly applies the
        same amount from that month onward.
      </p>

      <div>
        <div className="mb-2 flex items-center gap-0.5">
          <button
            type="button"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            aria-label="Previous year"
            title="Previous year"
            onClick={() => setMonth((m) => startOfMonth(addYears(m, -1)))}
          >
            <ChevronsLeft size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            aria-label="Previous month"
            title="Previous month"
            onClick={() => setMonth((m) => startOfMonth(addMonths(m, -1)))}
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <div className="min-w-0 flex-1 text-center text-xs font-medium text-[var(--text)]">
            {format(month, "MMMM yyyy")}
          </div>
          <button
            type="button"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            aria-label="Next month"
            title="Next month"
            onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))}
          >
            <ChevronRight size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            aria-label="Next year"
            title="Next year"
            onClick={() => setMonth((m) => startOfMonth(addYears(m, 1)))}
          >
            <ChevronsRight size={15} strokeWidth={2} />
          </button>
        </div>
        {!isViewingCurrentMonth ? (
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              className="cursor-pointer text-[11px] text-[var(--accent)] hover:underline"
              onClick={() => setMonth(thisMonth)}
            >
              Today
            </button>
          </div>
        ) : null}

        <div className="min-h-[8rem] rounded-md border border-[var(--border)] p-3">
          {monthRows.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No contractor expenses for {format(month, "MMMM yyyy")}.
            </p>
          ) : (
            <ul className="space-y-2">
              {monthRows.map((row) => {
                const editing = editingId === row.id;
                return (
                  <li
                    key={row.id}
                    className="rounded-md border border-[var(--border)] px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {personName(row.person_id)}
                          </span>
                          <ContractorTag />
                          {row.repeat_monthly ? (
                            <span className="text-[10px] text-[var(--text-muted)]">
                              Repeat Monthly
                              {row.month_key.slice(0, 7) !== viewedPrefix
                                ? ` · from ${monthLabel(row.month_key)}`
                                : ""}
                            </span>
                          ) : null}
                        </div>
                        {!editing ? (
                          <>
                            <p className="text-sm tabular-nums">
                              {formatMoney(row.amount)}
                            </p>
                            {row.notes ? (
                              <p className="text-xs text-[var(--text-muted)]">
                                {row.notes}
                              </p>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                      {!editing ? (
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
                            onClick={() => {
                              setEditingId(row.id);
                              setEditAmount(String(row.amount));
                              setEditNotes(row.notes ?? "");
                              setEditRepeat(Boolean(row.repeat_monthly));
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--status-over)]"
                            onClick={() => void onDelete(row.id)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {editing ? (
                      <div className="mt-2 space-y-2">
                        <Field label="Amount ($)">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className={inputClass}
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                          />
                        </Field>
                        <Field label="Notes">
                          <input
                            className={inputClass}
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Optional"
                          />
                        </Field>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editRepeat}
                            onChange={(e) => setEditRepeat(e.target.checked)}
                          />
                          Repeat Monthly
                        </label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            disabled={saving || editAmount === ""}
                            onClick={() => void saveEdit(row)}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={saving}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {contractors.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Add a Project-Basis Contractor on the Team tab first.
        </p>
      ) : (
        <div className="space-y-3 rounded-md border border-[var(--border)] p-3">
          <p className="text-sm font-medium">Add Expense</p>
          <Field label="Contractor">
            <Select
              value={personId}
              onChange={setPersonId}
              options={contractors.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={repeatMonthly}
              onChange={(e) => setRepeatMonthly(e.target.checked)}
            />
            Repeat Monthly
          </label>
          {!repeatMonthly ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Month">
                <div className="flex h-9 items-center rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--text-muted)]">
                  {format(month, "MMM yyyy")}
                </div>
              </Field>
              <Field label="Amount ($)">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={inputClass}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
            </div>
          ) : (
            <Field label="Amount ($)">
              <input
                type="number"
                min={0}
                step={0.01}
                className={inputClass}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          )}
          <Field label="Notes">
            <input
              className={inputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Button
            type="button"
            disabled={saving || !personId || amount === ""}
            onClick={() => void addExpense()}
          >
            Add Expense
          </Button>
        </div>
      )}
    </div>
  );
}
