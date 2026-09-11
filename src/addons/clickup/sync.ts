/**
 * Push / reconcile Reaper → ClickUp for a project (one-way).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import * as cu from "@/addons/clickup/client";
import {
  resolveClickUpAuth,
  resolveOrgClickUpAuth,
  isUnauthorizedClickUpError,
  markOAuthNeedsReauth,
} from "@/addons/clickup/auth";
import {
  getLink,
  loadSettings,
  setLink,
  linksForProjectTasks,
} from "@/addons/clickup/db";
import {
  notesToDescription,
  normalizeDescription,
  taskFieldsMatchClickUp,
  taskToClickUpBody,
} from "@/addons/clickup/mappers";
import type {
  ClickUpAuth,
  ClickUpStatusMap,
  ReconcileSummary,
} from "@/addons/clickup/types";
import { normalizeStatusMap } from "@/addons/clickup/types";
import type { Client, Milestone, Project, Task, TaskList } from "@/lib/types";

function requireSpace(spaceId: string | null | undefined): string {
  if (!spaceId?.trim()) throw new Error("ClickUp Space is not configured");
  return spaceId.trim();
}

function requireStatusMap(map: ClickUpStatusMap): ClickUpStatusMap {
  const m = normalizeStatusMap(map);
  if (!m.upcoming || !m.active || !m.complete) {
    throw new Error("Map all three Reaper statuses to ClickUp statuses");
  }
  return m;
}

async function ensureClientFolder(
  admin: SupabaseClient,
  orgId: string,
  auth: ClickUpAuth,
  spaceId: string,
  client: Client,
): Promise<string> {
  const existing = await getLink(admin, orgId, "client", client.id);
  if (existing) {
    try {
      await cu.updateFolder(auth, existing, client.name);
    } catch {
      /* ignore rename failures */
    }
    return existing;
  }
  const folders = await cu.getFolders(auth, spaceId);
  const byName = folders.find(
    (f) => f.name.trim().toLowerCase() === client.name.trim().toLowerCase(),
  );
  if (byName) {
    await setLink(admin, orgId, "client", client.id, byName.id);
    return byName.id;
  }
  const created = await cu.createFolder(auth, spaceId, client.name);
  await setLink(admin, orgId, "client", client.id, created.id);
  return created.id;
}

async function ensureProjectFolder(
  admin: SupabaseClient,
  orgId: string,
  auth: ClickUpAuth,
  spaceId: string,
  clientFolderId: string,
  project: Project,
  mode: "link" | "create",
  linkClickUpId?: string | null,
): Promise<string> {
  if (mode === "link" && linkClickUpId) {
    await setLink(admin, orgId, "project", project.id, linkClickUpId);
    try {
      await cu.updateFolder(auth, linkClickUpId, project.name);
    } catch {
      /* list-linked projects may not be folders */
    }
    return linkClickUpId;
  }
  const existing = await getLink(admin, orgId, "project", project.id);
  if (existing) {
    try {
      await cu.updateFolder(auth, existing, project.name);
    } catch {
      /* ignore */
    }
    return existing;
  }
  // Prefer subfolder under client when API supports parent; fallback: folder in space
  try {
    const created = await cu.createFolder(
      auth,
      spaceId,
      project.name,
      clientFolderId,
    );
    await setLink(admin, orgId, "project", project.id, created.id);
    return created.id;
  } catch {
    const created = await cu.createFolder(auth, spaceId, `${project.name}`);
    await setLink(admin, orgId, "project", project.id, created.id);
    return created.id;
  }
}

async function ensureTaskList(
  admin: SupabaseClient,
  orgId: string,
  auth: ClickUpAuth,
  projectFolderId: string,
  list: TaskList,
): Promise<string> {
  const existing = await getLink(admin, orgId, "task_list", list.id);
  if (existing) {
    try {
      await cu.updateList(auth, existing, list.name);
    } catch {
      /* ignore */
    }
    return existing;
  }
  const lists = await cu.getListsInFolder(auth, projectFolderId);
  const byName = lists.find(
    (l) => l.name.trim().toLowerCase() === list.name.trim().toLowerCase(),
  );
  if (byName) {
    await setLink(admin, orgId, "task_list", list.id, byName.id);
    return byName.id;
  }
  const created = await cu.createList(auth, projectFolderId, list.name);
  await setLink(admin, orgId, "task_list", list.id, created.id);
  return created.id;
}

async function pushTask(
  admin: SupabaseClient,
  orgId: string,
  auth: ClickUpAuth,
  statusMap: ClickUpStatusMap,
  listClickUpId: string,
  task: Task,
  parentClickUpId: string | null,
  assigneeIds: number[],
): Promise<"created" | "updated" | "in_sync"> {
  const body = taskToClickUpBody(task, statusMap, {
    parentClickUpId,
    assigneeClickUpIds: assigneeIds.length ? assigneeIds : undefined,
  });
  const existing = await getLink(admin, orgId, "task", task.id);
  if (existing) {
    await cu.updateTask(auth, existing, body);
    return "updated";
  }
  const created = await cu.createTask(auth, listClickUpId, body);
  await setLink(admin, orgId, "task", task.id, created.id);
  return "created";
}

export async function reconcileProject(args: {
  admin: SupabaseClient;
  orgId: string;
  projectId: string;
  linkMode: "link" | "create";
  linkClickUpFolderId?: string | null;
}): Promise<ReconcileSummary> {
  const { admin, orgId, projectId, linkMode, linkClickUpFolderId } = args;
  const settings = await loadSettings(admin, orgId);
  if (!settings?.enabled) throw new Error("ClickUp addon is disabled");
  const auth = await resolveOrgClickUpAuth(admin, orgId);
  const spaceId = requireSpace(settings.space_id);
  const statusMap = requireStatusMap(normalizeStatusMap(settings.status_map));

  const summary: ReconcileSummary = {
    created: 0,
    updated: 0,
    in_sync: 0,
    orphans: 0,
    errors: [],
    finished_at: new Date().toISOString(),
  };

  const { data: project, error: pErr } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (pErr || !project) throw new Error("Project not found");
  if (project.sandbox_mode) throw new Error("Sandbox projects are not synced");

  const { data: client } = await admin
    .from("clients")
    .select("*")
    .eq("id", project.client_id)
    .maybeSingle();
  if (!client) throw new Error("Client not found");

  const clientFolderId = await ensureClientFolder(
    admin,
    orgId,
    auth,
    spaceId,
    client as Client,
  );
  const projectFolderId = await ensureProjectFolder(
    admin,
    orgId,
    auth,
    spaceId,
    clientFolderId,
    project as Project,
    linkMode,
    linkClickUpFolderId,
  );

  const { data: lists } = await admin
    .from("task_lists")
    .select("*")
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true });

  const listRows = (lists ?? []) as TaskList[];
  const activeLists = listRows.filter((l) => !l.archived);

  const listIdMap = new Map<string, string>();
  for (const list of activeLists) {
    try {
      const cuListId = await ensureTaskList(
        admin,
        orgId,
        auth,
        projectFolderId,
        list,
      );
      listIdMap.set(list.id, cuListId);
    } catch (e) {
      summary.errors.push(
        `List ${list.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  let fallbackListId: string | null = null;
  if (listIdMap.size === 0) {
    try {
      const created = await cu.createList(auth, projectFolderId, "Tasks");
      fallbackListId = created.id;
    } catch (e) {
      summary.errors.push(
        `Default list: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const { data: tasks } = await admin
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true });

  const taskRows = ((tasks ?? []) as Task[]).filter((t) => !t.is_divider);

  const { data: userMaps } = await admin
    .from("addon_clickup_user_map")
    .select("person_id, clickup_user_id")
    .eq("organization_id", orgId);
  const personToCu = new Map(
    (userMaps ?? []).map((r) => [
      r.person_id as string,
      Number(r.clickup_user_id),
    ]),
  );

  const cuTaskIds = new Set<string>();
  const cuTasksByList = new Map<
    string,
    Awaited<ReturnType<typeof cu.getTasksInList>>
  >();
  for (const cuListId of new Set([
    ...listIdMap.values(),
    ...(fallbackListId ? [fallbackListId] : []),
  ])) {
    try {
      const cuTasks = await cu.getTasksInList(auth, cuListId);
      cuTasksByList.set(cuListId, cuTasks);
      for (const t of cuTasks) cuTaskIds.add(t.id);
    } catch {
      /* ignore */
    }
  }
  const linkedTaskIds = await linksForProjectTasks(
    admin,
    orgId,
    taskRows.map((t) => t.id),
  );
  const linkedCu = new Set(linkedTaskIds.values());
  let orphanCount = 0;
  for (const id of cuTaskIds) {
    if (!linkedCu.has(id)) orphanCount += 1;
  }
  summary.orphans = orphanCount;

  const byId = new Map(taskRows.map((t) => [t.id, t]));
  const ordered: Task[] = [];
  const seen = new Set<string>();
  function visit(t: Task) {
    if (seen.has(t.id)) return;
    if (t.parent_id && byId.has(t.parent_id)) visit(byId.get(t.parent_id)!);
    seen.add(t.id);
    ordered.push(t);
  }
  for (const t of taskRows) visit(t);

  for (const task of ordered) {
    try {
      const cuListId = listIdMap.get(task.list_id) ?? fallbackListId;
      if (!cuListId) {
        summary.errors.push(`Task ${task.title}: no ClickUp list`);
        continue;
      }
      let parentCu: string | null = null;
      if (task.parent_id) {
        parentCu = await getLink(admin, orgId, "task", task.parent_id);
      }
      const existing = await getLink(admin, orgId, "task", task.id);
      const assignees: number[] = [];
      if (task.assignee_person_id) {
        const n = personToCu.get(task.assignee_person_id);
        if (Number.isFinite(n)) assignees.push(n!);
      }

      if (existing) {
        let inSync = false;
        for (const cuTasks of cuTasksByList.values()) {
          const found = cuTasks.find((t) => t.id === existing);
          if (found && taskFieldsMatchClickUp(task, found, statusMap)) {
            inSync = true;
            break;
          }
        }
        if (inSync) {
          summary.in_sync += 1;
          continue;
        }
        await cu.updateTask(
          auth,
          existing,
          taskToClickUpBody(task, statusMap, {
            parentClickUpId: parentCu,
            assigneeClickUpIds: assignees,
          }),
        );
        summary.updated += 1;
      } else {
        const cuTasks = cuTasksByList.get(cuListId) ?? [];
        const byName = cuTasks.find(
          (t) =>
            t.name.trim().toLowerCase() ===
            (task.title || "Untitled").trim().toLowerCase(),
        );
        if (byName) {
          await setLink(admin, orgId, "task", task.id, byName.id);
          if (taskFieldsMatchClickUp(task, byName, statusMap)) {
            summary.in_sync += 1;
          } else {
            await cu.updateTask(
              auth,
              byName.id,
              taskToClickUpBody(task, statusMap, {
                parentClickUpId: parentCu,
                assigneeClickUpIds: assignees,
              }),
            );
            summary.updated += 1;
          }
        } else {
          const result = await pushTask(
            admin,
            orgId,
            auth,
            statusMap,
            cuListId,
            task,
            parentCu,
            assignees,
          );
          if (result === "created") summary.created += 1;
          else if (result === "updated") summary.updated += 1;
          else summary.in_sync += 1;
        }
      }
    } catch (e) {
      summary.errors.push(
        `Task ${task.title}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const { data: milestones } = await admin
    .from("milestones")
    .select("*")
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true });

  const milestoneListId = [...listIdMap.values()][0] ?? fallbackListId;
  if (milestoneListId) {
    for (const m of (milestones ?? []) as Milestone[]) {
      try {
        const existing = await getLink(admin, orgId, "milestone", m.id);
        const status =
          m.status === "done"
            ? statusMap.complete
            : m.status === "missed"
              ? statusMap.complete
              : statusMap.upcoming;
        const body = {
          name: `◆ ${m.name}`,
          description: notesToDescription(""),
          status,
          start_date: cu.dateKeyToClickUpMs(m.start_date ?? undefined),
          due_date: cu.dateKeyToClickUpMs(m.due_date ?? undefined),
        };
        if (existing) {
          await cu.updateTask(auth, existing, body);
          summary.updated += 1;
        } else {
          const created = await cu.createTask(auth, milestoneListId, body);
          await setLink(admin, orgId, "milestone", m.id, created.id);
          summary.created += 1;
        }
      } catch (e) {
        summary.errors.push(
          `Milestone ${m.name}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  const { data: comments } = await admin
    .from("task_comments")
    .select("*")
    .eq("organization_id", orgId)
    .in(
      "task_id",
      taskRows.map((t) => t.id),
    );
  for (const c of comments ?? []) {
    try {
      const already = await getLink(admin, orgId, "comment", c.id);
      if (already) continue;
      const taskCu = await getLink(admin, orgId, "task", c.task_id);
      if (!taskCu) continue;
      const text = normalizeDescription(c.body)
        ? notesToDescription(c.body)
        : String(c.body ?? "");
      if (!text.trim()) continue;
      // Prefer comment author's OAuth token for native attribution.
      const commentAuth = c.author_profile_id
        ? await resolveClickUpAuth(admin, orgId, c.author_profile_id)
        : auth;
      const created = await cu.createTaskComment(commentAuth, taskCu, text);
      await setLink(admin, orgId, "comment", c.id, String(created.id));
      summary.created += 1;
    } catch (e) {
      summary.errors.push(
        `Comment: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  summary.finished_at = new Date().toISOString();
  await admin
    .from("addon_clickup_settings")
    .update({
      last_synced_at: summary.finished_at,
      last_error: summary.errors[0] ?? null,
      updated_at: summary.finished_at,
    })
    .eq("organization_id", orgId);

  return summary;
}

export async function pushEntityFromOutbox(args: {
  admin: SupabaseClient;
  orgId: string;
  entityType: string;
  reaperId: string;
  op: string;
  actorProfileId?: string | null;
}): Promise<void> {
  const { admin, orgId, entityType, reaperId, op, actorProfileId } = args;
  const settings = await loadSettings(admin, orgId);
  if (!settings?.enabled) return;
  const auth = await resolveClickUpAuth(admin, orgId, actorProfileId);
  const spaceId = requireSpace(settings.space_id);
  const statusMap = requireStatusMap(normalizeStatusMap(settings.status_map));

  try {
    await pushEntityWithAuth({
      admin,
      orgId,
      entityType,
      reaperId,
      op,
      auth,
      spaceId,
      statusMap,
    });
  } catch (e) {
    if (
      isUnauthorizedClickUpError(e) &&
      actorProfileId &&
      auth.type === "oauth"
    ) {
      await markOAuthNeedsReauth(admin, orgId, actorProfileId);
    }
    throw e;
  }
}

async function pushEntityWithAuth(args: {
  admin: SupabaseClient;
  orgId: string;
  entityType: string;
  reaperId: string;
  op: string;
  auth: ClickUpAuth;
  spaceId: string;
  statusMap: ClickUpStatusMap;
}): Promise<void> {
  const { admin, orgId, entityType, reaperId, op, auth, spaceId, statusMap } =
    args;

  if (op === "delete") {
    await admin
      .from("addon_clickup_links")
      .delete()
      .eq("organization_id", orgId)
      .eq("entity_type", entityType)
      .eq("reaper_id", reaperId);
    return;
  }

  if (entityType === "client") {
    const { data: client } = await admin
      .from("clients")
      .select("*")
      .eq("id", reaperId)
      .maybeSingle();
    if (!client) return;
    await ensureClientFolder(admin, orgId, auth, spaceId, client as Client);
    return;
  }

  if (entityType === "project") {
    const { data: project } = await admin
      .from("projects")
      .select("*")
      .eq("id", reaperId)
      .maybeSingle();
    if (!project || project.sandbox_mode) return;
    const { data: sync } = await admin
      .from("addon_clickup_project_sync")
      .select("enabled")
      .eq("organization_id", orgId)
      .eq("project_id", reaperId)
      .maybeSingle();
    if (!sync?.enabled) return;
    const { data: client } = await admin
      .from("clients")
      .select("*")
      .eq("id", project.client_id)
      .maybeSingle();
    if (!client) return;
    const clientFolderId = await ensureClientFolder(
      admin,
      orgId,
      auth,
      spaceId,
      client as Client,
    );
    await ensureProjectFolder(
      admin,
      orgId,
      auth,
      spaceId,
      clientFolderId,
      project as Project,
      "create",
    );
    return;
  }

  if (entityType === "task_list") {
    const { data: list } = await admin
      .from("task_lists")
      .select("*")
      .eq("id", reaperId)
      .maybeSingle();
    if (!list || list.archived) return;
    const folderId = await getLink(admin, orgId, "project", list.project_id);
    if (!folderId) return;
    await ensureTaskList(admin, orgId, auth, folderId, list as TaskList);
    return;
  }

  if (entityType === "task") {
    const { data: task } = await admin
      .from("tasks")
      .select("*")
      .eq("id", reaperId)
      .maybeSingle();
    if (!task || task.is_divider) return;
    const { data: sync } = await admin
      .from("addon_clickup_project_sync")
      .select("enabled, reconciling")
      .eq("organization_id", orgId)
      .eq("project_id", task.project_id)
      .maybeSingle();
    if (!sync?.enabled || sync.reconciling) return;

    let listCu = await getLink(admin, orgId, "task_list", task.list_id);
    if (!listCu) {
      const folderId = await getLink(admin, orgId, "project", task.project_id);
      if (!folderId) return;
      const { data: list } = await admin
        .from("task_lists")
        .select("*")
        .eq("id", task.list_id)
        .maybeSingle();
      if (list) {
        listCu = await ensureTaskList(
          admin,
          orgId,
          auth,
          folderId,
          list as TaskList,
        );
      }
    }
    if (!listCu) return;
    let parentCu: string | null = null;
    if (task.parent_id) {
      parentCu = await getLink(admin, orgId, "task", task.parent_id);
    }
    const { data: um } = await admin
      .from("addon_clickup_user_map")
      .select("clickup_user_id")
      .eq("organization_id", orgId)
      .eq("person_id", task.assignee_person_id ?? "")
      .maybeSingle();
    const assignees: number[] = [];
    if (um?.clickup_user_id) assignees.push(Number(um.clickup_user_id));

    const existing = await getLink(admin, orgId, "task", task.id);
    const body = taskToClickUpBody(task as Task, statusMap, {
      parentClickUpId: parentCu,
      assigneeClickUpIds: assignees,
    });
    if (existing) {
      await cu.updateTask(auth, existing, body);
    } else {
      const created = await cu.createTask(auth, listCu, body);
      await setLink(admin, orgId, "task", task.id, created.id);
    }
    return;
  }

  if (entityType === "comment") {
    const { data: comment } = await admin
      .from("task_comments")
      .select("*")
      .eq("id", reaperId)
      .maybeSingle();
    if (!comment) return;
    if (await getLink(admin, orgId, "comment", comment.id)) return;
    const taskCu = await getLink(admin, orgId, "task", comment.task_id);
    if (!taskCu) return;
    const created = await cu.createTaskComment(
      auth,
      taskCu,
      notesToDescription(comment.body) || String(comment.body ?? ""),
    );
    await setLink(admin, orgId, "comment", comment.id, String(created.id));
    return;
  }

  if (entityType === "milestone") {
    const { data: m } = await admin
      .from("milestones")
      .select("*")
      .eq("id", reaperId)
      .maybeSingle();
    if (!m) return;
    const folderId = await getLink(admin, orgId, "project", m.project_id);
    if (!folderId) return;
    const lists = await cu.getListsInFolder(auth, folderId);
    const listId = lists[0]?.id;
    if (!listId) return;
    const status =
      m.status === "done" || m.status === "missed"
        ? statusMap.complete
        : statusMap.upcoming;
    const body = {
      name: `◆ ${m.name}`,
      status,
      start_date: cu.dateKeyToClickUpMs(m.start_date ?? undefined),
      due_date: cu.dateKeyToClickUpMs(m.due_date ?? undefined),
    };
    const existing = await getLink(admin, orgId, "milestone", m.id);
    if (existing) {
      await cu.updateTask(auth, existing, body);
    } else {
      const created = await cu.createTask(auth, listId, body);
      await setLink(admin, orgId, "milestone", m.id, created.id);
    }
  }
}

export async function processOutbox(
  admin: SupabaseClient,
  orgId: string,
  limit = 25,
): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  const { data: rows } = await admin
    .from("addon_clickup_outbox")
    .select("*")
    .eq("organization_id", orgId)
    .is("locked_at", null)
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  for (const row of rows ?? []) {
    const now = new Date().toISOString();
    await admin
      .from("addon_clickup_outbox")
      .update({ locked_at: now })
      .eq("id", row.id);

    try {
      await pushEntityFromOutbox({
        admin,
        orgId,
        entityType: row.entity_type,
        reaperId: row.reaper_id,
        op: row.op,
        actorProfileId: row.actor_profile_id ?? null,
      });
      await admin.from("addon_clickup_outbox").delete().eq("id", row.id);
      processed += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      const attempts = (row.attempts ?? 0) + 1;
      const delayMs = Math.min(60_000, 2_000 * 2 ** Math.min(attempts, 5));
      await admin
        .from("addon_clickup_outbox")
        .update({
          locked_at: null,
          attempts,
          last_error: msg.slice(0, 500),
          available_at: new Date(Date.now() + delayMs).toISOString(),
        })
        .eq("id", row.id);
    }
  }
  return { processed, errors };
}
