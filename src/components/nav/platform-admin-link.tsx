"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { cn } from "@/lib/cn";

/** Discreet Platform console link for env-allowlisted admins. */
export function PlatformAdminNavLink({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
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

  return (
    <Link
      href="/admin"
      onClick={onNavigate}
      className={cn(
        "inline-flex items-center gap-2",
        className,
      )}
      aria-label="Platform"
      title="Platform"
    >
      <Shield size={15} strokeWidth={1.75} />
      <span className="sm:hidden">Platform</span>
    </Link>
  );
}
