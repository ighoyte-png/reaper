"use client";

import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, Ref } from "react";

type CheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> & {
  indeterminate?: boolean;
  size?: "sm" | "md";
  inputRef?: Ref<HTMLInputElement>;
};

export function Checkbox({
  className,
  checked,
  indeterminate = false,
  disabled,
  size = "md",
  inputRef,
  ...props
}: CheckboxProps) {
  const boxSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const iconSize = size === "sm" ? 10 : 12;
  const on = Boolean(checked) || indeterminate;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        boxSize,
        className,
      )}
    >
      <input
        {...props}
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none flex h-full w-full items-center justify-center rounded-[3px] border transition-colors",
          on
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
            : "border-[var(--text-muted)]/45 bg-[var(--bg)] text-transparent",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]",
          "peer-disabled:opacity-50",
        )}
      >
        {indeterminate && !checked ? (
          <Minus size={iconSize} strokeWidth={3} />
        ) : (
          <Check size={iconSize} strokeWidth={3} />
        )}
      </span>
    </span>
  );
}
