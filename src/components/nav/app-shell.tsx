"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppNavbar } from "@/components/nav/app-navbar";
import { MobileNavProvider } from "@/components/nav/mobile-nav";
import { ViewAsBanner } from "@/components/nav/view-as-banner";
import { useData } from "@/lib/data/store";
import { ViewAsProvider, useViewAs } from "@/lib/view-as";

/** Paths members cannot access — redirect here while Viewing As. */
function isManageOnlyPath(pathname: string): boolean {
  return (
    pathname === "/reports" ||
    pathname.startsWith("/reports/") ||
    pathname === "/clients" ||
    pathname.startsWith("/clients/") ||
    pathname === "/people" ||
    pathname.startsWith("/people/") ||
    pathname === "/templates" ||
    pathname.startsWith("/templates/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
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
  const { ready, isAuthenticated } = useData();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated && !pathname.startsWith("/login")) {
      router.replace("/login");
    }
  }, [ready, isAuthenticated, pathname, router]);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting…
      </div>
    );
  }

  return (
    <ViewAsProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-[var(--page-bg)] text-[var(--text)]">
        <AppNavbar />
        <ViewAsBanner />
        <ViewAsRouteGuard />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </ViewAsProvider>
  );
}

function ViewAsRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { viewAsPersonId } = useViewAs();

  useEffect(() => {
    if (!viewAsPersonId) return;
    if (isManageOnlyPath(pathname)) {
      router.replace("/dashboard");
    }
  }, [viewAsPersonId, pathname, router]);

  return null;
}
