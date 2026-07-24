"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppNavbar } from "@/components/nav/app-navbar";
import { FavoritesBottomNav } from "@/components/nav/favorite-project-tabs";
import { MobileNavProvider } from "@/components/nav/mobile-nav";
import { ViewAsBanner } from "@/components/nav/view-as-banner";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data/store";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { stripWorkspacePrefix } from "@/lib/paths";
import { ViewAsProvider, useViewAs } from "@/lib/view-as";

/** Paths members cannot access — redirect here while Viewing As. */
function isManageOnlyPath(pathname: string, workspaceSlug: string): boolean {
  const path = stripWorkspacePrefix(pathname, workspaceSlug);
  return (
    path === "/reports" ||
    path.startsWith("/reports/") ||
    path === "/clients" ||
    path.startsWith("/clients/") ||
    path === "/people" ||
    path.startsWith("/people/") ||
    path === "/templates" ||
    path.startsWith("/templates/") ||
    path === "/settings" ||
    path.startsWith("/settings/")
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <AppShellInner>{children}</AppShellInner>
    </MobileNavProvider>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { ready, isAuthenticated, isPlatformOnly, state, logout } = useData();
  const router = useRouter();
  const pathname = usePathname();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated && !pathname.startsWith("/login")) {
      router.replace("/login");
    }
  }, [ready, isAuthenticated, pathname, router]);

  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    if (isPlatformOnly) {
      router.replace("/admin");
    }
  }, [ready, isAuthenticated, isPlatformOnly, router]);

  useEffect(() => {
    if (!ready || !isAuthenticated || isPlatformOnly) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/platform/me");
        if (!res.ok) return;
        const body = (await res.json()) as { isPlatformAdmin?: boolean };
        if (!cancelled) setIsPlatformAdmin(Boolean(body.isPlatformAdmin));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, isAuthenticated, isPlatformOnly]);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated || isPlatformOnly) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting…
      </div>
    );
  }

  if (state.organization.disabled_at) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[var(--page-bg)] p-6 text-center text-[var(--text)]">
        <h1 className="text-sm font-semibold">Workspace disabled</h1>
        <p className="max-w-sm text-sm text-[var(--text-muted)]">
          {state.organization.name || "This workspace"} has been disabled by a
          platform administrator.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {isPlatformAdmin ? (
            <Link
              href="/admin"
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)]"
            >
              Open Platform
            </Link>
          ) : null}
          <Button
            variant="secondary"
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ViewAsProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-[var(--page-bg)] text-[var(--text)]">
        <AppNavbar />
        <ViewAsBanner />
        <ViewAsRouteGuard />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none">
          {children}
        </div>
        <FavoritesBottomNav />
      </div>
    </ViewAsProvider>
  );
}

function ViewAsRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { viewAsPersonId } = useViewAs();
  const { state } = useData();
  const appHref = useAppHref();

  useEffect(() => {
    if (!viewAsPersonId) return;
    if (isManageOnlyPath(pathname, state.organization.slug)) {
      router.replace(appHref("/dashboard"));
    }
  }, [viewAsPersonId, pathname, router, state.organization.slug, appHref]);

  return null;
}
