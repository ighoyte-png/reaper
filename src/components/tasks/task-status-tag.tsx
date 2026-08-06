import { cn } from "@/lib/cn";
import { taskStatusLabel } from "@/lib/domain/tasks";
import type { TaskStatus } from "@/lib/types";

const HOLD_YELLOW = "#f59e0b";

function yellowChipClassName(className?: string) {
  return cn(
    "rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide",
    className,
  );
}

function yellowChipStyle() {
  return {
    color: HOLD_YELLOW,
    backgroundColor: `color-mix(in srgb, ${HOLD_YELLOW} 18%, transparent)`,
  } as const;
}

export function taskStatusTagClassName(status: TaskStatus): string {
  return cn(
    "rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide",
    status === "complete"
      ? "bg-[var(--task-complete-bg)] text-[var(--task-complete-fg)] line-through"
      : status === "active"
        ? "bg-[var(--task-active-bg)] text-[var(--task-active-fg)]"
        : "bg-[var(--task-upcoming-bg)] text-[var(--task-upcoming-fg)]",
  );
}

export function TaskStatusTag({
  status,
  className,
  isClientReview = false,
  isDownstreamHold = false,
}: {
  status: TaskStatus;
  className?: string;
  /** Client Review tasks show a yellow/green "Client Review" chip. */
  isClientReview?: boolean;
  /**
   * Tasks gated by an open Client Review above show Hold when Active or
   * In Review (`upcoming` / `active`).
   */
  isDownstreamHold?: boolean;
}) {
  if (isClientReview && status !== "complete") {
    return (
      <span
        className={yellowChipClassName(className)}
        style={yellowChipStyle()}
      >
        Client Review
      </span>
    );
  }
  if (isClientReview && status === "complete") {
    return (
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide line-through bg-[var(--status-healthy)]/15 text-[var(--status-healthy)]",
          className,
        )}
      >
        Client Review
      </span>
    );
  }
  if (
    isDownstreamHold &&
    (status === "upcoming" || status === "active")
  ) {
    return (
      <span
        className={yellowChipClassName(className)}
        style={yellowChipStyle()}
      >
        Hold
      </span>
    );
  }
  return (
    <span className={cn(taskStatusTagClassName(status), className)}>
      {taskStatusLabel(status)}
    </span>
  );
}
