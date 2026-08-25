import {
  mapAssignment,
  mapAssignmentBoundTask,
  mapBulletin,
  mapLeaveDay,
  mapMilestone,
  mapPod,
  mapPodMember,
  mapProjectAsset,
  mapTask,
  mapTaskComment,
  mapTaskList,
} from "@/lib/supabase/api";
import type {
  AssignmentBoundTask,
  DemoState,
  PodMember,
  Task,
  TaskList,
} from "@/lib/types";
import type { NotificationKind, NotificationRow } from "@/lib/domain/notifications";

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const exists = list.some((x) => x.id === row.id);
  return exists
    ? list.map((x) => (x.id === row.id ? row : x))
    : [...list, row];
}

/**
 * Fields that matter for live board sync. Used to ignore true local-write
 * echoes while still applying concurrent remote edits during the echo TTL.
 */
export function taskRealtimeEqual(a: Task, b: Task): boolean {
  return (
    a.id === b.id &&
    a.project_id === b.project_id &&
    a.list_id === b.list_id &&
    a.parent_id === b.parent_id &&
    a.assignee_person_id === b.assignee_person_id &&
    a.title === b.title &&
    Boolean(a.is_divider) === Boolean(b.is_divider) &&
    Boolean(a.is_client_review) === Boolean(b.is_client_review) &&
    a.status === b.status &&
    a.start_date === b.start_date &&
    a.due_date === b.due_date &&
    a.notes === b.notes &&
    a.sort_order === b.sort_order &&
    a.edited_at === b.edited_at &&
    a.edited_by_profile_id === b.edited_by_profile_id &&
    a.status_changed_at === b.status_changed_at &&
    a.status_changed_by_profile_id === b.status_changed_by_profile_id &&
    a.assignee_notified_at === b.assignee_notified_at
  );
}

export function taskListRealtimeEqual(a: TaskList, b: TaskList): boolean {
  return (
    a.id === b.id &&
    a.project_id === b.project_id &&
    a.milestone_id === b.milestone_id &&
    a.name === b.name &&
    a.color === b.color &&
    a.sort_order === b.sort_order &&
    Boolean(a.archived) === Boolean(b.archived) &&
    Boolean(a.hide_from_client) === Boolean(b.hide_from_client) &&
    Boolean(a.gantt_enabled) === Boolean(b.gantt_enabled) &&
    a.start_date === b.start_date &&
    a.end_date === b.end_date
  );
}

/**
 * When a local write is still in the echo TTL, return true only if applying
 * this event would be a no-op relative to current state (true self-echo).
 * Concurrent remote edits that differ from local state must still apply.
 */
export function isTrueLocalEcho(
  state: DemoState,
  table: string,
  eventType: string,
  newRecord: Record<string, unknown> | null | undefined,
  oldRecord: Record<string, unknown> | null | undefined,
): boolean {
  if (eventType === "DELETE") {
    const id = String(oldRecord?.id ?? "");
    if (!id) return true;
    if (table === "tasks") {
      return !state.tasks.some((t) => t.id === id);
    }
    if (table === "task_lists") {
      return !state.task_lists.some((l) => l.id === id);
    }
    return true;
  }
  if (!newRecord) return true;
  if (table === "tasks") {
    const mapped = mapTask(newRecord);
    const existing = state.tasks.find((t) => t.id === mapped.id);
    return Boolean(existing && taskRealtimeEqual(existing, mapped));
  }
  if (table === "task_lists") {
    const mapped = mapTaskList(newRecord);
    const existing = state.task_lists.find((l) => l.id === mapped.id);
    return Boolean(existing && taskListRealtimeEqual(existing, mapped));
  }
  return true;
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
  if (table === "task_comment_reactions") {
    const cid = row.comment_id;
    const emoji = row.emoji;
    return cid != null && emoji != null ? `${String(cid)}:${String(emoji)}` : null;
  }
  if (table === "bulletin_unreads") {
    const bid = row.bulletin_id;
    return bid != null ? String(bid) : null;
  }
  if (table === "task_thread_unreads") {
    const tid = row.task_id;
    return tid != null ? String(tid) : null;
  }
  if (table === "task_assigned_unreads") {
    const tid = row.task_id;
    return tid != null ? String(tid) : null;
  }
  if (table === "bulletin_dismissals") {
    const bid = row.bulletin_id;
    return bid != null ? String(bid) : null;
  }
  if (table === "mention_unreads") {
    const pid = row.person_id;
    if (pid == null) return null;
    if (row.comment_id != null && row.comment_id !== "") {
      return `${String(row.comment_id)}:${String(pid)}`;
    }
    if (row.task_id != null && row.task_id !== "") {
      return `task:${String(row.task_id)}:${String(pid)}`;
    }
    if (row.assignment_id != null && row.assignment_id !== "") {
      return `assignment:${String(row.assignment_id)}:${String(pid)}`;
    }
    return null;
  }
  if (table === "notifications") {
    const id = row.id;
    return id != null ? String(id) : null;
  }
  if (table === "pod_members") {
    const podId = row.pod_id;
    const personId = row.person_id;
    return podId != null && personId != null
      ? `${String(podId)}:${String(personId)}`
      : null;
  }
  if (table === "assignment_bound_tasks") {
    const assignmentId = row.assignment_id;
    return assignmentId != null ? String(assignmentId) : null;
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
        const nextBinds = state.assignment_bound_tasks.filter(
          (r) => r.assignment_id !== id,
        );
        if (
          next.length === state.assignments.length &&
          nextBinds.length === state.assignment_bound_tasks.length
        ) {
          return state;
        }
        return {
          ...state,
          assignments: next,
          assignment_bound_tasks: nextBinds,
        };
      }
      const mapped = mapAssignment(newRecord as Record<string, unknown>);
      return { ...state, assignments: upsertById(state.assignments, mapped) };
    }
    case "assignment_bound_tasks": {
      const mapped = mapAssignmentBoundTask(source as Record<string, unknown>);
      if (!mapped.assignment_id || !mapped.task_id) return state;
      if (isDelete) {
        const next = state.assignment_bound_tasks.filter(
          (r) =>
            !(
              r.assignment_id === mapped.assignment_id &&
              r.task_id === mapped.task_id
            ),
        );
        return next.length === state.assignment_bound_tasks.length
          ? state
          : { ...state, assignment_bound_tasks: next };
      }
      const exists = state.assignment_bound_tasks.some(
        (r) =>
          r.assignment_id === mapped.assignment_id &&
          r.task_id === mapped.task_id,
      );
      if (exists) {
        return {
          ...state,
          assignment_bound_tasks: state.assignment_bound_tasks.map((r) =>
            r.assignment_id === mapped.assignment_id &&
            r.task_id === mapped.task_id
              ? mapped
              : r,
          ),
        };
      }
      const row: AssignmentBoundTask = mapped;
      return {
        ...state,
        assignment_bound_tasks: [...state.assignment_bound_tasks, row],
      };
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
    case "task_lists": {
      if (isDelete) {
        const id = String(oldRecord?.id ?? "");
        if (!id) return state;
        const nextLists = state.task_lists.filter((l) => l.id !== id);
        const nextTasks = state.tasks.filter((t) => t.list_id !== id);
        if (
          nextLists.length === state.task_lists.length &&
          nextTasks.length === state.tasks.length
        ) {
          return state;
        }
        return {
          ...state,
          task_lists: nextLists,
          tasks: nextTasks,
        };
      }
      const mapped = mapTaskList(newRecord as Record<string, unknown>);
      return { ...state, task_lists: upsertById(state.task_lists, mapped) };
    }
    case "project_assets": {
      if (isDelete) {
        const id = String(oldRecord?.id ?? "");
        if (!id) return state;
        const next = state.project_assets.filter((a) => a.id !== id);
        return next.length === state.project_assets.length
          ? state
          : { ...state, project_assets: next };
      }
      const mapped = mapProjectAsset(newRecord as Record<string, unknown>);
      return {
        ...state,
        project_assets: upsertById(state.project_assets, mapped),
      };
    }
    case "milestones": {
      if (isDelete) {
        const id = String(oldRecord?.id ?? "");
        if (!id) return state;
        const next = state.milestones.filter((m) => m.id !== id);
        return next.length === state.milestones.length
          ? state
          : { ...state, milestones: next };
      }
      const mapped = mapMilestone(newRecord as Record<string, unknown>);
      return { ...state, milestones: upsertById(state.milestones, mapped) };
    }
    case "task_comments": {
      if (isDelete) {
        const id = String(oldRecord?.id ?? "");
        if (!id) return state;
        const next = state.task_comments.filter((c) => c.id !== id);
        const nextUnreads = state.unread_mentions.filter(
          (r) => r.comment_id !== id,
        );
        if (
          next.length === state.task_comments.length &&
          nextUnreads.length === state.unread_mentions.length
        ) {
          return state;
        }
        return {
          ...state,
          task_comments: next,
          unread_mentions: nextUnreads,
        };
      }
      const mapped = mapTaskComment(newRecord as Record<string, unknown>);
      const existing = state.task_comments.find((c) => c.id === mapped.id);
      const withMentions = {
        ...mapped,
        mentioned_person_ids:
          existing?.mentioned_person_ids ?? mapped.mentioned_person_ids,
        reactions: existing?.reactions ?? mapped.reactions,
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
    case "task_comment_reactions": {
      const commentId = String(source.comment_id ?? "");
      const profileId = String(source.profile_id ?? "");
      const emoji = String(source.emoji ?? "");
      if (!commentId || !profileId || !emoji) return state;
      let changed = false;
      const task_comments = state.task_comments.map((c) => {
        if (c.id !== commentId) return c;
        const has = c.reactions.some(
          (r) => r.profile_id === profileId && r.emoji === emoji,
        );
        if (isDelete) {
          if (!has) return c;
          changed = true;
          return {
            ...c,
            reactions: c.reactions.filter(
              (r) => !(r.profile_id === profileId && r.emoji === emoji),
            ),
          };
        }
        if (has) return c;
        changed = true;
        return {
          ...c,
          reactions: [...c.reactions, { emoji, profile_id: profileId }],
        };
      });
      return changed ? { ...state, task_comments } : state;
    }
    case "bulletins": {
      if (isDelete) {
        const id = String(oldRecord?.id ?? "");
        if (!id) return state;
        const nextBulletins = state.bulletins.filter((b) => b.id !== id);
        const nextUnread = state.unread_bulletin_ids.filter((x) => x !== id);
        if (
          nextBulletins.length === state.bulletins.length &&
          nextUnread.length === state.unread_bulletin_ids.length
        ) {
          return state;
        }
        return {
          ...state,
          bulletins: nextBulletins,
          unread_bulletin_ids: nextUnread,
        };
      }
      const mapped = mapBulletin(newRecord as Record<string, unknown>);
      return { ...state, bulletins: upsertById(state.bulletins, mapped) };
    }
    case "bulletin_unreads": {
      const bulletinId = String(source.bulletin_id ?? "");
      const profileId = String(source.profile_id ?? "");
      if (!bulletinId) return state;
      if (
        state.sessionProfileId &&
        profileId &&
        profileId !== state.sessionProfileId
      ) {
        return state;
      }
      if (isDelete) {
        if (!state.unread_bulletin_ids.includes(bulletinId)) return state;
        return {
          ...state,
          unread_bulletin_ids: state.unread_bulletin_ids.filter(
            (id) => id !== bulletinId,
          ),
        };
      }
      if (state.unread_bulletin_ids.includes(bulletinId)) return state;
      return {
        ...state,
        unread_bulletin_ids: [...state.unread_bulletin_ids, bulletinId],
      };
    }
    case "task_thread_unreads": {
      const taskId = String(source.task_id ?? "");
      const personId = String(source.person_id ?? "");
      if (!taskId || !personId) return state;
      const sessionPersonId =
        state.people.find((p) => p.profile_id === state.sessionProfileId)
          ?.id ?? null;
      if (sessionPersonId && personId !== sessionPersonId) return state;
      if (isDelete) {
        const next = state.unread_task_threads.filter(
          (r) => !(r.task_id === taskId && r.person_id === personId),
        );
        return next.length === state.unread_task_threads.length
          ? state
          : { ...state, unread_task_threads: next };
      }
      if (
        state.unread_task_threads.some(
          (r) => r.task_id === taskId && r.person_id === personId,
        )
      ) {
        return state;
      }
      return {
        ...state,
        unread_task_threads: [
          ...state.unread_task_threads,
          { task_id: taskId, person_id: personId },
        ],
      };
    }
    case "task_assigned_unreads": {
      const taskId = String(source.task_id ?? "");
      const personId = String(source.person_id ?? "");
      if (!taskId || !personId) return state;
      const sessionPersonId =
        state.people.find((p) => p.profile_id === state.sessionProfileId)
          ?.id ?? null;
      if (sessionPersonId && personId !== sessionPersonId) return state;
      if (isDelete) {
        const next = state.unread_assigned_tasks.filter(
          (r) => !(r.task_id === taskId && r.person_id === personId),
        );
        return next.length === state.unread_assigned_tasks.length
          ? state
          : { ...state, unread_assigned_tasks: next };
      }
      if (
        state.unread_assigned_tasks.some(
          (r) => r.task_id === taskId && r.person_id === personId,
        )
      ) {
        return state;
      }
      return {
        ...state,
        unread_assigned_tasks: [
          ...state.unread_assigned_tasks,
          { task_id: taskId, person_id: personId },
        ],
      };
    }
    case "bulletin_dismissals": {
      const bulletinId = String(source.bulletin_id ?? "");
      const profileId = String(source.profile_id ?? "");
      if (!bulletinId || !profileId) return state;
      if (
        state.sessionProfileId &&
        profileId !== state.sessionProfileId
      ) {
        return state;
      }
      if (isDelete) {
        const next = state.dismissed_bulletin_ids.filter(
          (id) => id !== bulletinId,
        );
        return next.length === state.dismissed_bulletin_ids.length
          ? state
          : { ...state, dismissed_bulletin_ids: next };
      }
      if (state.dismissed_bulletin_ids.includes(bulletinId)) return state;
      return {
        ...state,
        dismissed_bulletin_ids: [
          ...state.dismissed_bulletin_ids,
          bulletinId,
        ],
      };
    }
    case "mention_unreads": {
      const commentId =
        source.comment_id != null && source.comment_id !== ""
          ? String(source.comment_id)
          : null;
      const taskId =
        source.task_id != null && source.task_id !== ""
          ? String(source.task_id)
          : null;
      const assignmentId =
        source.assignment_id != null && source.assignment_id !== ""
          ? String(source.assignment_id)
          : null;
      const personId = String(source.person_id ?? "");
      if (!personId) return state;
      if (!commentId && !taskId && !assignmentId) return state;

      const sameRow = (r: (typeof state.unread_mentions)[number]) =>
        r.person_id === personId &&
        r.comment_id === commentId &&
        r.task_id === taskId &&
        r.assignment_id === assignmentId;

      const markedRead =
        source.read_at != null && String(source.read_at).length > 0;
      if (isDelete || markedRead) {
        const next = state.unread_mentions.filter((r) => !sameRow(r));
        return next.length === state.unread_mentions.length
          ? state
          : { ...state, unread_mentions: next };
      }
      if (state.unread_mentions.some(sameRow)) {
        return state;
      }
      return {
        ...state,
        unread_mentions: [
          ...state.unread_mentions,
          {
            comment_id: commentId,
            task_id: taskId,
            assignment_id: assignmentId,
            person_id: personId,
            read_at: null,
            created_at:
              source.created_at != null
                ? String(source.created_at)
                : undefined,
          },
        ],
      };
    }
    case "pods": {
      if (isDelete) {
        const id = String(oldRecord?.id ?? "");
        if (!id) return state;
        const nextPods = state.pods.filter((p) => p.id !== id);
        const nextMembers = state.pod_members.filter((m) => m.pod_id !== id);
        if (
          nextPods.length === state.pods.length &&
          nextMembers.length === state.pod_members.length
        ) {
          return state;
        }
        return {
          ...state,
          pods: nextPods,
          pod_members: nextMembers,
        };
      }
      const mapped = mapPod(newRecord as Record<string, unknown>);
      return { ...state, pods: upsertById(state.pods, mapped) };
    }
    case "pod_members": {
      const mapped = mapPodMember(source as Record<string, unknown>);
      if (!mapped.pod_id || !mapped.person_id) return state;
      if (isDelete) {
        const next = state.pod_members.filter(
          (m) =>
            !(
              m.pod_id === mapped.pod_id && m.person_id === mapped.person_id
            ),
        );
        return next.length === state.pod_members.length
          ? state
          : { ...state, pod_members: next };
      }
      const exists = state.pod_members.some(
        (m) =>
          m.pod_id === mapped.pod_id && m.person_id === mapped.person_id,
      );
      if (exists) return state;
      const row: PodMember = mapped;
      return {
        ...state,
        pod_members: [...state.pod_members, row],
      };
    }
    case "notifications": {
      const id = String(source.id ?? "");
      if (!id) return state;
      const recipient = String(source.recipient_profile_id ?? "");
      if (
        state.sessionProfileId &&
        recipient &&
        recipient !== state.sessionProfileId
      ) {
        return state;
      }
      if (isDelete) {
        const next = state.notifications.filter((n) => n.id !== id);
        return next.length === state.notifications.length
          ? state
          : { ...state, notifications: next };
      }
      const row: NotificationRow = {
        id,
        organization_id: String(source.organization_id ?? ""),
        recipient_profile_id: recipient,
        kind: String(source.kind ?? "message") as NotificationKind,
        title: String(source.title ?? ""),
        body: String(source.body ?? ""),
        href: String(source.href ?? "/"),
        entity_type:
          source.entity_type != null ? String(source.entity_type) : null,
        entity_id: source.entity_id != null ? String(source.entity_id) : null,
        actor_person_id:
          source.actor_person_id != null
            ? String(source.actor_person_id)
            : null,
        read_at: source.read_at != null ? String(source.read_at) : null,
        created_at: String(
          source.created_at ?? new Date().toISOString(),
        ),
      };
      const exists = state.notifications.some((n) => n.id === id);
      return {
        ...state,
        notifications: exists
          ? state.notifications.map((n) => (n.id === id ? row : n))
          : [row, ...state.notifications],
      };
    }
    default:
      return state;
  }
}
