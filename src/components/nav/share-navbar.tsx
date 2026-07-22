"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { useMobileNav } from "@/components/nav/mobile-nav";
import { shareNavLinks } from "@/components/nav/nav-links";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";

function navLinkClass(active: boolean) {
  return cn(
    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
    active
      ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
      : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
  );
}

export function ShareNavbar() {
  const pathname = usePathname();
  const { shareBasePath, state } = useData();
  const { open, setOpen, toggle } = useMobileNav();
  const base = shareBasePath ?? "";

  return (
    <>
      <header className="flex h-11 w-full shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--sidebar)] px-2 sm:px-3">
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text)] hover:bg-[var(--row-hover)] md:hidden"
          aria-label="Open menu"
          onClick={toggle}
        >
          <Menu size={17} strokeWidth={1.75} />
        </button>
        <Link
          href={`${base}/schedule`}
          className="inline-flex shrink-0 items-center py-1"
          aria-label="Reaper"
        >
          <BrandLockup showVersion compact />
        </Link>
        <nav
          className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex"
          aria-label="Main"
        >
          {shareNavLinks.map(({ href, label, icon: Icon }) => {
            const path = `${base}${href}`;
            const active =
              pathname === path || pathname.startsWith(`${path}/`);
            return (
              <Link key={href} href={path} className={navLinkClass(active)}>
                <Icon size={15} strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden min-w-0 truncate text-right text-xs text-[var(--text-muted)] sm:block">
            <div className="truncate font-medium text-[var(--text)]">
              {state.organization.name}
            </div>
            Public view · read only
          </div>
          <ThemeToggle
            className={cn(
              navLinkClass(false),
              "h-auto w-auto border-0 bg-transparent",
            )}
          />
        </div>
      </header>

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
            "absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-[var(--border)] bg-[var(--sidebar)] transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="border-b border-[var(--border)] px-4 py-3">
            <BrandLockup
              showVersion
              logoClassName="h-8"
              wordmarkClassName="text-base"
            />
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
            {shareNavLinks.map(({ href, label, icon: Icon }) => {
              const path = `${base}${href}`;
              const active =
                pathname === path || pathname.startsWith(`${path}/`);
              return (
                <Link
                  key={href}
                  href={path}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-[var(--bg-elevated)] text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
                  )}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="space-y-2 border-t border-[var(--border)] p-2">
            <div className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2">
              <span className="text-sm text-[var(--text-muted)]">Theme</span>
              <ThemeToggle />
            </div>
            <div className="px-2.5 pb-1 text-xs text-[var(--text-muted)]">
              <div className="truncate font-medium text-[var(--text)]">
                {state.organization.name}
              </div>
              Public view · read only
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
