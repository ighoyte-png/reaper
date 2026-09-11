"use client";

import { useEffect } from "react";
import { useData } from "@/lib/data/store";

/**
 * Drains ClickUp outbox + inbound webhook queue while the user is signed in.
 * process* no-ops when the addon is off / queues are empty.
 */
export function ClickUpOutboxPoller() {
  const { ready, isAuthenticated, isPublicShare, mode } = useData();

  useEffect(() => {
    if (!ready || !isAuthenticated || isPublicShare || mode !== "supabase") {
      return;
    }

    async function drain() {
      try {
        await Promise.all([
          fetch("/api/addons/clickup/process-outbox", { method: "POST" }),
          fetch("/api/addons/clickup/process-inbound", { method: "POST" }),
        ]);
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
