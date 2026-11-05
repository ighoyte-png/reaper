/**
 * Best-effort ClickUp queue drain from the browser after a write that may
 * enqueue outbox rows. Debounced so burst edits share one pair of POSTs.
 * Idle tabs do not poll — Vercel Cron is the safety net.
 */

const DRAIN_DEBOUNCE_MS = 750;
const COMMENT_PRUNE_COOLDOWN_MS = 30_000;

let outboxTimer: ReturnType<typeof setTimeout> | null = null;
let inboundTimer: ReturnType<typeof setTimeout> | null = null;
const commentPruneRecent = new Map<string, number>();

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

/**
 * Reconcile Reaper comments against ClickUp for one task (CU has no
 * comment-deleted webhook). Cooldown avoids hammering on remounts.
 */
export function requestClickUpCommentPrune(reaperTaskId: string) {
  if (typeof window === "undefined") return;
  const id = reaperTaskId?.trim();
  if (!id) return;
  const now = Date.now();
  const last = commentPruneRecent.get(id) ?? 0;
  if (now - last < COMMENT_PRUNE_COOLDOWN_MS) return;
  commentPruneRecent.set(id, now);
  void fetch("/api/addons/clickup/prune-comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ task_id: id }),
  }).catch(() => {
    /* next open / inbound event will retry */
  });
}
