import { cn } from "@/lib/cn";
import { taskStatusLabel } from "@/lib/domain/tasks";
import type { TaskStatus } from "@/lib/types";

const HOLD_YELLOW = "#f59e0b";

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
}: {
  status: TaskStatus;
  className?: string;
  /** Open Client Review tasks show a yellow Hold chip instead of Active. */
  isClientReview?: boolean;
}) {
  if (isClientReview && status !== "complete") {
    return (
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide",
          className,
        )}
        style={{
          color: HOLD_YELLOW,
          backgroundColor: `color-mix(in srgb, ${HOLD_YELLOW} 18%, transparent)`,
        }}
      >
        Hold
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
        Complete
      </span>
    );
  }
  return (
    <span className={cn(taskStatusTagClassName(status), className)}>
      {taskStatusLabel(status)}
    </span>
  );
}
