import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "destructiveOutline";

export type ButtonSize = "sm" | "md" | "lg";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 disabled:hover:opacity-50",
  secondary:
    "border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--row-hover)]",
  ghost:
    "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
  destructive:
    "bg-[var(--status-over)] text-white hover:opacity-90 disabled:hover:opacity-50",
  destructiveOutline:
    "border border-[var(--status-over)]/40 text-[var(--status-over)] hover:bg-[var(--row-hover)]",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-7 px-2 text-xs",
  md: "h-8 px-3 text-sm",
  lg: "h-9 px-3 text-sm",
};

/** Class string for `<button>` or `<Link className={buttonClass(...)}>`. */
export function buttonClass({
  variant = "secondary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
    variantClass[variant],
    sizeClass[size],
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, className })}
      {...props}
    >
      {children}
    </button>
  );
}
