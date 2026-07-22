import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

/** Default panel shell used across dashboard / settings / list sections. */
export function panelClass({
  padded = true,
  className,
}: {
  padded?: boolean;
  className?: string;
} = {}) {
  return cn(
    "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)]",
    padded && "p-4",
    className,
  );
}

export function Panel({
  padded = true,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  padded?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={panelClass({ padded, className })} {...props}>
      {children}
    </div>
  );
}
