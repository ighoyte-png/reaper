/**
 * ClickUp ↔ Reaper task list order helpers.
 *
 * ClickUp GET /list/{id}/task defaults to `created` order — not manual UI
 * order. PUT orderindex is ignored (FAQ). These helpers exist for tests /
 * future APIs; reconcile and inbound must NOT rewrite Reaper sort_order from
 * GET results (that flipped lists on Resync).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getTasksInList,
  type ClickUpTask,
} from "@/addons/clickup/client";
import { suppressOutbound } from "@/addons/clickup/db";
import type { ClickUpAuth } from "@/addons/clickup/types";

export function parseClickUpOrderIndex(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Compare two ClickUp orderindex values (lower = higher in list).
 * Nulls sort last so incomplete payloads don't jump ahead.
 */
export function compareClickUpOrderIndex(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  const na = parseClickUpOrderIndex(a);
  const nb = parseClickUpOrderIndex(b);
  if (na == null && nb == null) return 0;
  if (na == null) return 1;
  if (nb == null) return -1;
  if (na === nb) return 0;
  return na < nb ? -1 : 1;
}

/**
 * Stable sort using legacy orderindex. Prefer preserving GET /list task array
 * order in production — ClickUp still returns orderindex but no longer uses it
 * for task positioning (FAQ). Use this only when reconstructing order from
 * mixed sources that lack list-array order.
 */
export function sortClickUpTasksByOrderIndex<
  T extends { id: string; orderindex?: string | number | null },
>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    const byIndex = compareClickUpOrderIndex(a.orderindex, b.orderindex);
    if (byIndex !== 0) return byIndex;
    return String(a.id).localeCompare(String(b.id));
  });
}

export type ReaperTaskOrderRow = {
  id: string;
  parent_id: string | null;
  sort_order: number;
  is_divider?: boolean | null;
};

/**
 * Build desired sort_order assignments for one Reaper list from ClickUp's
 * display-ordered task array. Linked tasks take CU order within each
 * parent_id group; unlinked / divider siblings keep relative order after.
 */
export function planListSortOrders(args: {
  cuTasksInDisplayOrder: Pick<ClickUpTask, "id" | "parent" | "orderindex">[];
  /** clickup_id → reaper task row */
  linkedByCuId: Map<string, ReaperTaskOrderRow>;
  /** All non-deleted tasks currently in the Reaper list */
  reaperTasksInList: ReaperTaskOrderRow[];
}): { reaperId: string; sortOrder: number }[] {
  const { linkedByCuId, reaperTasksInList } = args;
  // Preserve GET /list/{id}/task array order (ClickUp display order).
  const cuOrdered = args.cuTasksInDisplayOrder;

  const linkedInCuOrder: ReaperTaskOrderRow[] = [];
  const seen = new Set<string>();
  for (const cu of cuOrdered) {
    const row = linkedByCuId.get(String(cu.id));
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    linkedInCuOrder.push(row);
  }

  const byParent = new Map<string | null, ReaperTaskOrderRow[]>();
  for (const row of linkedInCuOrder) {
    const key = row.parent_id ?? null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(row);
    byParent.set(key, bucket);
  }

  const reaperByParent = new Map<string | null, ReaperTaskOrderRow[]>();
  for (const row of reaperTasksInList) {
    if (row.is_divider) continue;
    const key = row.parent_id ?? null;
    const bucket = reaperByParent.get(key) ?? [];
    bucket.push(row);
    reaperByParent.set(key, bucket);
  }

  const parentKeys = new Set<string | null>([
    ...reaperByParent.keys(),
    ...byParent.keys(),
  ]);

  const updates: { reaperId: string; sortOrder: number }[] = [];

  for (const parentKey of parentKeys) {
    const linked = byParent.get(parentKey) ?? [];
    const linkedIds = new Set(linked.map((t) => t.id));
    const all = reaperByParent.get(parentKey) ?? [];
    const unlinked = all
      .filter((t) => !linkedIds.has(t.id))
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order || a.id.localeCompare(b.id),
      );
    const final = [...linked, ...unlinked];
    for (let i = 0; i < final.length; i += 1) {
      const t = final[i]!;
      if (t.sort_order !== i) {
        updates.push({ reaperId: t.id, sortOrder: i });
      }
    }
  }

  return updates;
}

async function listIsGanttProtected(
  admin: SupabaseClient,
  orgId: string,
  listId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("task_lists")
    .select("gantt_enabled")
    .eq("id", listId)
    .eq("organization_id", orgId)
    .maybeSingle();
  return Boolean(data?.gantt_enabled);
}

/**
 * Fetch a ClickUp list's tasks and apply display order onto the linked Reaper list.
 */
export async function syncReaperListOrderFromClickUp(args: {
  admin: SupabaseClient;
  orgId: string;
  auth: ClickUpAuth;
  reaperListId: string;
  clickUpListId: string;
}): Promise<number> {
  const cuTasks = await getTasksInList(args.auth, args.clickUpListId);
  return applyClickUpListOrderToReaper({
    admin: args.admin,
    orgId: args.orgId,
    reaperListId: args.reaperListId,
    cuTasksInDisplayOrder: cuTasks,
  });
}

/**
 * Apply ClickUp list display order onto Reaper `tasks.sort_order` for one list.
 * Returns number of rows updated. Skips Gantt-protected lists.
 */
export async function applyClickUpListOrderToReaper(args: {
  admin: SupabaseClient;
  orgId: string;
  reaperListId: string;
  cuTasksInDisplayOrder: ClickUpTask[];
}): Promise<number> {
  const { admin, orgId, reaperListId, cuTasksInDisplayOrder } = args;
  if (!cuTasksInDisplayOrder.length) return 0;
  if (await listIsGanttProtected(admin, orgId, reaperListId)) return 0;

  const cuIds = cuTasksInDisplayOrder.map((t) => String(t.id));
  const { data: linkRows } = await admin
    .from("addon_clickup_links")
    .select("reaper_id, clickup_id")
    .eq("organization_id", orgId)
    .eq("entity_type", "task")
    .in("clickup_id", cuIds);

  const reaperIds = (linkRows ?? []).map((r) => String(r.reaper_id));
  if (reaperIds.length === 0) return 0;

  const { data: listTasks } = await admin
    .from("tasks")
    .select("id, parent_id, sort_order, is_divider")
    .eq("organization_id", orgId)
    .eq("list_id", reaperListId);

  const reaperTasksInList = (listTasks ?? []).map((t) => ({
    id: String(t.id),
    parent_id: (t.parent_id as string | null) ?? null,
    sort_order: Number(t.sort_order) || 0,
    is_divider: Boolean(t.is_divider),
  }));

  const byReaperId = new Map(reaperTasksInList.map((t) => [t.id, t]));
  const linkedByCuId = new Map<string, ReaperTaskOrderRow>();
  for (const row of linkRows ?? []) {
    const task = byReaperId.get(String(row.reaper_id));
    if (!task || task.is_divider) continue;
    linkedByCuId.set(String(row.clickup_id), task);
  }

  const updates = planListSortOrders({
    cuTasksInDisplayOrder,
    linkedByCuId,
    reaperTasksInList,
  });
  if (updates.length === 0) return 0;

  for (const u of updates) {
    await suppressOutbound(admin, orgId, "task", u.reaperId, 45);
  }

  let changed = 0;
  for (const u of updates) {
    const { error } = await admin
      .from("tasks")
      .update({ sort_order: u.sortOrder })
      .eq("id", u.reaperId)
      .eq("organization_id", orgId)
      .eq("list_id", reaperListId);
    if (error) throw new Error(error.message);
    changed += 1;
  }
  return changed;
}
