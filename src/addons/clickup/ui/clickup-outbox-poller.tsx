"use client";

/**
 * @deprecated Continuous 4s polling removed — use requestClickUpDrain after
 * writes; Vercel Cron (/api/cron/clickup-drain) is the idle safety net.
 * Kept as a no-op so existing lazy imports in AppShell do not break.
 */
export function ClickUpOutboxPoller() {
  return null;
}
