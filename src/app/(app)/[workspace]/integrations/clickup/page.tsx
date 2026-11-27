"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ClickUpSyncHealthPage } from "@/addons/clickup/ui/clickup-sync-health-page";
import { useData } from "@/lib/data/store";
import { isAdmin } from "@/lib/auth/roles";
import { useAppHref } from "@/lib/hooks/use-app-href";

/** Workspace admin ClickUp sync health (queue + webhook heal). */
export default function ClickUpIntegrationsHealthRoute() {
  const { ready, profile, mode } = useData();
  const router = useRouter();
  const appHref = useAppHref();
  const admin = isAdmin(profile?.role);

  useEffect(() => {
    if (!ready) return;
    if (mode !== "supabase" || !admin) {
      router.replace(appHref("/settings?tab=integrations"));
    }
  }, [ready, mode, admin, router, appHref]);

  if (!ready || mode !== "supabase" || !admin) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  return <ClickUpSyncHealthPage />;
}
