/**
 * ClickUp → Reaper inbound apply (webhooks, LWW, echo suppress).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as cu from "@/addons/clickup/client";
import { resolveOrgClickUpAuth } from "@/addons/clickup/auth";
import {
  deleteLink,
  getLinkByClickUpId,
  loadSettings,
  setLink,
  suppressOutbound,
  touchLinkPushMeta,
  tryClaimLink,
  upsertSettings,
  webhookEndpointUri,
} from "@/addons/clickup/db";
import {
  mapClickUpStatusToReaper,
  stripReaperLinkFooter,
  taskContentHash,
  notesToDescription,
  normalizeDescription,
} from "@/addons/clickup/mappers";
import type { AddonClickupSettingsRow, ClickUpStatusMap } from "@/addons/clickup/types";
import { normalizeStatusMap } from "@/addons/clickup/types";

const ECHO_WINDOW_MS = 60_000;

export type ClickUpWebhookHistoryItem = {
  id?: string;
  date?: string | number;
  field?: string;
  type?: number;
  parent_id?: string | number;
  user?: { id?: number; email?: string; username?: string };
  before?: unknown;
  after?: unknown;
  comment?: {
    id?: string | number;
    text?: string;
    comment_text?: string;
  };
};

export type ClickUpWebhookPayload = {
  webhook_id?: string;
  event?: string;
  task_id?: string;
  history_items?: ClickUpWebhookHistoryItem[];
};

const IMPORTABLE_EVENTS = new Set([
  "taskCreated",
  "taskUpdated",
  "taskStatusUpdated",
  "taskAssigneeUpdated",
  "taskDueDateUpdated",
]);

export function verifyClickUpWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const digest = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  try {
    const a = Buffer.from(digest, "hex");
    const b = Buffer.from(signature.trim(), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return digest === signature.trim();
  }
}

function historyEventMs(item: ClickUpWebhookHistoryItem | undefined): number {
  if (!item?.date) return Date.now();
  const n = typeof item.date === "string" ? Number(item.date) : item.date;
  return Number.isFinite(n) ? n : Date.now();
}

function maxHistoryMs(items: ClickUpWebhookHistoryItem[] | undefined): number {
  if (!items?.length) return Date.now();
  return Math.max(...items.map(historyEventMs));
}

function isEcho(
  lastPushedAt: string | null | undefined,
  contentHash: string | null | undefined,
  nextHash: string,
  eventMs: number,
): boolean {
  if (!lastPushedAt) return false;
  const pushedMs = Date.parse(lastPushedAt);
  if (!Number.isFinite(pushedMs)) return false;
  if (Math.abs(eventMs - pushedMs) > ECHO_WINDOW_MS) return false;
  return Boolean(contentHash && contentHash === nextHash);
}

async function resolveProfileFromClickUpUser(
  admin: SupabaseClient,
  orgId: string,
  clickUpUserId: number | string | null | undefined,
): Promise<string | null> {
  if (clickUpUserId == null || clickUpUserId === "") return null;
  const id = String(clickUpUserId);
  const { data: oauth } = await admin
    .from("addon_clickup_oauth_tokens")
    .select("profile_id")
    .eq("organization_id", orgId)
    .eq("clickup_user_id", id)
    .maybeSingle();
  return (oauth?.profile_id as string | undefined) ?? null;
}

async function resolvePersonFromClickUpUser(
  admin: SupabaseClient,
  orgId: string,
  clickUpUserId: number | string | null | undefined,
  email?: string | null,
): Promise<string | null> {
  try {
    if (clickUpUserId != null && clickUpUserId !== "") {
      const id = String(clickUpUserId);
      const { data: mapped } = await admin
        .from("addon_clickup_user_map")
        .select("person_id")
        .eq("organization_id", orgId)
        .eq("clickup_user_id", id)
        .limit(1)
        .maybeSingle();
      if (mapped?.person_id) return mapped.person_id as string;

      const profileId = await resolveProfileFromClickUpUser(admin, orgId, id);
      if (profileId) {
        const { data: person } = await admin
          .from("people")
          .select("id")
          .eq("organization_id", orgId)
          .eq("profile_id", profileId)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        if (person?.id) return person.id as string;
      }
    }

    const emailKey = email?.trim().toLowerCase();
    if (emailKey) {
      const { data: people } = await admin
        .from("people")
        .select("id, email")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .limit(500);
      const match = (people ?? []).find(
        (p) =>
          typeof p.email === "string" &&
          p.email.trim().toLowerCase() === emailKey,
      );
      if (match?.id) return match.id as string;
    }
  } catch {
    /* assignee mapping is best-effort — never block task import */
  }
  return null;
}

async function projectSyncEnabled(
  admin: SupabaseClient,
  orgId: string,
  projectId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("addon_clickup_project_sync")
    .select("enabled, reconciling")
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .maybeSingle();
  return Boolean(data?.enabled) && !data?.reconciling;
}

/** Gantt lists are Reaper-authoritative — inbound must not rewrite schedule/structure. */
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

function commentTextFromHistory(
  item: ClickUpWebhookHistoryItem | undefined,
): string {
  const c = item?.comment;
  if (!c) {
    if (typeof item?.after === "string") return item.after;
    return "";
  }
  return String(c.comment_text ?? c.text ?? "").trim();
}

export async function ensureSpaceWebhook(args: {
  admin: SupabaseClient;
  orgId: string;
  origin: string;
}): Promise<AddonClickupSettingsRow> {
  const { admin, orgId, origin } = args;
  const settings = await loadSettings(admin, orgId);
  if (!settings?.enabled) throw new Error("ClickUp addon is disabled");
  if (!settings.clickup_team_id?.trim()) {
    throw new Error("ClickUp workspace is not configured");
  }
  if (!settings.space_id?.trim()) {
    throw new Error("ClickUp Space is not configured");
  }

  const auth = await resolveOrgClickUpAuth(admin, orgId);
  const endpoint = webhookEndpointUri(origin);

  if (settings.webhook_id) {
    try {
      await cu.deleteWebhook(auth, settings.webhook_id);
    } catch {
      /* recreate below */
    }
  }

  const created = await cu.createWebhook(auth, settings.clickup_team_id, {
    endpoint,
    events: [...cu.CLICKUP_TASK_WEBHOOK_EVENTS],
    space_id: /^\d+$/.test(settings.space_id)
      ? Number(settings.space_id)
      : settings.space_id,
  });
  const webhookId = created.id || created.webhook_id;
  if (!webhookId) throw new Error("ClickUp webhook response missing id");
  if (!created.secret) {
    throw new Error("ClickUp webhook response missing secret");
  }

  return upsertSettings(admin, orgId, {
    webhook_enabled: true,
    webhook_id: String(webhookId),
    webhook_secret: created.secret,
    last_webhook_error: null,
  });
}

export async function disableSpaceWebhook(args: {
  admin: SupabaseClient;
  orgId: string;
}): Promise<AddonClickupSettingsRow> {
  const { admin, orgId } = args;
  const settings = await loadSettings(admin, orgId);
  if (settings?.webhook_id) {
    try {
      const auth = await resolveOrgClickUpAuth(admin, orgId);
      await cu.deleteWebhook(auth, settings.webhook_id);
    } catch {
      /* clear local anyway */
    }
  }
  return upsertSettings(admin, orgId, {
    webhook_enabled: false,
    webhook_id: null,
    webhook_secret: null,
    last_webhook_error: null,
  });
}

export function idempotencyKeysForPayload(
  payload: ClickUpWebhookPayload,
): string[] {
  const webhookId = payload.webhook_id ?? "unknown";
  const event = payload.event ?? "unknown";
  const items = payload.history_items ?? [];
  if (items.length > 0 && items[0]?.id) {
    // One delivery → one queue row (ClickUp may send many history items).
    return [`${webhookId}:${items[0].id}`];
  }
  return [`${webhookId}:${event}:${payload.task_id ?? "none"}`];
}

export async function enqueueInboundFromWebhook(args: {
  admin: SupabaseClient;
  orgId: string;
  payload: ClickUpWebhookPayload;
}): Promise<{ inserted: number; skipped: number }> {
  const { admin, orgId, payload } = args;
  const keys = idempotencyKeysForPayload(payload);
  let inserted = 0;
  let skipped = 0;
  const event = payload.event ?? "unknown";

  for (const key of keys) {
    const { error } = await admin.from("addon_clickup_inbound_events").insert({
      organization_id: orgId,
      webhook_id: payload.webhook_id ?? null,
      idempotency_key: key,
      event_name: event,
      payload,
      status: "pending",
    });
    if (error) {
      if (error.code === "23505") {
        skipped += 1;
        continue;
      }
      throw new Error(error.message);
    }
    inserted += 1;
  }

  await upsertSettings(admin, orgId, {
    last_webhook_at: new Date().toISOString(),
    last_webhook_error: null,
  });

  return { inserted, skipped };
}

async function markInbound(
  admin: SupabaseClient,
  id: string,
  status: "processed" | "ignored" | "error",
  lastError?: string | null,
): Promise<void> {
  await admin
    .from("addon_clickup_inbound_events")
    .update({
      status,
      last_error: lastError ?? null,
      processed_at: new Date().toISOString(),
      locked_at: null,
    })
    .eq("id", id);
}

async function applyTaskSnapshot(args: {
  admin: SupabaseClient;
  orgId: string;
  settings: AddonClickupSettingsRow;
  statusMap: ClickUpStatusMap;
  reaperTaskId: string;
  cuTask: cu.ClickUpTask;
  eventMs: number;
  actorProfileId: string | null;
  fields?: {
    title?: boolean;
    status?: boolean;
    dates?: boolean;
    description?: boolean;
    assignees?: boolean;
  };
}): Promise<"applied" | "echo" | "stale"> {
  const {
    admin,
    orgId,
    statusMap,
    reaperTaskId,
    cuTask,
    eventMs,
    actorProfileId,
    fields,
  } = args;

  const { data: task } = await admin
    .from("tasks")
    .select("*")
    .eq("id", reaperTaskId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!task) return "stale";

  if (!(await projectSyncEnabled(admin, orgId, task.project_id as string))) {
    return "stale";
  }

  const link = await getLinkByClickUpId(admin, orgId, "task", cuTask.id);
  const notes = stripReaperLinkFooter(cuTask.description);
  const mappedStatus = mapClickUpStatusToReaper(
    cuTask.status?.status,
    statusMap,
  );
  const start = cu.clickUpMsToDateKey(cuTask.start_date);
  const due = cu.clickUpMsToDateKey(cuTask.due_date);
  const assigneePersonId =
    fields?.assignees === false
      ? (task.assignee_person_id as string | null)
      : await resolvePersonFromClickUpUser(
          admin,
          orgId,
          cuTask.assignees?.[0]?.id,
          cuTask.assignees?.[0]?.email,
        );

  const nextHash = taskContentHash({
    title: cuTask.name,
    status: mappedStatus ?? (task.status as string),
    start_date: start,
    due_date: due,
    notes,
    assignee_person_id:
      assigneePersonId ?? (task.assignee_person_id as string | null),
  });

  if (isEcho(link?.last_pushed_at, link?.content_hash, nextHash, eventMs)) {
    return "echo";
  }

  const patch: Record<string, unknown> = {
    edited_at: new Date(eventMs).toISOString(),
    edited_by_profile_id: actorProfileId,
  };

  const applyAll = !fields;
  const reaperEditedMs = task.edited_at
    ? Date.parse(task.edited_at as string)
    : 0;
  const reaperStatusMs = task.status_changed_at
    ? Date.parse(task.status_changed_at as string)
    : reaperEditedMs;

  if ((applyAll || fields?.title) && eventMs >= reaperEditedMs) {
    patch.title = cuTask.name || task.title;
  }
  if ((applyAll || fields?.description) && eventMs >= reaperEditedMs) {
    patch.notes = notes;
  }
  // Gantt lists: Reaper owns start/due dates — never overwrite from ClickUp.
  const ganttProtected = await listIsGanttProtected(
    admin,
    orgId,
    task.list_id as string,
  );
  if (
    !ganttProtected &&
    (applyAll || fields?.dates) &&
    eventMs >= reaperEditedMs
  ) {
    patch.start_date = start;
    patch.due_date = due;
  }
  if ((applyAll || fields?.assignees) && eventMs >= reaperEditedMs) {
    patch.assignee_person_id = assigneePersonId;
  }
  if (
    (applyAll || fields?.status) &&
    mappedStatus &&
    eventMs >= reaperStatusMs &&
    mappedStatus !== task.status
  ) {
    patch.status = mappedStatus;
    patch.status_changed_at = new Date(eventMs).toISOString();
    patch.status_changed_by_profile_id = actorProfileId;
  }

  const meaningful = Object.keys(patch).some(
    (k) => !["edited_at", "edited_by_profile_id"].includes(k),
  );
  if (!meaningful) return "stale";

  await suppressOutbound(admin, orgId, "task", reaperTaskId, 45);
  const { error } = await admin
    .from("tasks")
    .update(patch)
    .eq("id", reaperTaskId)
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);

  await setLink(admin, orgId, "task", reaperTaskId, cuTask.id, {
    content_hash: nextHash,
    last_inbound_at: new Date().toISOString(),
  });
  return "applied";
}

async function importClickUpTask(args: {
  admin: SupabaseClient;
  orgId: string;
  statusMap: ClickUpStatusMap;
  cuTask: cu.ClickUpTask;
  eventMs: number;
  actorProfileId: string | null;
  listIdHint?: string | null;
}): Promise<"created" | "ignored"> {
  const { admin, orgId, statusMap, cuTask, eventMs, actorProfileId } = args;
  const listId = String(
    cuTask.list?.id ?? args.listIdHint ?? "",
  ).trim();
  if (!listId) return "ignored";

  const listLink = await getLinkByClickUpId(admin, orgId, "task_list", listId);
  if (!listLink) return "ignored";

  const { data: taskList } = await admin
    .from("task_lists")
    .select("id, project_id, archived")
    .eq("id", listLink.reaper_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!taskList || taskList.archived) return "ignored";
  if (!(await projectSyncEnabled(admin, orgId, taskList.project_id as string))) {
    return "ignored";
  }
  // Do not import ClickUp-created tasks into Gantt lists — Reaper owns that schedule.
  if (await listIsGanttProtected(admin, orgId, taskList.id as string)) {
    return "ignored";
  }

  const existing = await getLinkByClickUpId(
    admin,
    orgId,
    "task",
    String(cuTask.id),
  );
  if (existing) return "ignored";

  const mappedStatus =
    mapClickUpStatusToReaper(cuTask.status?.status, statusMap) ?? "upcoming";
  const notes = stripReaperLinkFooter(cuTask.description);
  let assigneePersonId = await resolvePersonFromClickUpUser(
    admin,
    orgId,
    cuTask.assignees?.[0]?.id,
    cuTask.assignees?.[0]?.email,
  );

  const { data: maxSort } = await admin
    .from("tasks")
    .select("sort_order")
    .eq("list_id", taskList.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const taskId = crypto.randomUUID();
  const hash = taskContentHash({
    title: cuTask.name || "Untitled",
    status: mappedStatus,
    start_date: cu.clickUpMsToDateKey(cuTask.start_date),
    due_date: cu.clickUpMsToDateKey(cuTask.due_date),
    notes,
    assignee_person_id: assigneePersonId,
  });

  // Claim ClickUp id before insert so concurrent webhooks cannot double-create.
  const claim = await tryClaimLink(
    admin,
    orgId,
    "task",
    taskId,
    String(cuTask.id),
    {
      content_hash: hash,
      last_inbound_at: new Date().toISOString(),
      last_pushed_at: new Date().toISOString(),
    },
  );
  if (claim === "exists") return "ignored";

  const row = {
    id: taskId,
    organization_id: orgId,
    project_id: taskList.project_id,
    list_id: taskList.id,
    parent_id: null as string | null,
    title: cuTask.name || "Untitled",
    status: mappedStatus,
    start_date: cu.clickUpMsToDateKey(cuTask.start_date),
    due_date: cu.clickUpMsToDateKey(cuTask.due_date),
    notes,
    assignee_person_id: assigneePersonId,
    sort_order: ((maxSort?.sort_order as number | undefined) ?? 0) + 1,
    created_by_profile_id: actorProfileId,
    edited_at: new Date(eventMs).toISOString(),
    edited_by_profile_id: actorProfileId,
    is_divider: false,
    is_client_review: false,
  };

  // Parent mapping if CU parent is linked
  if (cuTask.parent) {
    const parentLink = await getLinkByClickUpId(
      admin,
      orgId,
      "task",
      String(cuTask.parent),
    );
    if (parentLink) row.parent_id = parentLink.reaper_id;
  }

  await suppressOutbound(admin, orgId, "task", taskId, 45);

  let { error } = await admin.from("tasks").insert(row);
  // If assignee FK/org checks fail, still create the task unassigned.
  if (error && assigneePersonId) {
    assigneePersonId = null;
    row.assignee_person_id = null;
    ({ error } = await admin.from("tasks").insert(row));
  }
  if (error) {
    await deleteLink(admin, orgId, "task", taskId);
    throw new Error(error.message);
  }
  return "created";
}

async function applyCommentInbound(args: {
  admin: SupabaseClient;
  orgId: string;
  clickUpTaskId: string;
  historyItem: ClickUpWebhookHistoryItem;
  isUpdate: boolean;
}): Promise<"applied" | "ignored" | "echo"> {
  const { admin, orgId, clickUpTaskId, historyItem, isUpdate } = args;
  const taskLink = await getLinkByClickUpId(admin, orgId, "task", clickUpTaskId);
  if (!taskLink) return "ignored";

  const { data: task } = await admin
    .from("tasks")
    .select("id, project_id")
    .eq("id", taskLink.reaper_id)
    .maybeSingle();
  if (!task) return "ignored";
  if (!(await projectSyncEnabled(admin, orgId, task.project_id as string))) {
    return "ignored";
  }

  const cuCommentId = historyItem.comment?.id;
  if (cuCommentId == null) return "ignored";
  const body = commentTextFromHistory(historyItem);
  if (!body.trim()) return "ignored";
  const eventMs = historyEventMs(historyItem);
  const authorProfileId = await resolveProfileFromClickUpUser(
    admin,
    orgId,
    historyItem.user?.id,
  );

  const existing = await getLinkByClickUpId(
    admin,
    orgId,
    "comment",
    String(cuCommentId),
  );

  if (existing) {
    const { data: comment } = await admin
      .from("task_comments")
      .select("id, body, updated_at, created_at")
      .eq("id", existing.reaper_id)
      .maybeSingle();
    if (!comment) return "ignored";
    const localMs = comment.updated_at
      ? Date.parse(comment.updated_at as string)
      : Date.parse(comment.created_at as string);
    if (Number.isFinite(localMs) && eventMs < localMs) return "ignored";
    if (
      normalizeDescription(notesToDescription(comment.body as string)) ===
      normalizeDescription(body)
    ) {
      return "echo";
    }
    await suppressOutbound(admin, orgId, "comment", comment.id as string, 45);
    const { error } = await admin
      .from("task_comments")
      .update({
        body,
        updated_at: new Date(eventMs).toISOString(),
      })
      .eq("id", comment.id);
    if (error) throw new Error(error.message);
    await setLink(admin, orgId, "comment", comment.id as string, String(cuCommentId), {
      last_inbound_at: new Date().toISOString(),
    });
    return "applied";
  }

  if (isUpdate) return "ignored";

  const commentId = crypto.randomUUID();
  await suppressOutbound(admin, orgId, "comment", commentId, 45);
  const { data: created, error } = await admin
    .from("task_comments")
    .insert({
      id: commentId,
      organization_id: orgId,
      task_id: task.id,
      author_profile_id: authorProfileId,
      body,
      created_at: new Date(eventMs).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await setLink(admin, orgId, "comment", created.id, String(cuCommentId), {
    last_inbound_at: new Date().toISOString(),
    last_pushed_at: new Date().toISOString(),
  });
  return "applied";
}

async function applyDeleted(args: {
  admin: SupabaseClient;
  orgId: string;
  clickUpTaskId: string;
}): Promise<"applied" | "ignored"> {
  const { admin, orgId, clickUpTaskId } = args;
  const link = await getLinkByClickUpId(admin, orgId, "task", clickUpTaskId);
  if (!link) return "ignored";

  const { data: task } = await admin
    .from("tasks")
    .select("id, project_id, list_id")
    .eq("id", link.reaper_id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (task) {
    if (!(await projectSyncEnabled(admin, orgId, task.project_id as string))) {
      return "ignored";
    }

    const { data: comments } = await admin
      .from("task_comments")
      .select("id")
      .eq("organization_id", orgId)
      .eq("task_id", link.reaper_id);
    for (const c of comments ?? []) {
      await deleteLink(admin, orgId, "comment", c.id as string);
    }

    // Gantt lists: Reaper keeps the task; only drop the ClickUp link.
    if (await listIsGanttProtected(admin, orgId, task.list_id as string)) {
      await deleteLink(admin, orgId, "task", link.reaper_id);
      return "applied";
    }

    await suppressOutbound(admin, orgId, "task", link.reaper_id, 45);
    for (const c of comments ?? []) {
      await suppressOutbound(admin, orgId, "comment", c.id as string, 45);
    }
    const { error } = await admin
      .from("tasks")
      .delete()
      .eq("id", link.reaper_id)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
  }

  await deleteLink(admin, orgId, "task", link.reaper_id);
  return "applied";
}

async function applyMoved(args: {
  admin: SupabaseClient;
  orgId: string;
  clickUpTaskId: string;
  auth: Awaited<ReturnType<typeof resolveOrgClickUpAuth>>;
  eventMs: number;
}): Promise<"applied" | "ignored"> {
  const { admin, orgId, clickUpTaskId, auth, eventMs } = args;
  const link = await getLinkByClickUpId(admin, orgId, "task", clickUpTaskId);
  if (!link) return "ignored";
  const cuTask = await cu.getTask(auth, clickUpTaskId);
  const listId = cuTask.list?.id;
  if (!listId) return "ignored";
  const listLink = await getLinkByClickUpId(admin, orgId, "task_list", listId);
  if (!listLink) return "ignored";

  const { data: taskList } = await admin
    .from("task_lists")
    .select("id, project_id")
    .eq("id", listLink.reaper_id)
    .maybeSingle();
  if (!taskList) return "ignored";
  if (!(await projectSyncEnabled(admin, orgId, taskList.project_id as string))) {
    return "ignored";
  }

  const { data: current } = await admin
    .from("tasks")
    .select("list_id")
    .eq("id", link.reaper_id)
    .maybeSingle();
  if (
    (current?.list_id &&
      (await listIsGanttProtected(admin, orgId, current.list_id as string))) ||
    (await listIsGanttProtected(admin, orgId, taskList.id as string))
  ) {
    return "ignored";
  }

  await suppressOutbound(admin, orgId, "task", link.reaper_id, 45);
  const { error } = await admin
    .from("tasks")
    .update({
      list_id: taskList.id,
      project_id: taskList.project_id,
      edited_at: new Date(eventMs).toISOString(),
    })
    .eq("id", link.reaper_id)
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
  return "applied";
}

export async function applyInboundEvent(args: {
  admin: SupabaseClient;
  orgId: string;
  eventName: string;
  payload: ClickUpWebhookPayload;
}): Promise<"processed" | "ignored"> {
  const { admin, orgId, eventName, payload } = args;
  const settings = await loadSettings(admin, orgId);
  if (!settings?.enabled || !settings.webhook_enabled) return "ignored";
  const statusMap = normalizeStatusMap(settings.status_map);
  const auth = await resolveOrgClickUpAuth(admin, orgId);
  const taskId = payload.task_id;
  const history = payload.history_items ?? [];
  const eventMs = maxHistoryMs(history);
  const actorUserId = history[0]?.user?.id;
  const actorProfileId = await resolveProfileFromClickUpUser(
    admin,
    orgId,
    actorUserId,
  );

  if (eventName === "taskDeleted") {
    if (!taskId) return "ignored";
    return (await applyDeleted({ admin, orgId, clickUpTaskId: taskId })) ===
      "applied"
      ? "processed"
      : "ignored";
  }

  if (eventName === "taskCommentPosted" || eventName === "taskCommentUpdated") {
    if (!taskId || history.length === 0) return "ignored";
    let any = false;
    for (const item of history) {
      const r = await applyCommentInbound({
        admin,
        orgId,
        clickUpTaskId: taskId,
        historyItem: item,
        isUpdate: eventName === "taskCommentUpdated",
      });
      if (r === "applied") any = true;
    }
    return any ? "processed" : "ignored";
  }

  if (!taskId) return "ignored";

  if (eventName === "taskMoved") {
    const r = await applyMoved({
      admin,
      orgId,
      clickUpTaskId: taskId,
      auth,
      eventMs,
    });
    return r === "applied" ? "processed" : "ignored";
  }

  const link = await getLinkByClickUpId(admin, orgId, "task", taskId);

  // Import when unlinked. Claim lock prevents duplicates across ClickUp's
  // burst of create/status/assignee webhooks.
  if (!link && IMPORTABLE_EVENTS.has(eventName)) {
    const listIdHint =
      history.find((h) => h.parent_id != null)?.parent_id != null
        ? String(history.find((h) => h.parent_id != null)!.parent_id)
        : null;
    try {
      const cuTask = await cu.getTask(auth, taskId);
      const r = await importClickUpTask({
        admin,
        orgId,
        statusMap,
        cuTask,
        eventMs,
        actorProfileId,
        listIdHint,
      });
      return r === "created" ? "processed" : "ignored";
    } catch (e) {
      // taskCreated can race ahead of ClickUp's task GET right after assign.
      if (eventName === "taskCreated") throw e;
      return "ignored";
    }
  }

  if (!link) return "ignored";

  const cuTask = await cu.getTask(auth, taskId);
  const fieldHints: {
    title?: boolean;
    status?: boolean;
    dates?: boolean;
    description?: boolean;
    assignees?: boolean;
  } = {};

  if (eventName === "taskStatusUpdated") fieldHints.status = true;
  else if (eventName === "taskAssigneeUpdated") fieldHints.assignees = true;
  else if (eventName === "taskDueDateUpdated") fieldHints.dates = true;
  else {
    fieldHints.title = true;
    fieldHints.status = true;
    fieldHints.dates = true;
    fieldHints.description = true;
    fieldHints.assignees = true;
  }

  const result = await applyTaskSnapshot({
    admin,
    orgId,
    settings,
    statusMap,
    reaperTaskId: link.reaper_id,
    cuTask,
    eventMs,
    actorProfileId,
    fields: fieldHints,
  });
  return result === "applied" ? "processed" : "ignored";
}

export async function processInbound(
  admin: SupabaseClient,
  orgId: string,
  limit = 25,
): Promise<{ processed: number; ignored: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let ignored = 0;

  const { data: rows } = await admin
    .from("addon_clickup_inbound_events")
    .select("*")
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .is("locked_at", null)
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  for (const row of rows ?? []) {
    const now = new Date().toISOString();
    const { data: locked } = await admin
      .from("addon_clickup_inbound_events")
      .update({ locked_at: now })
      .eq("id", row.id)
      .eq("status", "pending")
      .is("locked_at", null)
      .select("id")
      .maybeSingle();
    if (!locked) continue;

    try {
      const result = await applyInboundEvent({
        admin,
        orgId,
        eventName: row.event_name as string,
        payload: (row.payload ?? {}) as ClickUpWebhookPayload,
      });
      if (result === "processed") {
        await markInbound(admin, row.id as string, "processed");
        processed += 1;
      } else {
        await markInbound(admin, row.id as string, "ignored");
        ignored += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      const attempts = (row.attempts ?? 0) + 1;
      const delayMs = Math.min(60_000, 2_000 * 2 ** Math.min(attempts, 5));
      await admin
        .from("addon_clickup_inbound_events")
        .update({
          locked_at: null,
          attempts,
          last_error: msg.slice(0, 500),
          available_at: new Date(Date.now() + delayMs).toISOString(),
          status: attempts >= 8 ? "error" : "pending",
        })
        .eq("id", row.id);
      await upsertSettings(admin, orgId, {
        last_webhook_error: msg.slice(0, 500),
      });
    }
  }

  return { processed, ignored, errors };
}

/** Re-export for outbound echo metadata after successful push. */
export { touchLinkPushMeta };
