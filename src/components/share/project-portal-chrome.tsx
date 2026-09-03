"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useTheme } from "@/components/theme/theme-provider";
import type { ProjectPortalPayload } from "@/lib/share/sanitize";

export type PortalBranding = ProjectPortalPayload["branding"];

const PortalChromeContext = createContext<{
  branding: PortalBranding | null;
  setBranding: (next: PortalBranding | null) => void;
} | null>(null);

export function useProjectPortalChrome() {
  const ctx = useContext(PortalChromeContext);
  if (!ctx) {
    throw new Error(
      "useProjectPortalChrome must be used within ProjectPortalChromeProvider",
    );
  }
  return ctx;
}

function ProjectPortalHeader() {
  const { branding } = useProjectPortalChrome();
  const { theme } = useTheme();
  const logoSrc =
    theme === "dark"
      ? branding?.logoDarkUrl || branding?.logoLightUrl || null
      : branding?.logoLightUrl || branding?.logoDarkUrl || null;
  const wordmark = branding?.companyName?.trim() || null;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4 sm:px-6">
      <BrandLockup
        compact
        logoSrc={logoSrc}
        wordmark={wordmark}
        showWordmark={!logoSrc || Boolean(wordmark)}
      />
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--text-muted)]">Client Portal</span>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function ProjectPortalChromeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [branding, setBranding] = useState<PortalBranding | null>(null);

  // Branding is set by the portal page after its single /api/share/project fetch —
  // do not fetch the heavy portal payload a second time from the layout.

  const value = useMemo(() => ({ branding, setBranding }), [branding]);

  return (
    <PortalChromeContext.Provider value={value}>
      <div className="flex h-dvh flex-col overflow-hidden bg-[var(--page-bg)] text-[var(--text)]">
        <ProjectPortalHeader />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </PortalChromeContext.Provider>
  );
}
