"use client";

import { ShareNavbar } from "@/components/nav/share-navbar";
import { MobileNavProvider } from "@/components/nav/mobile-nav";

export function ShareShell({ children }: { children: React.ReactNode }) {
  return (
    <MobileNavProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]">
        <ShareNavbar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </MobileNavProvider>
  );
}
