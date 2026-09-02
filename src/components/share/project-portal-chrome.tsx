"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "next/navigation";
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
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [branding, setBranding] = useState<PortalBranding | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/share/project/${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          portal?: { branding?: PortalBranding };
        };
        if (!cancelled && data.portal?.branding) {
          setBranding(data.portal.branding);
        }
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

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
