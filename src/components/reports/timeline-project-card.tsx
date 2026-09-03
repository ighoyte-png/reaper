"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";
import { ProgressBar } from "@/components/projects/progress-bar";
import { ProjectStatusTag } from "@/components/projects/project-status-tag";
import { panelClass } from "@/components/ui/panel";
import {
  findListAttachedToMilestone,
  milestoneDateProgress,
  projectDateProgress,
} from "@/lib/domain/progress";
import { cn } from "@/lib/cn";
import type { Milestone, Project, TaskList } from "@/lib/types";

function formatDisplayDate(dateKey: string | null | undefined): string {
  if (!dateKey) return "No date";
  return format(parseISO(dateKey), "MMM d, yyyy");
}

function overallProgressLabel(
  startDate: string | null,
  endDate: string | null,
): string {
  if (startDate && endDate) {
    return `Overall Progress · ${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;
  }
  if (startDate) {
    return `Overall Progress · from ${formatDisplayDate(startDate)}`;
  }
  if (endDate) {
    return `Overall Progress · through ${formatDisplayDate(endDate)}`;
  }
  return "Overall Progress";
}

function approvedByline(milestone: Milestone): string | null {
  if (!milestone.approved_by_client || !milestone.approved_by_name) {
    return null;
  }
  const when = milestone.approved_at
    ? (() => {
        try {
          return format(parseISO(milestone.approved_at), "MMM d, yyyy");
        } catch {
          return milestone.approved_at.slice(0, 10);
        }
      })()
    : null;
  return when
    ? `Approved by ${milestone.approved_by_name} on ${when}`
    : `Approved by ${milestone.approved_by_name}`;
}

export function TimelineProjectCard({
  project,
  milestones,
  taskLists = [],
  href,
  today,
}: {
  project: Project;
  milestones: Milestone[];
  taskLists?: TaskList[];
  href: string;
  today: string;
}) {
  const overallPct = projectDateProgress(project, today) ?? 0;
  const sorted = [...milestones].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Link
      href={href}
      className={cn(
        panelClass({
          className:
            "flex h-full min-w-0 flex-col overflow-hidden transition-colors hover:bg-[var(--row-hover)]",
        }),
        project.status === "archived" && "opacity-60",
      )}
    >
      <div className="mb-5 flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
          {project.name}
        </div>
        <ProjectStatusTag status={project.status} />
      </div>

      <ProgressBar
        pct={overallPct}
        label={overallProgressLabel(project.start_date, project.end_date)}
        size="lg"
      />

      <div className="mt-4 space-y-3">
        <h3 className="text-xs font-semibold text-[var(--text-muted)]">
          Milestones
        </h3>
        {sorted.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No milestones yet.</p>
        ) : (
          <div className="space-y-4">
            {sorted.map((milestone) => {
              const attached = findListAttachedToMilestone(
                taskLists,
                milestone.id,
              );
              const pct = milestoneDateProgress(
                milestone,
                project,
                today,
                attached,
              );
              const dateLabel = milestone.due_date
                ? formatDisplayDate(milestone.due_date)
                : "No date";
              return (
                <ProgressBar
                  key={milestone.id}
                  pct={pct ?? 0}
                  label={`${milestone.name} · ${dateLabel}`}
                  approved={milestone.client_approved}
                  readyForApproval={
                    milestone.approval_enabled && !milestone.client_approved
                  }
                  footerStart={approvedByline(milestone)}
                />
              );
            })}
          </div>
        )}
      </div>
    </Link>
  );
}

/** Compact list row: overall project timeline only; expand for milestones. */
export function TimelineProjectListRow({
  project,
  milestones,
  taskLists = [],
  href,
  today,
}: {
  project: Project;
  milestones: Milestone[];
  taskLists?: TaskList[];
  href: string;
  today: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const overallPct = projectDateProgress(project, today) ?? 0;
  const sorted = [...milestones].sort((a, b) => a.sort_order - b.sort_order);
  const hasMilestones = sorted.length > 0;

  return (
    <div
      className={cn(
        "border-b border-[var(--border)] last:border-b-0",
        project.status === "archived" && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--row-hover)]">
        {hasMilestones ? (
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]"
            aria-expanded={expanded}
            aria-label={expanded ? "Hide milestones" : "Show milestones"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            <ChevronDown
              size={14}
              className={cn(
                "transition-transform duration-200 ease-out motion-reduce:transition-none",
                expanded ? "rotate-0" : "-rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="inline-flex h-7 w-7 shrink-0" aria-hidden />
        )}
        <Link href={href} className="min-w-0 flex-1">
          <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold leading-tight">
              {project.name}
            </span>
            <ProjectStatusTag status={project.status} />
          </div>
          <ProgressBar
            pct={overallPct}
            label={overallProgressLabel(project.start_date, project.end_date)}
            size="sm"
          />
        </Link>
      </div>
      {expanded && hasMilestones ? (
        <div className="space-y-3 border-t border-[var(--border)] px-3 py-3 pl-12">
          {sorted.map((milestone) => {
            const attached = findListAttachedToMilestone(
              taskLists,
              milestone.id,
            );
            const pct = milestoneDateProgress(
              milestone,
              project,
              today,
              attached,
            );
            const dateLabel = milestone.due_date
              ? formatDisplayDate(milestone.due_date)
              : "No date";
            return (
              <ProgressBar
                key={milestone.id}
                pct={pct ?? 0}
                label={`${milestone.name} · ${dateLabel}`}
                approved={milestone.client_approved}
                readyForApproval={
                  milestone.approval_enabled && !milestone.client_approved
                }
                footerStart={approvedByline(milestone)}
                size="sm"
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
