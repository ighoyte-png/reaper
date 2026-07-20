"use client";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function ProjectShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4 sm:px-6">
        <BrandLockup compact />
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)]">
            Client portal
          </span>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
