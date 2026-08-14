"use client";

import { useMemo } from "react";
import { clsx } from "clsx";
import {
  formatHours,
  formatMoney,
} from "@/lib/domain/budget";
import {
  productionHoursEstimate,
  type ProductionHoursEstimate,
} from "@/lib/domain/production-hours";
import { DEFAULT_ORG_BUDGET_SETTINGS } from "@/lib/domain/org-settings";
import type {
  Assignment,
  OrganizationSettings,
  Person,
  Project,
  ProjectContractorExpense,
  ProjectMember,
} from "@/lib/types";

const hatchStyle = {
  backgroundImage:
    "repeating-linear-gradient(-45deg, transparent, transparent 3px, var(--progress-approved-hatch) 3px, var(--progress-approved-hatch) 5px)",
} as const;

function healthTextClass(health: ProductionHoursEstimate["health"]) {
  return clsx(
    health === "over" && "text-[var(--status-over)]",
    health === "near" && "text-[var(--status-near)]",
    (health === "healthy" || health === "none") && "text-[var(--accent)]",
  );
}

function ProductionHoursBar({
  estimate,
}: {
  estimate: ProductionHoursEstimate;
}) {
  const cap = estimate.targetMarginHours;
  const contractorPct =
    cap > 0 ? (estimate.contractorHoursEquiv / cap) * 100 : 0;
  const usedPct = cap > 0 ? (estimate.usedHours / cap) * 100 : 0;
  const futurePct = cap > 0 ? (estimate.futureHours / cap) * 100 : 0;
  const availableHours = Math.max(0, estimate.remainingTargetHours);
  const availablePct = cap > 0 ? (availableHours / cap) * 100 : 0;

  const fillClass = clsx(
    estimate.health === "over" && "bg-[var(--status-over)]",
    estimate.health === "near" && "bg-[var(--status-near)]",
    (estimate.health === "healthy" || estimate.health === "none") &&
      "bg-[var(--accent)]",
  );
  const contractorFillClass = clsx(
    estimate.health === "over" && "bg-[var(--status-over)]",
    estimate.health === "near" && "bg-[var(--status-near)]",
    (estimate.health === "healthy" || estimate.health === "none") &&
      "bg-[var(--status-healthy)]",
  );

  const hasContractor = contractorPct > 0;
  const hasUsed = usedPct > 0;
  const hasFuture = futurePct > 0;
  const hasAvailable = availablePct > 0 && estimate.health !== "over";

  return (
    <div className="min-w-0">
      <div
        className="flex h-4 overflow-hidden rounded-full bg-[var(--border)]"
        title={`${formatHours(estimate.usedHours)} used · ${formatHours(estimate.futureHours)} planned`}
      >
        {hasContractor ? (
          <div
            className={clsx("h-full shrink-0", contractorFillClass)}
            style={{ width: `${Math.min(100, contractorPct)}%` }}
          />
        ) : null}
        {hasUsed ? (
          <div
            className={clsx("h-full shrink-0", fillClass)}
            style={{ width: `${Math.min(100, usedPct)}%` }}
          />
        ) : null}
        {hasFuture ? (
          <div
            className={clsx(
              "relative h-full min-w-0 shrink-0 overflow-hidden",
              fillClass,
            )}
            style={{ width: `${Math.min(100, futurePct)}%` }}
          >
            <div className="absolute inset-0" style={hatchStyle} aria-hidden />
          </div>
        ) : null}
        {hasAvailable ? (
          <div
            className="h-full shrink-0 bg-[var(--hours-available)]"
            style={{ width: `${Math.min(100, availablePct)}%` }}
          />
        ) : null}
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
        {estimate.contractorHoursEquiv > 0 ? (
          <span className="inline-flex items-center gap-1">
            <span
              className={clsx(
                "inline-block h-2 w-2 rounded-full",
                contractorFillClass,
              )}
              aria-hidden
            />
            Contractor
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <span
            className={clsx("inline-block h-2 w-2 rounded-full", fillClass)}
            aria-hidden
          />
          Used
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className={clsx(
              "relative inline-block h-2 w-2 overflow-hidden rounded-full",
              fillClass,
            )}
            aria-hidden
          >
            <span className="absolute inset-0" style={hatchStyle} />
          </span>
          Future
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full bg-[var(--hours-available)]"
            aria-hidden
          />
          Available
        </span>
      </p>
    </div>
  );
}

export function ProductionHoursPanel({
  project,
  assignments,
  people,
  members,
  expenses,
  settings = DEFAULT_ORG_BUDGET_SETTINGS,
  compact = false,
}: {
  project: Project | Omit<Project, "organization_id">;
  assignments: Assignment[];
  people: Person[];
  members: ProjectMember[];
  expenses: ProjectContractorExpense[];
  settings?: OrganizationSettings;
  compact?: boolean;
}) {
  const fullProject = useMemo((): Project => {
    if ("organization_id" in project && project.organization_id) {
      return project as Project;
    }
    return {
      ...(project as Omit<Project, "organization_id">),
      organization_id: "local",
    };
  }, [project]);

  const estimate = useMemo(
    () =>
      productionHoursEstimate(
        fullProject,
        assignments,
        people,
        members,
        expenses,
        settings,
      ),
    [fullProject, assignments, people, members, expenses, settings],
  );

  if (!estimate) {
    return (
      <p className="text-xs text-[var(--text-muted)]">
        Production hours estimation is available for Fixed Fee projects.
      </p>
    );
  }

  if (estimate.emptyTeam) {
    return (
      <div className={clsx("space-y-2", compact ? "p-0" : "")}>
        <p className="text-sm text-[var(--text-muted)]">
          *Note: add team members to the project to estimate remaining available
          hours.
        </p>
      </div>
    );
  }

  const remainingClass = healthTextClass(estimate.health);

  return (
    <div className="space-y-3">
      <ProductionHoursBar estimate={estimate} />

      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-muted)]">Hours Used</dt>
          <dd className={clsx("tabular-nums font-medium", remainingClass)}>
            {formatHours(estimate.usedHours)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-muted)]">Future Planned</dt>
          <dd className={clsx("tabular-nums font-medium", remainingClass)}>
            {formatHours(estimate.futureHours)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--text-muted)]">Remaining Available</dt>
          <dd className={clsx("tabular-nums font-medium", remainingClass)}>
            {formatHours(estimate.remainingTargetHours)}
          </dd>
        </div>
        {estimate.contractorAmount > 0 ? (
          <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-1.5">
            <dt className="text-[var(--text-muted)]">Contractor</dt>
            <dd className="text-right tabular-nums font-medium">
              {formatHours(estimate.contractorHoursEquiv)}
              <span className="block text-[11px] font-normal text-[var(--text-muted)]">
                {formatMoney(estimate.contractorAmount)}
              </span>
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-2 border-t border-[var(--border)] pt-1.5 text-xs">
          <dt className="text-[var(--text-muted)]">
            Target Margin ({estimate.marginPct.toFixed(0)}%)
          </dt>
          <dd className="tabular-nums text-[var(--text-muted)]">
            {formatHours(estimate.targetMarginHours)}
          </dd>
        </div>
        <div className="flex justify-between gap-2 text-xs">
          <dt className="text-[var(--text-muted)]">Break-even</dt>
          <dd className="tabular-nums text-[var(--text-muted)]">
            {formatHours(estimate.breakEvenHours)}
          </dd>
        </div>
        <div className="flex justify-between gap-2 text-xs">
          <dt className="text-[var(--text-muted)]">Avg Team Cost Rate</dt>
          <dd className="tabular-nums text-[var(--text-muted)]">
            {formatMoney(estimate.avgCostRate)}/hr
          </dd>
        </div>
      </dl>

      <p className="text-[11px] leading-snug text-[var(--text-muted)]">
        Remaining available hours is an estimation based on the total teams cost
        rate average. This is meant to be a guide for allocating time to the
        schedule.
      </p>
    </div>
  );
}
