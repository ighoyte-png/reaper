"use client";

import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useMobileNav } from "@/components/nav/mobile-nav";
import { useData } from "@/lib/data/store";

export function Topbar({
  title,
  actions,
}: {
  title: string;
  actions?: React.ReactNode;
}) {
  const { profile, organizationName } = useOrgLabel();
  const { toggle } = useMobileNav();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 sm:gap-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text)] hover:bg-[var(--row-hover)] md:hidden"
          aria-label="Open menu"
          onClick={toggle}
        >
          <Menu size={18} strokeWidth={1.75} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight">
            {title}
          </h1>
          <p className="truncate text-xs text-[var(--text-muted)]">
            {organizationName}
            {profile ? ` · ${profile.full_name}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {actions ? (
          <div className="flex max-w-[50vw] items-center gap-1.5 overflow-x-auto sm:max-w-none">
            {actions}
          </div>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}

function useOrgLabel() {
  const { state, profile } = useData();
  return { profile, organizationName: state.organization.name };
}
