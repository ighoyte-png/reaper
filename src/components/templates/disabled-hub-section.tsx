import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/** Greyed, non-interactive hub chrome for template editor layout parity. */
export function DisabledHubSection({
  title,
  hint = "Not included in templates",
  children,
  className,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-4 opacity-50",
        className,
      )}
      aria-disabled="true"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-muted)]">
          {title}
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
          {hint}
        </span>
      </div>
      <div className="pointer-events-none select-none" aria-hidden>
        {children}
      </div>
    </section>
  );
}
