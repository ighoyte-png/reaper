"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarRange,
  FolderKanban,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { MobileNavProvider, useMobileNav } from "@/components/nav/mobile-nav";

const tabDefs = [
  { path: "/schedule", label: "Schedule", icon: CalendarRange },
  { path: "/people", label: "People", icon: Users },
  { path: "/projects", label: "Projects", icon: FolderKanban },
  { path: "/clients", label: "Clients", icon: Building2 },
  { path: "/reports", label: "Reports", icon: BarChart3 },
];

function ShareSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { shareBasePath, state } = useData();
  const base = shareBasePath ?? "";

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
      <div className="flex min-h-14 items-center px-4 py-3">
        <Link
          href={`${base}/schedule`}
          className="inline-flex items-center"
          aria-label="Reaper"
          onClick={onNavigate}
        >
          <BrandLockup showVersion logoClassName="h-8" wordmarkClassName="text-base" />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
        {tabDefs.map(({ path, label, icon: Icon }) => {
          const href = `${base}${path}`;
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={path}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
                active && "bg-[var(--bg-elevated)] text-[var(--text)]",
              )}
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)]">
        <div className="truncate font-medium text-[var(--text)]">
          {state.organization.name}
        </div>
        Public view · read only
      </div>
    </aside>
  );
}

function ShareShellInner({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useMobileNav();

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <div className="hidden md:flex">
        <ShareSidebar />
      </div>
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <button
          type="button"
          className={cn(
            "absolute inset-0 bg-black/40 transition-opacity",
            open ? "opacity-100" : "opacity-0",
          )}
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 flex max-w-[min(18rem,85vw)] transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <ShareSidebar onNavigate={() => setOpen(false)} />
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export function ShareShell({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <ShareShellInner>{children}</ShareShellInner>
    </MobileNavProvider>
  );
}
