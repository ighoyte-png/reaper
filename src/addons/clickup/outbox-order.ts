/**
 * Order outbox rows so unlinked task creates run in Reaper sort_order.
 * Already-linked updates and non-task ops keep relative created_at order after creates.
 */

export type OutboxOrderRow = {
  id: string;
  entity_type: string;
  reaper_id: string;
  op: string;
  created_at?: string | null;
};

/**
 * Stable drain order: unlinked task upserts first (by sort_order, then created_at),
 * then everything else in original created_at order.
 */
export function orderOutboxRowsForDrain(
  rows: OutboxOrderRow[],
  opts: {
    /** reaper task id → sort_order */
    taskSortOrder: Map<string, number>;
    /** reaper task ids that already have a ClickUp link */
    linkedTaskIds: Set<string>;
  },
): OutboxOrderRow[] {
  const withIndex = rows.map((row, index) => ({ row, index }));

  function isUnlinkedTaskCreate(row: OutboxOrderRow): boolean {
    if (row.entity_type !== "task") return false;
    if (row.op === "delete") return false;
    return !opts.linkedTaskIds.has(row.reaper_id);
  }

  withIndex.sort((a, b) => {
    const aCreate = isUnlinkedTaskCreate(a.row);
    const bCreate = isUnlinkedTaskCreate(b.row);
    if (aCreate !== bCreate) return aCreate ? -1 : 1;
    if (aCreate && bCreate) {
      const sa = opts.taskSortOrder.get(a.row.reaper_id) ?? Number.MAX_SAFE_INTEGER;
      const sb = opts.taskSortOrder.get(b.row.reaper_id) ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      const ca = a.row.created_at ?? "";
      const cb = b.row.created_at ?? "";
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a.index - b.index;
    }
    return a.index - b.index;
  });

  return withIndex.map((x) => x.row);
}
