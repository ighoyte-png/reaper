"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { cn } from "@/lib/cn";

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
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/platform/me");
        if (!res.ok) return;
        const body = (await res.json()) as { isPlatformAdmin?: boolean };
        if (!cancelled) setShow(Boolean(body.isPlatformAdmin));
      } catch {
        /* ignore */
      }
    })();
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
        onClick={onNavigate}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--row-hover)]",
          className,
        )}
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-[var(--text-muted)]">
          <Shield size={14} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1 truncate">Platform</span>
      </Link>
    );
  }

  return (
    <Link
      href="/admin"
      onClick={onNavigate}
      className={cn("inline-flex items-center gap-2", className)}
      aria-label="Platform"
      title="Platform"
    >
      <Shield size={15} strokeWidth={1.75} />
      <span className="sm:hidden">Platform</span>
    </Link>
  );
}
