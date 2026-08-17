"use client";

import { cn } from "@/lib/cn";
import type { CurrencyCode } from "@/lib/types";

export function CurrencyChip({
  currency,
  className,
}: {
  currency: CurrencyCode;
  className?: string;
}) {
  const cad = currency === "cad";
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        cad
          ? "bg-[var(--status-over)]/15 text-[var(--status-over)]"
          : "bg-[var(--accent)]/15 text-[var(--accent)]",
        className,
      )}
    >
      {currency}
    </span>
  );
}

export function CurrencyToggle({
  value,
  onChange,
  id,
}: {
  value: CurrencyCode;
  onChange: (next: CurrencyCode) => void;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="inline-flex rounded-md border border-[var(--border)] p-0.5"
      role="group"
      aria-label="Currency"
    >
      {(["usd", "cad"] as const).map((code) => {
        const active = value === code;
        return (
          <button
            key={code}
            type="button"
            className={cn(
              "cursor-pointer rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              active
                ? code === "cad"
                  ? "bg-[var(--status-over)]/15 text-[var(--status-over)]"
                  : "bg-[var(--accent)]/15 text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
            aria-pressed={active}
            onClick={() => onChange(code)}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
