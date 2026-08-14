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
  CalendarClock,
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
  contractorExpenseAppliesInMonth,
  defaultContractorRepeatEndMonth,
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
  { id: "expenses", label: "Contractors" },
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
        return true;
      }),
    [project.sandbox_mode],
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
      bill_rate:
        mode === "hours" ? (project.bill_rate ?? 150) : null,
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
                      label: "Hourly (Time & Materials)",
                    },
                    {
                      value: "amount",
                      label: "Fixed Fee (Dollar)",
                    },
                  ]}
                />
              </Field>
              {project.budget_mode === "hours" ? (
                <>
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
                  <Field label="Project Bill Rate">
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={project.bill_rate ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...project,
                          bill_rate:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value) || 0,
                        })
                      }
                    />
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Revenue for T&amp;M is planned hours × this rate. Falls
                      back to the org default when empty.
                    </p>
                  </Field>
                </>
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
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Fixed fee is tracked against labor cost rates (and
                    contractor expenses), not project bill rates.
                  </p>
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
                        ? "Treat the fixed fee as a recurring monthly retainer"
                        : "Treat the hours budget as a recurring monthly retainer (fixed hour bucket billed at the project bill rate each month)"}
                    </span>
                  </span>
                </label>
              ) : null}
            </>
          ) : null}

          {tab === "expenses" ? (
            isMonthlyRetainer ? (
              <ContractorsPanel
                project={project}
                contractors={[
                  ...projectBasisTeamMembers,
                  ...fullTimeStyleTeamMembers,
                ]}
                expenses={state.project_contractor_expenses.filter(
                  (e) => e.project_id === project.id,
                )}
                contractorTerms={contractorTerms}
                setContractorTerms={setContractorTerms}
                newId={newId}
                onUpsert={upsertProjectContractorExpense}
                onDelete={deleteProjectContractorExpense}
              />
            ) : (
              <ClassicContractorTermsPanel
                contractors={[
                  ...projectBasisTeamMembers,
                  ...fullTimeStyleTeamMembers,
                ]}
                contractorTerms={contractorTerms}
                setContractorTerms={setContractorTerms}
              />
            )
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

function ClassicContractorTermsPanel({
  contractors,
  contractorTerms,
  setContractorTerms,
}: {
  contractors: Person[];
  contractorTerms: Record<
    string,
    Pick<
      ProjectMember,
      "contractor_mode" | "contractor_fixed_fee" | "contractor_hours"
    >
  >;
  setContractorTerms: (personId: string, patch: Partial<ContractorTerms>) => void;
}) {
  if (contractors.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Add a contractor on the Team tab first, then set Fixed Fee, Hours, or
        Schedule Time here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {contractors.map((person) => {
        const scheduleOnly = isFullTimeStyleContractor(person);
        const terms =
          contractorTerms[person.id] ?? defaultContractorTermsForPerson(person);
        const mode = scheduleOnly
          ? "scheduled"
          : (terms.contractor_mode ?? "fixed_fee");
        const fixedFee = terms.contractor_fixed_fee ?? 0;
        const hours = terms.contractor_hours ?? 0;
        const computedHours = contractorHoursFromFixedFee(fixedFee, person);
        const computedAmount = contractorAmountFromHours(hours, person);
        const termOptions = [
          {
            value: "fixed_fee" as const,
            label: "Fixed Fee",
            disabled: scheduleOnly,
          },
          {
            value: "hours" as const,
            label: "Hours",
            disabled: scheduleOnly,
          },
          {
            value: "scheduled" as const,
            label: "Use Scheduled Time",
            disabled: !scheduleOnly && person.hide_from_schedule,
          },
        ];

        return (
          <div
            key={person.id}
            className="space-y-2 rounded-md border border-[var(--border)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{person.name}</span>
              <ContractorTag />
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {termOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5",
                    opt.disabled ? "cursor-not-allowed opacity-40" : "",
                  )}
                >
                  <input
                    type="radio"
                    name={`contractor-mode-${person.id}`}
                    checked={mode === opt.value}
                    disabled={opt.disabled}
                    onChange={() => {
                      if (opt.value === "fixed_fee") {
                        setContractorTerms(person.id, {
                          contractor_mode: "fixed_fee",
                          contractor_hours: null,
                        });
                      } else if (opt.value === "hours") {
                        setContractorTerms(person.id, {
                          contractor_mode: "hours",
                          contractor_fixed_fee: null,
                        });
                      } else {
                        setContractorTerms(person.id, {
                          contractor_mode: "scheduled",
                          contractor_hours: null,
                          contractor_fixed_fee: null,
                        });
                      }
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {scheduleOnly ? (
              <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                {person.name} is a contractor on the schedule — Dollars and Hours
                options not available.
              </p>
            ) : (
              <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                Only one selection can be used at a time. Choosing a new
                selection clears the previous selection on save.
              </p>
            )}
            {!scheduleOnly && mode === "fixed_fee" ? (
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
                      contractor_mode: "fixed_fee",
                      contractor_fixed_fee:
                        e.target.value === ""
                          ? null
                          : Number(e.target.value) || 0,
                      contractor_hours: null,
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
            {!scheduleOnly && mode === "hours" ? (
              <div className="space-y-1">
                <label className="block text-xs text-[var(--text-muted)]">
                  Hours
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={inputClass}
                  value={terms.contractor_hours ?? ""}
                  onChange={(e) =>
                    setContractorTerms(person.id, {
                      contractor_mode: "hours",
                      contractor_hours:
                        e.target.value === ""
                          ? null
                          : Number(e.target.value) || 0,
                      contractor_fixed_fee: null,
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
                Budget uses scheduled assignment hours for this contractor.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ContractorsPanel({
  project,
  contractors,
  expenses,
  contractorTerms,
  setContractorTerms,
  newId,
  onUpsert,
  onDelete,
}: {
  project: Omit<Project, "organization_id">;
  contractors: Person[];
  expenses: ProjectContractorExpense[];
  contractorTerms: Record<
    string,
    Pick<
      ProjectMember,
      "contractor_mode" | "contractor_fixed_fee" | "contractor_hours"
    >
  >;
  setContractorTerms: (personId: string, patch: Partial<ContractorTerms>) => void;
  newId: (prefix: string) => string;
  onUpsert: (
    expense: Omit<ProjectContractorExpense, "organization_id"> & {
      organization_id?: string;
    },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
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
    if (contractors.length === 0) {
      setPersonId("");
      return;
    }
    if (!personId || !contractors.some((c) => c.id === personId)) {
      setPersonId(contractors[0]!.id);
    }
  }, [contractors, personId]);

  const selected = contractors.find((c) => c.id === personId) ?? null;
  const scheduleOnly = selected
    ? isFullTimeStyleContractor(selected)
    : false;
  const terms = selected
    ? (contractorTerms[selected.id] ?? defaultContractorTermsForPerson(selected))
    : null;
  const termMode = scheduleOnly
    ? "scheduled"
    : (terms?.contractor_mode ?? "fixed_fee");
  const uiMode: "dollars" | "hours" | "scheduled" =
    termMode === "hours"
      ? "hours"
      : termMode === "scheduled"
        ? "scheduled"
        : "dollars";
  const monthRows = useMemo(() => {
    if (!selected) return [];
    return expenses
      .filter((e) => {
        if (e.person_id !== selected.id) return false;
        if (!contractorExpenseAppliesInMonth(project, e, viewedPrefix)) {
          return false;
        }
        if (uiMode === "hours") return (e.hours ?? 0) > 0;
        if (uiMode === "dollars") return (e.amount ?? 0) > 0;
        return false;
      })
      .sort((a, b) => a.month_key.localeCompare(b.month_key));
  }, [expenses, selected, viewedPrefix, project, uiMode]);

  const entryPreview =
    selected && uiMode === "hours" && Number(amount) > 0
      ? contractorAmountFromHours(Number(amount), selected)
      : 0;

  async function addExpense() {
    if (!selected || !project.id) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    const isHours = uiMode === "hours";
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      await onUpsert({
        id: newId("pce"),
        project_id: project.id,
        person_id: selected.id,
        month_key: viewedMonthKey,
        amount: isHours ? 0 : value,
        hours: isHours ? value : 0,
        notes: notes.trim(),
        repeat_monthly: repeatMonthly,
        repeat_end_month: null,
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
    if (!Number.isFinite(value) || value <= 0) return;
    const isHours = uiMode === "hours";
    setSaving(true);
    try {
      await onUpsert({
        ...row,
        amount: isHours ? 0 : value,
        hours: isHours ? value : 0,
        notes: editNotes.trim(),
        repeat_monthly: editRepeat,
        repeat_end_month: editRepeat ? row.repeat_end_month : null,
        updated_at: new Date().toISOString(),
      });
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  async function endRepeating(row: ProjectContractorExpense) {
    setSaving(true);
    try {
      await onUpsert({
        ...row,
        repeat_monthly: true,
        repeat_end_month: defaultContractorRepeatEndMonth(row.month_key),
        updated_at: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  }

  if (!project.id) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Save the project first, then configure contractors.
      </p>
    );
  }

  if (contractors.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Add a contractor on the Team tab first, then set Dollars, Hours, or
        Schedule Time here.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {contractors.map((c) => {
          const active = c.id === personId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setPersonId(c.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
                active
                  ? "border-[var(--text)] bg-[var(--bg-elevated)] text-[var(--text)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
              )}
            >
              <span className="max-w-[10rem] truncate">{c.name}</span>
              <ContractorTag />
            </button>
          );
        })}
      </div>

      {selected ? (
        <>
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                {
                  value: "dollars" as const,
                  label: "Dollars",
                  disabled: scheduleOnly,
                },
                {
                  value: "hours" as const,
                  label: "Hours",
                  disabled: scheduleOnly,
                },
                {
                  value: "scheduled" as const,
                  label: "Use Schedule Time",
                  disabled: !scheduleOnly && selected.hide_from_schedule,
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5",
                  opt.disabled ? "cursor-not-allowed opacity-40" : "",
                )}
              >
                <input
                  type="radio"
                  name={`contractor-ui-mode-${selected.id}`}
                  checked={uiMode === opt.value}
                  disabled={opt.disabled}
                  onChange={() => {
                    if (opt.value === "dollars") {
                      setContractorTerms(selected.id, {
                        contractor_mode: "fixed_fee",
                        contractor_hours: null,
                        contractor_fixed_fee: null,
                      });
                    } else if (opt.value === "hours") {
                      setContractorTerms(selected.id, {
                        contractor_mode: "hours",
                        contractor_fixed_fee: null,
                        contractor_hours: null,
                      });
                    } else {
                      setContractorTerms(selected.id, {
                        contractor_mode: "scheduled",
                        contractor_hours: null,
                        contractor_fixed_fee: null,
                      });
                    }
                  }}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {scheduleOnly ? (
            <p className="text-[11px] leading-snug text-[var(--text-muted)]">
              {selected.name} is a contractor on the schedule — Dollars and Hours
              options not available.
            </p>
          ) : (
            <p className="text-[11px] leading-snug text-[var(--text-muted)]">
              Only one selection can be used at a time. Choosing a new selection
              clears the previous selection on save.
            </p>
          )}

          {uiMode === "scheduled" ? (
            <p className="text-sm text-[var(--text-muted)]">
              Budget uses this contractor&apos;s scheduled assignment hours.
            </p>
          ) : null}

          {!scheduleOnly && (uiMode === "dollars" || uiMode === "hours") ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-muted)]">
                {uiMode === "hours"
                  ? "Add hours for this contractor. Repeat Monthly applies the same hours from the selected month through the end of the project timeline or the calendar year, whichever comes first. Does not create schedule assignments."
                  : "Add dollar expenses for this contractor. Repeat Monthly applies the same amount from the selected month through the end of the project timeline or the calendar year, whichever comes first."}
              </p>

              <div className="space-y-3 rounded-md border border-[var(--border)] p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label={uiMode === "hours" ? "Hours" : "Amount ($)"}>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className={inputClass}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </Field>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={repeatMonthly}
                      onChange={(e) => setRepeatMonthly(e.target.checked)}
                    />
                    Repeat Monthly
                  </label>
                </div>
                {!repeatMonthly ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Adding to {format(month, "MMMM yyyy")}. Use the calendar
                    below to choose another month.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">
                    Starts {format(month, "MMMM yyyy")} and repeats through the
                    apply window.
                  </p>
                )}
                {uiMode === "hours" && entryPreview > 0 ? (
                  <p className="text-[11px] text-[var(--text-muted)]">
                    ≈ {formatMoney(entryPreview)} at profile rate
                  </p>
                ) : null}
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
                  variant="primary"
                  disabled={saving || amount === ""}
                  onClick={() => void addExpense()}
                >
                  {uiMode === "hours" ? "Add Hours" : "Add Expense"}
                </Button>
              </div>

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
                  <div className="flex min-w-0 flex-1 items-center justify-center gap-1 text-xs font-medium text-[var(--text)]">
                    <span>{format(month, "MMMM yyyy")}</span>
                    {!isViewingCurrentMonth ? (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--accent)] hover:bg-[var(--row-hover)]"
                        aria-label="Jump to current month"
                        title="Jump to current month"
                        onClick={() => setMonth(thisMonth)}
                      >
                        <CalendarClock size={15} strokeWidth={2} />
                      </button>
                    ) : null}
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

                <div className="min-h-[8rem] rounded-md border border-[var(--border)] p-3">
                  {monthRows.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">
                      No {uiMode === "hours" ? "hours" : "expenses"} for{" "}
                      {selected.name} in {format(month, "MMMM yyyy")}.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {monthRows.map((row) => {
                        const editing = editingId === row.id;
                        const ended = Boolean(row.repeat_end_month);
                        const canEndRepeat =
                          row.repeat_monthly && !ended;
                        const displayValue =
                          uiMode === "hours"
                            ? formatHours(row.hours ?? 0)
                            : formatMoney(row.amount);
                        return (
                          <li
                            key={row.id}
                            className="rounded-md border border-[var(--border)] px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  {row.repeat_monthly ? (
                                    <span className="text-[10px] text-[var(--text-muted)]">
                                      Repeat Monthly
                                      {row.month_key.slice(0, 7) !== viewedPrefix
                                        ? ` · from ${monthLabel(row.month_key)}`
                                        : ""}
                                      {ended
                                        ? ` · ended ${monthLabel(row.repeat_end_month!)}`
                                        : ""}
                                    </span>
                                  ) : null}
                                </div>
                                {!editing ? (
                                  <>
                                    <p className="text-sm tabular-nums">
                                      {displayValue}
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
                                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                                  {canEndRepeat ? (
                                    <button
                                      type="button"
                                      className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
                                      disabled={saving}
                                      onClick={() => void endRepeating(row)}
                                    >
                                      End repeating
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--accent)]"
                                    onClick={() => {
                                      setEditingId(row.id);
                                      setEditAmount(
                                        String(
                                          uiMode === "hours"
                                            ? row.hours
                                            : row.amount,
                                        ),
                                      );
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
                                <Field
                                  label={
                                    uiMode === "hours" ? "Hours" : "Amount ($)"
                                  }
                                >
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    className={inputClass}
                                    value={editAmount}
                                    onChange={(e) =>
                                      setEditAmount(e.target.value)
                                    }
                                  />
                                </Field>
                                <Field label="Notes">
                                  <input
                                    className={inputClass}
                                    value={editNotes}
                                    onChange={(e) =>
                                      setEditNotes(e.target.value)
                                    }
                                    placeholder="Optional"
                                  />
                                </Field>
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={editRepeat}
                                    onChange={(e) =>
                                      setEditRepeat(e.target.checked)
                                    }
                                  />
                                  Repeat Monthly
                                </label>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="primary"
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
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
