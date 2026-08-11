import { cn } from "@/lib/cn";

const SIZE_CLASS = {
  /** Compact chips / dense filters */
  sm: "h-3 w-1.5",
  /** Default next to text in lists and cards */
  md: "h-3.5 w-1.5",
  /** Schedule person/project row marker */
  lg: "h-5 w-1.5",
  /** Stretch to parent flex row height (client cards, etc.) */
  stretch: "w-1.5 self-stretch",
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
  hatched = false,
}: {
  color: string;
  size?: ProjectColorBarSize;
  className?: string;
  /** Diagonal hatch (e.g. Available capacity) instead of solid fill. */
  hatched?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn("shrink-0 rounded-full", SIZE_CLASS[size], className)}
      style={
        hatched
          ? {
              backgroundColor: color,
              backgroundImage: `repeating-linear-gradient(
                -45deg,
                #ffffff 0,
                #ffffff 1px,
                transparent 1px,
                transparent 3px
              )`,
            }
          : { background: color }
      }
    />
  );
}
