"use client";

import Link from "next/link";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { useSeatEntitlements } from "@/lib/hooks/use-seat-entitlements";
import { useData } from "@/lib/data/store";

/**
 * Top bar when the workspace is at or over its platform seat limit.
 * Managers/admins only; blank seat limit = unlimited (no banner).
 */
export function SeatLimitBanner() {
  const { canManage, isPublicShare } = useData();
  const { entitlements, atLimit, overLimit } = useSeatEntitlements();
  const appHref = useAppHref();

  if (isPublicShare || !canManage || !atLimit || !entitlements) return null;

  const used = entitlements.seatUsed;
  const limit = entitlements.seatLimit ?? 0;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--status-over)]/35 bg-[color-mix(in_srgb,var(--status-over)_12%,transparent)] px-4 py-1.5 text-sm text-[var(--text)]"
      role="status"
    >
      <span className="font-medium text-[var(--status-over)]">
        {overLimit ? "Over seat limit" : "Out of seats"}
      </span>
      <span className="text-[var(--text-muted)]">
        {used}/{limit} seats in use (members + pending invites). You can’t add
        or invite anyone until a seat frees up.
      </span>
      <Link
        href={appHref("/settings?tab=members")}
        className="ml-auto text-xs font-medium text-[var(--status-over)] underline-offset-2 hover:underline"
      >
        Manage members
      </Link>
    </div>
  );
}
