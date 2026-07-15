"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarRange,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import { ReaperLogo } from "@/components/brand/reaper-logo";

const allLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, manageOnly: false },
  { href: "/schedule", label: "Schedule", icon: CalendarRange, manageOnly: false },
  { href: "/people", label: "People", icon: Users, manageOnly: true },
  { href: "/projects", label: "Projects", icon: FolderKanban, manageOnly: true },
  { href: "/clients", label: "Clients", icon: Building2, manageOnly: true },
  { href: "/reports", label: "Reports", icon: BarChart3, manageOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, manageOnly: false },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { canManage } = useData();
  const links = allLinks.filter((l) => canManage || !l.manageOnly);

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
      <div className="flex h-14 items-center px-4">
        <Link
          href="/schedule"
          className="inline-flex items-center"
          aria-label="Reaper"
          onClick={onNavigate}
        >
          <ReaperLogo className="h-9" />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
        {links.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
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
        {canManage ? "Manager" : "My schedule"}
      </div>
    </aside>
  );
}
