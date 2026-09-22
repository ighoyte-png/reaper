"use client";

/**
 * No continuous polling. ClickUp sync is event-driven:
 * - Reaper writes that enqueue outbox → requestClickUpOutboxDrain()
 * - ClickUp webhooks → enqueue then after() processInbound (fast ACK)
 * - Enable/resync project → processOutbox on the API route
 *
 * Kept as a no-op so AppShell’s lazy import stays valid.
 */
export function ClickUpOutboxPoller() {
  return null;
}
