"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data/store";
import {
  readUserViewPrefs,
  resolveDefaultStartPage,
} from "@/lib/user-view-prefs";
import { workspacePath } from "@/lib/paths";

export default function Home() {
  const { ready, isAuthenticated, profile, canManage, state } = useData();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!state.organization.slug) return;
    const prefs = readUserViewPrefs(profile?.id);
    const href = workspacePath(
      state.organization.slug,
      resolveDefaultStartPage(prefs.defaultStartPage, canManage),
    );
    router.replace(href);
  }, [
    ready,
    isAuthenticated,
    profile?.id,
    canManage,
    router,
    state.organization.slug,
  ]);

  return (
    <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
      Loading…
    </div>
  );
}
