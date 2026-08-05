import { cn } from "@/lib/cn";
import { taskStatusLabel } from "@/lib/domain/tasks";
import type { TaskStatus } from "@/lib/types";

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
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <span className={cn(taskStatusTagClassName(status), className)}>
      {taskStatusLabel(status)}
    </span>
  );
}
