"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LogOut, Menu, Settings } from "lucide-react";
import { AboutDialog } from "@/components/brand/about-dialog";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { useMobileNav } from "@/components/nav/mobile-nav";
import { primaryNavLinks } from "@/components/nav/nav-links";
import { PlatformAdminNavLink } from "@/components/nav/platform-admin-link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { stripWorkspacePrefix } from "@/lib/paths";
import { isUnreadBulletin } from "@/lib/domain/bulletins";
import { useDismissedMentions } from "@/lib/hooks/use-dismissed-mentions";
import { useViewAs } from "@/lib/view-as";

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
  const { logout, state, myPerson, profile, shareBasePath } = useData();
  const appHref = useAppHref();
  const pathForNav = shareBasePath
    ? pathname.startsWith(shareBasePath)
      ? pathname.slice(shareBasePath.length) || "/"
      : pathname
    : stripWorkspacePrefix(pathname, state.organization.slug);
  const {
    effectivePersonId,
    effectiveCanManage,
    clearViewAs,
    viewAsPersonId,
  } = useViewAs();
  const mentionPersonId = effectivePersonId ?? myPerson?.id ?? null;
  const manageWithoutPerson = effectiveCanManage && !mentionPersonId;
  const { dismissed: dismissedMentions } = useDismissedMentions(mentionPersonId);
  const dismissedBulletins = useMemo(
    () => new Set(state.dismissed_bulletin_ids ?? []),
    [state.dismissed_bulletin_ids],
  );
  const { open, setOpen, toggle } = useMobileNav();
  const links = primaryNavLinks.filter((l) => effectiveCanManage || !l.manageOnly);
  const showSettings = !viewAsPersonId;
  const settingsActive =
    pathForNav === "/settings" || pathForNav.startsWith("/settings/");
  const [aboutOpen, setAboutOpen] = useState(false);

  const hasDashboardDot = useMemo(() => {
    if (mentionPersonId) {
      const hasMention = state.task_comments.some(
        (c) =>
          (c.mentioned_person_ids ?? []).includes(mentionPersonId) &&
          !dismissedMentions.has(c.id),
      );
      if (hasMention) return true;
    }
    if (!mentionPersonId && !manageWithoutPerson) return false;
    return state.bulletins.some((b) =>
      isUnreadBulletin(
        b,
        mentionPersonId,
        profile?.id ?? null,
        dismissedBulletins,
        { manageWithoutPerson },
      ),
    );
  }, [
    mentionPersonId,
    manageWithoutPerson,
    state.task_comments,
    state.bulletins,
    dismissedMentions,
    dismissedBulletins,
    profile?.id,
  ]);

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
        <button
          type="button"
          className="inline-flex shrink-0 cursor-pointer items-center rounded-md py-1 hover:bg-[var(--row-hover)]"
          aria-label="About Reaper"
          title="About Reaper"
          onClick={() => setAboutOpen(true)}
        >
          <BrandLockup showVersion compact />
        </button>
        <nav
          className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex"
          aria-label="Main"
        >
          {links.map(({ href, label, icon: Icon }) => {
            const fullHref = appHref(href);
            const active =
              pathForNav === href || pathForNav.startsWith(`${href}/`);
            const showDot = href === "/dashboard" && hasDashboardDot;
            return (
              <Link
                key={href}
                href={fullHref}
                className={navLinkClass(active)}
              >
                <Icon size={15} strokeWidth={1.75} />
                {label}
                {showDot ? (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--status-attention)]"
                    aria-label="New dashboard notifications"
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <ThemeToggle
            className={cn(
              navLinkClass(false),
              "hidden h-auto w-auto border-0 bg-transparent sm:inline-flex",
            )}
          />
          <PlatformAdminNavLink
            className={cn(navLinkClass(false), "hidden sm:inline-flex")}
          />
          {showSettings ? (
            <Link
              href={appHref("/settings")}
              className={cn(navLinkClass(settingsActive), "hidden sm:inline-flex")}
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={15} strokeWidth={1.75} />
            </Link>
          ) : null}
          <button
            type="button"
            className={cn(navLinkClass(false), "hidden sm:inline-flex")}
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              clearViewAs();
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
            <button
              type="button"
              className="inline-flex cursor-pointer items-center rounded-md hover:bg-[var(--row-hover)]"
              aria-label="About Reaper"
              title="About Reaper"
              onClick={() => {
                setOpen(false);
                setAboutOpen(true);
              }}
            >
              <BrandLockup
                showVersion
                logoClassName="h-8"
                wordmarkClassName="text-base"
              />
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
            {links.map(({ href, label, icon: Icon }) => {
              const fullHref = appHref(href);
              const active =
                pathForNav === href || pathForNav.startsWith(`${href}/`);
              const showDot = href === "/dashboard" && hasDashboardDot;
              return (
                <Link
                  key={href}
                  href={fullHref}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-[var(--bg-elevated)] text-[var(--text)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
                  )}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {label}
                  {showDot ? (
                    <span
                      className="ml-auto h-2 w-2 rounded-full bg-[var(--status-attention)]"
                      aria-label="New dashboard notifications"
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="space-y-0.5 border-t border-[var(--border)] p-2">
            <div className="flex items-center justify-between gap-2 rounded-md px-2.5 py-2">
              <span className="text-sm text-[var(--text-muted)]">Theme</span>
              <ThemeToggle />
            </div>
            <PlatformAdminNavLink
              onNavigate={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            />
            {showSettings ? (
              <Link
                href={appHref("/settings")}
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
            ) : null}
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
              onClick={async () => {
                setOpen(false);
                clearViewAs();
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
      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
    </>
  );
}
