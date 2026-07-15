"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/nav/sidebar";
import { MobileNavProvider, useMobileNav } from "@/components/nav/mobile-nav";
import { useData } from "@/lib/data/store";
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
  const { open, setOpen } = useMobileNav();

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
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
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
          <Sidebar onNavigate={() => setOpen(false)} />
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
