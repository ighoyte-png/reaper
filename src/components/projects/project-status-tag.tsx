import { cn } from "@/lib/cn";
import {
  projectStatusClass,
  projectStatusLabel,
} from "@/lib/domain/sorting";
import type { ProjectStatus } from "@/lib/types";

export function projectStatusTagClassName(status: ProjectStatus | string): string {
  return cn(
    "rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide",
    projectStatusClass(status),
  );
}

export function ProjectStatusTag({
  status,
  className,
}: {
  status: ProjectStatus | string;
  className?: string;
}) {
  return (
    <span className={cn(projectStatusTagClassName(status), className)}>
      {projectStatusLabel(status)}
    </span>
  );
}
