import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * Full-width scrollport with a centered 1400px content column.
 * The scrollbar always sits on the viewport edge.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  // Overflow is owned by the full-width shell — strip caller overflow utilities
  // so nested overflow-hidden / overflow-y-auto don't trap the scrollbar.
  const withoutOverflow = className
    ?.split(/\s+/)
    .filter((c) => c && !c.startsWith("overflow-"))
    .join(" ");

  return (
    <div
      className={cn(
        "min-h-0 w-full flex-1 overflow-y-auto",
        withoutOverflow,
      )}
    >
      <div className="mx-auto w-full max-w-[1400px]">{children}</div>
    </div>
  );
}
