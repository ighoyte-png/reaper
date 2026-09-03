"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { cn } from "@/lib/cn";

let cachedPlatformAdmin: boolean | null = null;
let platformAdminInflight: Promise<boolean> | null = null;

/** One shared /api/platform/me fetch per tab session (nav + shell). */
export function fetchIsPlatformAdmin(): Promise<boolean> {
  if (cachedPlatformAdmin != null) return Promise.resolve(cachedPlatformAdmin);
  if (platformAdminInflight) return platformAdminInflight;
  platformAdminInflight = (async () => {
    try {
      const res = await fetch("/api/platform/me");
      if (!res.ok) {
        cachedPlatformAdmin = false;
        return false;
      }
      const body = (await res.json()) as { isPlatformAdmin?: boolean };
      cachedPlatformAdmin = Boolean(body.isPlatformAdmin);
      return cachedPlatformAdmin;
    } catch {
      cachedPlatformAdmin = false;
      return false;
    } finally {
      platformAdminInflight = null;
    }
  })();
  return platformAdminInflight;
}

/** Discreet Platform console link for env-allowlisted admins. */
export function PlatformAdminNavLink({
  className,
  onNavigate,
  variant = "icon",
}: {
  className?: string;
  onNavigate?: () => void;
  /** icon = compact toolbar; menu = account flyout row */
  variant?: "icon" | "menu";
}) {
  const [show, setShow] = useState(cachedPlatformAdmin === true);

  useEffect(() => {
    let cancelled = false;
    void fetchIsPlatformAdmin().then((ok) => {
      if (!cancelled) setShow(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  if (variant === "menu") {
    return (
      <Link
        href="/admin"
        role="menuitem"
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--row-hover)]",
          className,
        )}
        onClick={onNavigate}
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-[var(--text-muted)]">
          <Shield size={14} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          Platform
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/admin"
      className={cn(
        "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
        className,
      )}
      title="Platform"
      aria-label="Platform"
    >
      <Shield size={16} strokeWidth={1.75} />
    </Link>
  );
}
