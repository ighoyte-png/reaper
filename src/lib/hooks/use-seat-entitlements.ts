"use client";

import { useCallback, useEffect, useState } from "react";
import { useData } from "@/lib/data/store";
import type { AccountEntitlements } from "@/lib/accounts/entitlements";

export function useSeatEntitlements() {
  const { ready, mode, canManage, state } = useData();
  const orgId = state.organization.id;
  const [entitlements, setEntitlements] = useState<AccountEntitlements | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (mode !== "supabase" || !canManage || !orgId) {
      setEntitlements(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/accounts/entitlements");
      if (!res.ok) {
        setEntitlements(null);
        return;
      }
      const body = (await res.json()) as { entitlements?: AccountEntitlements };
      setEntitlements(body.entitlements ?? null);
    } catch {
      setEntitlements(null);
    } finally {
      setLoading(false);
    }
  }, [mode, canManage, orgId]);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh]);

  const atLimit =
    entitlements != null &&
    entitlements.seatLimit != null &&
    entitlements.seatUsed >= entitlements.seatLimit;

  const overLimit =
    entitlements != null &&
    entitlements.seatLimit != null &&
    entitlements.seatUsed > entitlements.seatLimit;

  return {
    entitlements,
    loading,
    refresh,
    atLimit,
    overLimit,
    limited: entitlements?.seatLimit != null,
  };
}
