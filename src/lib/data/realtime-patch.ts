import {
  mapAssignment,
  mapBulletin,
  mapLeaveDay,
  mapTask,
  mapTaskComment,
} from "@/lib/supabase/api";
import type { DemoState } from "@/lib/types";

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const exists = list.some((x) => x.id === row.id);
  return exists
    ? list.map((x) => (x.id === row.id ? row : x))
    : [...list, row];
}

/** Id used for local-write echo suppression (mentions keyed by comment_id). */
export function realtimeEchoId(
  table: string,
  eventType: string,
  newRecord: Record<string, unknown> | null | undefined,
  oldRecord: Record<string, unknown> | null | undefined,
): string | null {
  const row = eventType === "DELETE" ? oldRecord : newRecord;
  if (!row) return null;
  if (table === "task_comment_mentions") {
    const cid = row.comment_id;
    return cid != null ? String(cid) : null;
  }
  return row.id != null ? String(row.id) : null;
}

/**
 * Apply a single postgres_changes event to workspace state without a full refetch.
 * Returns the same state reference when nothing changes.
 */
export function applyRealtimeTableEvent(
  state: DemoState,
  table: string,
  eventType: string,
  newRecord: Record<string, unknown> | null | undefined,
  oldRecord: Record<string, unknown> | null | undefined,
): DemoState {
  const isDelete = eventType === "DELETE";
  const source = isDelete ? oldRecord : newRecord;
  if (!source) return state;

  switch (table) {
    case "assignments": {
      if (isDelete) {
        const id = String(oldRecord?.id ?? "");
        if (!id) return state;
        const next = state.assignments.filter((a) => a.id !== id);
        return next.length === state.assignments.length
          ? state
          : { ...state, assignments: next };
      }
      const mapped = mapAssignment(newRecord as Record<string, unknown>);
      return { ...state, assignments: upsertById(state.assignments, mapped) };
    }
    case "leave_days": {
      if (isDelete) {
        const id = String(oldRecord?.id ?? "");
        if (!id) return state;
        const next = state.leave_days.filter((l) => l.id !== id);
        return next.length === state.leave_days.length
          ? state
          : { ...state, leave_days: next };
      }
      const mapped = mapLeaveDay(newRecord as Record<string, unknown>);
      return { ...state, leave_days: upsertById(state.leave_days, mapped) };
    }
    case "tasks": {
      if (isDelete) {
        const id = String(oldRecord?.id ?? "");
        if (!id) return state;
        const nextTasks = state.tasks.filter(
          (t) => t.id !== id && t.parent_id !== id,
        );
        const nextComments = state.task_comments.filter((c) => c.task_id !== id);
        if (
          nextTasks.length === state.tasks.length &&
          nextComments.length === state.task_comments.length
        ) {
          return state;
        }
        return {
          ...state,
          tasks: nextTasks,
          task_comments: nextComments,
        };
      }
      const mapped = mapTask(newRecord as Record<string, unknown>);
      return { ...state, tasks: upsertById(state.tasks, mapped) };
    }
    case "task_comments": {
      if (isDelete) {
        const id = String(oldRecord?.id ?? "");
        if (!id) return state;
        const next = state.task_comments.filter((c) => c.id !== id);
        return next.length === state.task_comments.length
          ? state
          : { ...state, task_comments: next };
      }
      const mapped = mapTaskComment(newRecord as Record<string, unknown>);
      const existing = state.task_comments.find((c) => c.id === mapped.id);
      const withMentions = {
        ...mapped,
        mentioned_person_ids:
          existing?.mentioned_person_ids ?? mapped.mentioned_person_ids,
      };
      return {
        ...state,
        task_comments: upsertById(state.task_comments, withMentions),
      };
    }
    case "task_comment_mentions": {
      const commentId = String(source.comment_id ?? "");
      const personId = String(source.person_id ?? "");
      if (!commentId || !personId) return state;
      let changed = false;
      const task_comments = state.task_comments.map((c) => {
        if (c.id !== commentId) return c;
        const set = new Set(c.mentioned_person_ids);
        if (isDelete) {
          if (!set.has(personId)) return c;
          set.delete(personId);
        } else {
          if (set.has(personId)) return c;
          set.add(personId);
        }
        changed = true;
        return { ...c, mentioned_person_ids: [...set] };
      });
      return changed ? { ...state, task_comments } : state;
    }
    case "bulletins": {
      if (isDelete) {
        const id = String(oldRecord?.id ?? "");
        if (!id) return state;
        const next = state.bulletins.filter((b) => b.id !== id);
        return next.length === state.bulletins.length
          ? state
          : { ...state, bulletins: next };
      }
      const mapped = mapBulletin(newRecord as Record<string, unknown>);
      return { ...state, bulletins: upsertById(state.bulletins, mapped) };
    }
    default:
      return state;
  }
}
