import { cn } from "@/lib/cn";

const SIZE_CLASS = {
  /** Compact chips / dense filters */
  sm: "h-3 w-1.5",
  /** Default next to text in lists and cards */
  md: "h-3.5 w-1.5",
  /** Schedule person/project row marker */
  lg: "h-5 w-1.5",
} as const;

export type ProjectColorBarSize = keyof typeof SIZE_CLASS;

/**
 * Vertical color bar used for project (and client) identity —
 * same marker as the schedule row gutter.
 */
export function ProjectColorBar({
  color,
  size = "md",
  className,
}: {
  color: string;
  size?: ProjectColorBarSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("shrink-0 rounded-full", SIZE_CLASS[size], className)}
      style={{ background: color }}
    />
  );
}
