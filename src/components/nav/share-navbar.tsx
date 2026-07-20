"use client";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { useData } from "@/lib/data/store";

/** Public share chrome — brand + org only; no app navigation for external viewers. */
export function ShareNavbar() {
  const { state } = useData();

  return (
    <header className="flex h-11 w-full shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--sidebar)] px-2 sm:px-3">
      <div className="inline-flex shrink-0 items-center py-1">
        <BrandLockup showVersion compact />
      </div>
      <div className="ml-auto truncate text-right text-xs text-[var(--text-muted)]">
        <div className="truncate font-medium text-[var(--text)]">
          {state.organization.name}
        </div>
        Public view · read only
      </div>
    </header>
  );
}
