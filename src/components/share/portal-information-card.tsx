"use client";

import { TaskStatusTag } from "@/components/tasks/task-status-tag";
import { cn } from "@/lib/cn";

type Props = {
  /** Leftover Team-grid columns (1–3). */
  span: 1 | 2 | 3;
  /** Client name used in the Complete legend line. */
  clientLabel: string;
  /** Monthly hours retainer dashboards only. */
  showCalendar?: boolean;
};

function TaskChipsLegend({ clientLabel }: { clientLabel: string }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        Task chips
      </p>
      <ul className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5 text-xs text-[var(--text-muted)]">
        <li className="contents">
          <TaskStatusTag status="upcoming" className="justify-self-start" />
          <span>A task is ready to be worked on or is in progress</span>
        </li>
        <li className="contents">
          <TaskStatusTag status="active" className="justify-self-start" />
          <span>A task is being reviewed for quality assurance</span>
        </li>
        <li className="contents">
          <TaskStatusTag status="complete" className="justify-self-start" />
          <span>
            A task has been completed and approved by {clientLabel}
          </span>
        </li>
      </ul>
    </div>
  );
}

function CalendarTimeLegend({ bordered }: { bordered?: boolean }) {
  return (
    <div
      className={cn(
        "space-y-2",
        bordered && "border-t border-[var(--border)] pt-2",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        Calendar time
      </p>
      <ul className="space-y-1.5 text-xs text-[var(--text-muted)]">
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-5 rounded-sm bg-[var(--accent)]"
            aria-hidden
          />
          Solid blue = time used
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-5 rounded-sm border border-[var(--accent)]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, transparent, transparent 2px, var(--accent) 2px, var(--accent) 3px)",
              opacity: 0.7,
            }}
            aria-hidden
          />
          Hatched blue = planned estimate
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-5 rounded-sm bg-[var(--status-over)]"
            aria-hidden
          />
          Red = over budgeted hours
        </li>
      </ul>
    </div>
  );
}

/**
 * Team-grid filler legend for Client Dashboards.
 * Calendar time only for monthly hours retainers; side-by-side when span ≥ 2.
 */
export function PortalInformationCard({
  span,
  clientLabel,
  showCalendar = false,
}: Props) {
  const sideBySide = showCalendar && span >= 2;

  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-left",
        span === 1 && "lg:col-span-1",
        span === 2 && "lg:col-span-2",
        span === 3 && "lg:col-span-3",
      )}
    >
      <h3 className="text-sm font-semibold">Information</h3>
      {sideBySide ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <TaskChipsLegend clientLabel={clientLabel} />
          <CalendarTimeLegend />
        </div>
      ) : (
        <>
          <TaskChipsLegend clientLabel={clientLabel} />
          {showCalendar ? <CalendarTimeLegend bordered /> : null}
        </>
      )}
    </li>
  );
}
