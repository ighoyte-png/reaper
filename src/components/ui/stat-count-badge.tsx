import { cn } from "@/lib/cn";

/** Dashboard-style count pill (New Mentions / Task Pulse). */
export function StatCountBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums text-white",
        className,
      )}
    >
      {count}
    </span>
  );
}
