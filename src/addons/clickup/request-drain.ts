/**
 * Best-effort ClickUp queue drain from the browser after a write that may
 * enqueue outbox rows. Debounced so burst edits share one pair of POSTs.
 * Idle tabs do not poll — Vercel Cron is the safety net.
 */

const DRAIN_DEBOUNCE_MS = 750;

let outboxTimer: ReturnType<typeof setTimeout> | null = null;
let inboundTimer: ReturnType<typeof setTimeout> | null = null;

function postDrain(path: "/api/addons/clickup/process-outbox" | "/api/addons/clickup/process-inbound") {
  if (typeof window === "undefined") return;
  void fetch(path, { method: "POST" }).catch(() => {
    /* cron / webhook will retry */
  });
}

/** Schedule a single outbox drain after Reaper→ClickUp enqueue. */
export function requestClickUpOutboxDrain() {
  if (typeof window === "undefined") return;
  if (outboxTimer) clearTimeout(outboxTimer);
  outboxTimer = setTimeout(() => {
    outboxTimer = null;
    postDrain("/api/addons/clickup/process-outbox");
  }, DRAIN_DEBOUNCE_MS);
}

/** Schedule a single inbound drain (rarely needed client-side; webhook usually drains). */
export function requestClickUpInboundDrain() {
  if (typeof window === "undefined") return;
  if (inboundTimer) clearTimeout(inboundTimer);
  inboundTimer = setTimeout(() => {
    inboundTimer = null;
    postDrain("/api/addons/clickup/process-inbound");
  }, DRAIN_DEBOUNCE_MS);
}

/** Drain both queues once (e.g. after enabling sync). */
export function requestClickUpDrain() {
  requestClickUpOutboxDrain();
  requestClickUpInboundDrain();
}
