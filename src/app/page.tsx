"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data/store";
import {
  readUserViewPrefs,
  resolveDefaultStartPage,
} from "@/lib/user-view-prefs";

export default function Home() {
  const { ready, isAuthenticated, profile, canManage } = useData();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    const prefs = readUserViewPrefs(profile?.id);
    const href = resolveDefaultStartPage(prefs.defaultStartPage, canManage);
    router.replace(href);
  }, [ready, isAuthenticated, profile?.id, canManage, router]);

  return (
    <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
      Loading…
    </div>
  );
}
