"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Settings } from "lucide-react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { useMobileNav } from "@/components/nav/mobile-nav";
import { primaryNavLinks } from "@/components/nav/nav-links";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";

function navLinkClass(active: boolean) {
  return cn(
    "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-normal leading-none transition-colors",
    active
      ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
      : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
  );
}

export function AppNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { canManage, logout } = useData();
  const { open, setOpen, toggle } = useMobileNav();
  const links = primaryNavLinks.filter((l) => canManage || !l.manageOnly);
  const settingsActive =
    pathname === "/settings" || pathname.startsWith("/settings/");

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
          href="/schedule"
          className="inline-flex shrink-0 items-center py-1"
          aria-label="Reaper"
        >
          <BrandLockup showVersion compact />
        </Link>
        <nav
          className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex"
          aria-label="Main"
        >
          {links.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={navLinkClass(active)}
              >
                <Icon size={15} strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Link
            href="/settings"
            className={cn(navLinkClass(settingsActive), "hidden sm:inline-flex")}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={15} strokeWidth={1.75} />
          </Link>
          <button
            type="button"
            className={cn(navLinkClass(false), "hidden sm:inline-flex")}
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            <LogOut size={15} strokeWidth={1.75} />
          </button>
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
            {links.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
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
          <div className="space-y-0.5 border-t border-[var(--border)] p-2">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm transition-colors",
                settingsActive
                  ? "bg-[var(--bg-elevated)] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
              )}
            >
              <Settings size={16} strokeWidth={1.75} />
              Settings
            </Link>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
              onClick={async () => {
                setOpen(false);
                await logout();
                router.push("/login");
              }}
            >
              <LogOut size={16} strokeWidth={1.75} />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
