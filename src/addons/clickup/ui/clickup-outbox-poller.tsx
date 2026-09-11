"use client";

import { useEffect } from "react";
import { useData } from "@/lib/data/store";

/**
 * Drains the ClickUp outbox while the user is signed in.
 * Project-form polling alone missed creates made from the task board.
 * processOutbox no-ops when the addon is off / outbox is empty.
 */
export function ClickUpOutboxPoller() {
  const { ready, isAuthenticated, isPublicShare, mode } = useData();

  useEffect(() => {
    if (!ready || !isAuthenticated || isPublicShare || mode !== "supabase") {
      return;
    }

    async function drain() {
      try {
        await fetch("/api/addons/clickup/process-outbox", { method: "POST" });
      } catch {
        /* ignore transient failures */
      }
    }

    void drain();
    const intervalId = window.setInterval(() => {
      void drain();
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [ready, isAuthenticated, isPublicShare, mode]);

  return null;
}
