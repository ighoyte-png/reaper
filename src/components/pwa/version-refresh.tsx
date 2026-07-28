"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { APP_VERSION } from "@/lib/version";

const POLL_MS = 5 * 60 * 1000;

/**
 * Detects a newer deploy (via /api/version) and offers a refresh.
 * Auto-reloads when the tab is hidden so users return to a fresh build
 * without interrupting active editing.
 */
export function VersionRefresh() {
  const [updateReady, setUpdateReady] = useState(false);
  const updateReadyRef = useRef(false);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  const check = useCallback(async () => {
    if (updateReadyRef.current) return;
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { version?: string };
      const remote = data.version?.trim();
      if (!remote || remote === APP_VERSION) return;
      updateReadyRef.current = true;
      setUpdateReady(true);
      if (document.visibilityState === "hidden") {
        reload();
      }
    } catch {
      /* offline / transient */
    }
  }, [reload]);

  useEffect(() => {
    void check();
    const id = window.setInterval(() => void check(), POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onFocus = () => void check();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  useEffect(() => {
    if (!updateReady) return;
    const onHidden = () => {
      if (document.visibilityState === "hidden") reload();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [updateReady, reload]);

  if (!updateReady) return null;

  return (
    <div className="pointer-events-none fixed top-3 left-4 right-4 z-[90] flex justify-center">
      <div className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-lg">
        <p className="min-w-0 flex-1 text-sm text-[var(--text)]">
          A new version of Reaper is ready.
        </p>
        <Button type="button" variant="primary" size="sm" onClick={reload}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
