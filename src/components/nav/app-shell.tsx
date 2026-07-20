"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppNavbar } from "@/components/nav/app-navbar";
import { MobileNavProvider } from "@/components/nav/mobile-nav";
import { useData } from "@/lib/data/store";
import { ViewAsProvider, useViewAs } from "@/lib/view-as";
import { sortPeopleByName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";

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
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </ViewAsProvider>
  );
}

function ViewAsBanner() {
  const { canManage, state } = useData();
  const { viewAsPersonId, viewedPerson, setViewAsPersonId, clearViewAs } =
    useViewAs();

  if (!canManage || !viewAsPersonId) return null;

  const people = sortPeopleByName(state.people);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--status-near)]/40 bg-[var(--status-near)]/10 px-4 py-1.5 text-sm">
      <span className="font-medium text-[var(--status-near)]">
        Viewing as {viewedPerson?.name ?? "…"}
      </span>
      <select
        className={cn(
          "h-7 max-w-[200px] rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-xs",
        )}
        value={viewAsPersonId}
        onChange={(e) => setViewAsPersonId(e.target.value || null)}
        aria-label="View as user"
      >
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="ml-auto cursor-pointer text-xs font-medium text-[var(--accent)] hover:underline"
        onClick={clearViewAs}
      >
        Exit
      </button>
    </div>
  );
}
