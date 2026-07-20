"use client";

import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  actions,
  onBack,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <header className="flex h-11 w-full shrink-0 items-center border-b border-[var(--border)] bg-[var(--bg)] px-4">
      <div className="mx-auto flex h-full w-full max-w-[1400px] items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
              aria-label="Back"
            >
              <ChevronLeft size={18} strokeWidth={1.75} />
              <span className="pr-0.5">Back</span>
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            {typeof title === "string" ? (
              <h1 className="truncate text-sm font-semibold tracking-tight">
                {title}
              </h1>
            ) : (
              title
            )}
          </div>
        </div>
        {actions ? (
          <div className="flex max-w-[60vw] shrink-0 items-center gap-2 overflow-x-auto sm:max-w-none">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

PageHeader.displayName = "PageHeader";
