"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { AboutDialog } from "@/components/brand/about-dialog";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { useMobileNav } from "@/components/nav/mobile-nav";
import { primaryNavLinks } from "@/components/nav/nav-links";
import { PlatformAdminNavLink } from "@/components/nav/platform-admin-link";
import { PersonAvatar } from "@/components/people/person-avatar";
import {
  GlobalSearch,
  GlobalSearchHotkeyBridge,
  GlobalSearchTrigger,
} from "@/components/search/global-search";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import { personAvatarColor } from "@/lib/domain/people";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { stripWorkspacePrefix } from "@/lib/paths";
import { isUnreadBulletin } from "@/lib/domain/bulletins";
import { useViewAs } from "@/lib/view-as";

function navLinkClass(active: boolean) {
  return cn(
    "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-normal leading-none transition-colors",
    active
      ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
      : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
  );
}

function menuItemClass(active?: boolean) {
  return cn(
    "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
    active
      ? "bg-[var(--bg-elevated)] text-[var(--text)]"
      : "text-[var(--text)] hover:bg-[var(--row-hover)]",
  );
}

export function AppNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, state, myPerson, profile, shareBasePath, switchWorkspace } =
    useData();
  const { theme, toggleTheme } = useTheme();
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
  const unreadMentions = useMemo(() => {
    if (!mentionPersonId) return new Set<string>();
    return new Set(
      (state.unread_mentions ?? [])
        .filter((r) => r.person_id === mentionPersonId && !r.read_at)
        .map((r) => {
          if (r.comment_id) return `comment:${r.comment_id}`;
          if (r.task_id) return `task:${r.task_id}`;
          if (r.assignment_id) return `assignment:${r.assignment_id}`;
          return "";
        })
        .filter(Boolean),
    );
  }, [mentionPersonId, state.unread_mentions]);
  const unreadBulletins = useMemo(
    () => new Set(state.unread_bulletin_ids ?? []),
    [state.unread_bulletin_ids],
  );
  const { open, setOpen, toggle } = useMobileNav();
  const isMemberContractor = Boolean(
    myPerson?.is_contractor && !effectiveCanManage,
  );
  const links = primaryNavLinks.filter((l) => {
    if (isMemberContractor && l.contractorMemberHidden) return false;
    if (l.memberOnly) return !effectiveCanManage;
    return effectiveCanManage || !l.manageOnly;
  });
  const showSettings = !viewAsPersonId;
  const settingsActive =
    pathForNav === "/settings" || pathForNav.startsWith("/settings/");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountName =
    myPerson?.name?.trim() ||
    profile?.full_name?.trim() ||
    profile?.email?.trim() ||
    "";
  const workspaceName = state.organization.name?.trim() || "Workspace";
  const accountTitle = myPerson?.role_title?.trim() || "";
  const accountRole = profile?.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : "";
  const identitySubtitle = [accountTitle, accountRole]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    if (!accountOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (!accountMenuRef.current?.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  const hasDashboardDot = useMemo(() => {
    if (mentionPersonId && unreadMentions.size > 0) return true;
    if (!mentionPersonId && !manageWithoutPerson) return false;
    return state.bulletins.some((b) =>
      isUnreadBulletin(
        b,
        mentionPersonId,
        profile?.id ?? null,
        unreadBulletins,
        {
          manageWithoutPerson,
          pods: state.pods,
          podMembers: state.pod_members,
        },
      ),
    );
  }, [
    mentionPersonId,
    manageWithoutPerson,
    state.bulletins,
    state.pods,
    state.pod_members,
    unreadMentions,
    unreadBulletins,
    profile?.id,
  ]);

  async function signOut() {
    setAccountOpen(false);
    setOpen(false);
    clearViewAs();
    await logout();
    router.push("/login");
  }

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
          className="inline-flex shrink-0 cursor-pointer items-center rounded-md py-1"
          aria-label="About Reaper"
          title="About Reaper"
          onClick={() => setAboutOpen(true)}
        >
          <BrandLockup showVersion compact />
        </button>
        <nav
          className="hidden shrink-0 items-center gap-0.5 md:flex"
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
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!shareBasePath ? (
            <>
              <GlobalSearchTrigger
                className="hidden w-64 sm:inline-flex"
                onClick={() => setSearchOpen(true)}
              />
              <button
                type="button"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)] sm:hidden"
                aria-label="Search"
                title="Search"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={16} strokeWidth={1.75} />
              </button>
            </>
          ) : null}
          {accountName ? (
            <div ref={accountMenuRef} className="relative">
              <button
                type="button"
                className={cn(
                  "flex max-w-[11rem] cursor-pointer items-center gap-1.5 rounded-full border border-transparent py-0.5 pl-0.5 pr-1.5 transition-colors hover:border-[var(--border)] hover:bg-[var(--row-hover)] sm:max-w-[14rem]",
                  accountOpen &&
                    "border-[var(--border)] bg-[var(--row-hover)]",
                )}
                aria-label={`Account menu for ${accountName}`}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                onClick={() => setAccountOpen((v) => !v)}
              >
                <PersonAvatar
                  avatarUrl={myPerson?.avatar_url}
                  avatarAttachmentId={myPerson?.avatar_attachment_id}
                  name={accountName}
                  size="team"
                  personId={myPerson?.id}
                  color={myPerson ? personAvatarColor(myPerson) : null}
                />
                <span className="min-w-0 truncate text-xs font-medium leading-none text-[var(--text)]">
                  {accountName}
                </span>
                <ChevronDown
                  size={14}
                  strokeWidth={1.75}
                  className={cn(
                    "shrink-0 text-[var(--text-muted)] transition-transform duration-150",
                    accountOpen && "rotate-180",
                  )}
                />
              </button>
              {accountOpen ? (
                <div
                  role="menu"
                  aria-label="Account"
                  className="absolute right-0 top-[calc(100%+0.4rem)] z-50 w-[17.5rem] origin-top-right overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28)]"
                >
                  <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/50 px-3.5 py-3.5">
                    <div className="flex items-start gap-3">
                      <PersonAvatar
                        avatarUrl={myPerson?.avatar_url}
                        avatarAttachmentId={myPerson?.avatar_attachment_id}
                        name={accountName}
                        size="sm"
                        className="mt-0.5 ring-2 ring-[var(--bg)]"
                        personId={myPerson?.id}
                        color={myPerson ? personAvatarColor(myPerson) : null}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight text-[var(--text)]">
                          {accountName}
                        </p>
                        {identitySubtitle ? (
                          <p className="mt-0.5 truncate text-xs leading-snug text-[var(--text-muted)]">
                            {identitySubtitle}
                          </p>
                        ) : null}
                        {state.memberships.length > 1 ? (
                          <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg)]/60 p-1">
                            <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                              Workspaces
                            </p>
                            <ul className="space-y-0.5">
                              {state.memberships.map((m) => {
                                const active =
                                  m.organization_id === state.organization.id;
                                return (
                                  <li key={m.organization_id}>
                                    <button
                                      type="button"
                                      role="menuitemradio"
                                      aria-checked={active}
                                      className={cn(
                                        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                                        active
                                          ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
                                          : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
                                      )}
                                      onClick={() => {
                                        if (active) return;
                                        setAccountOpen(false);
                                        void switchWorkspace(m.org.slug, {
                                          preservePath: true,
                                        });
                                      }}
                                    >
                                      <Building2
                                        size={12}
                                        strokeWidth={1.75}
                                        className="shrink-0 opacity-70"
                                      />
                                      <span className="min-w-0 flex-1 truncate">
                                        {m.org.name}
                                      </span>
                                      {active ? (
                                        <Check
                                          size={12}
                                          strokeWidth={2}
                                          className="shrink-0 text-[var(--text)]"
                                        />
                                      ) : null}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : (
                          <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] leading-none text-[var(--text-muted)]">
                            <Building2
                              size={11}
                              strokeWidth={1.75}
                              className="shrink-0 opacity-70"
                            />
                            <span className="truncate">{workspaceName}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-0.5 p-1.5">
                    {showSettings ? (
                      <Link
                        role="menuitem"
                        href={appHref("/settings")}
                        className={menuItemClass(settingsActive)}
                        onClick={() => setAccountOpen(false)}
                      >
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                          <Settings size={14} strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          Settings
                        </span>
                      </Link>
                    ) : null}

                    <button
                      type="button"
                      role="menuitem"
                      className={menuItemClass()}
                      onClick={() => toggleTheme()}
                    >
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                        {theme === "dark" ? (
                          <Sun size={14} strokeWidth={1.75} />
                        ) : (
                          <Moon size={14} strokeWidth={1.75} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        Appearance
                      </span>
                    </button>

                    <PlatformAdminNavLink
                      variant="menu"
                      onNavigate={() => setAccountOpen(false)}
                    />
                  </div>

                  <div className="border-t border-[var(--border)] p-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      className={cn(
                        menuItemClass(),
                        "text-[var(--text-muted)] hover:text-[var(--text)]",
                      )}
                      onClick={() => void signOut()}
                    >
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                        <LogOut size={14} strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        Sign out
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
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
              className="inline-flex cursor-pointer items-center rounded-md"
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
        </div>
      </div>
      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
      {!shareBasePath ? (
        <>
          <GlobalSearchHotkeyBridge
            enabled
            onOpen={() => setSearchOpen(true)}
          />
          <GlobalSearch
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
          />
        </>
      ) : null}
    </>
  );
}
