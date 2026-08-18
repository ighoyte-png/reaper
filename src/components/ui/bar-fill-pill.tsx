import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One pill-shaped fill. Inner color slices stay square; the wrapper
 * clips them so a tiny last slice cannot square off the end cap.
 */
export function BarFillPill({
  totalPct,
  children,
  className,
}: {
  totalPct: number;
  children: ReactNode;
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, totalPct));
  if (width <= 0) return null;
  return (
    <div
      className={cn(
        "flex h-full min-w-0 overflow-hidden rounded-full",
        className,
      )}
      style={{ width: `${width}%` }}
    >
      {children}
    </div>
  );
}
