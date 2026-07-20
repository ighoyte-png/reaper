import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * Full-width page shell with a centered 1400px content column.
 * Put overflow (e.g. overflow-y-auto) on this component so the scrollbar
 * sits on the viewport edge, not the constrained column.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex min-h-0 w-full flex-1 flex-col", className)}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
