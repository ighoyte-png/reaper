/**
 * Push / reconcile Reaper → ClickUp for a project (one-way).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import * as cu from "@/addons/clickup/client";
import {
  resolveClickUpAuth,
  resolveOrgClickUpAuth,
  isInvalidTokenClickUpError,
  isUnauthorizedClickUpError,
  isNotFoundClickUpError,
  markOAuthNeedsReauth,
  ClickUpActorAuthRequiredError,
} from "@/addons/clickup/auth";
import {
  getLink,
  loadSettings,
  setLink,
  deleteLink,
  linksForProjectTasks,
  touchLinkPushMeta,
} from "@/addons/clickup/db";
import type { ClickUpLinkEntityType } from "@/addons/clickup/types";
import {
  notesToDescription,
  normalizeDescription,
  taskFieldsMatchClickUp,
  taskToClickUpBody,
  taskContentHash,
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

/** Drop a stale id-map row (and comment links when a task was deleted in ClickUp). */
async function clearStaleLink(
  admin: SupabaseClient,
  orgId: string,
  entityType: ClickUpLinkEntityType,
  reaperId: string,
): Promise<void> {
  await deleteLink(admin, orgId, entityType, reaperId);
  if (entityType === "task") {
    const { data: comments } = await admin
      .from("task_comments")
      .select("id")
      .eq("organization_id", orgId)
      .eq("task_id", reaperId);
    for (const c of comments ?? []) {
      await deleteLink(admin, orgId, "comment", c.id);
    }
  }
}

/**
 * After a ClickUp project folder wipe, drop all list/task/comment/milestone
 * links for this Reaper project so reconcile recreates the subtree.
 */
async function purgeProjectSubtreeLinks(
  admin: SupabaseClient,
  orgId: string,
  projectId: string,
): Promise<void> {
  const { data: lists } = await admin
    .from("task_lists")
    .select("id")
    .eq("organization_id", orgId)
    .eq("project_id", projectId);
  for (const list of lists ?? []) {
    await deleteLink(admin, orgId, "task_list", list.id);
  }

  const { data: tasks } = await admin
    .from("tasks")
    .select("id")
    .eq("organization_id", orgId)
    .eq("project_id", projectId);
  const taskIds = (tasks ?? []).map((t) => t.id as string);
  for (const id of taskIds) {
    await deleteLink(admin, orgId, "task", id);
  }
  if (taskIds.length) {
    const { data: comments } = await admin
      .from("task_comments")
      .select("id")
      .eq("organization_id", orgId)
      .in("task_id", taskIds);
    for (const c of comments ?? []) {
      await deleteLink(admin, orgId, "comment", c.id);
    }
  }

  const { data: milestones } = await admin
    .from("milestones")
    .select("id")
    .eq("organization_id", orgId)
    .eq("project_id", projectId);
  for (const m of milestones ?? []) {
    await deleteLink(admin, orgId, "milestone", m.id);
  }
}

async function clickUpFolderAlive(
  auth: ClickUpAuth,
  _spaceId: string,
  folderId: string,
): Promise<boolean> {
  try {
    // GET /folder/{id} works for nested folders; space listing often does not.
    await cu.getFolder(auth, folderId);
    return true;
  } catch {
    return false;
  }
}

function folderNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function isFolderNameTakenError(e: unknown): boolean {
  const body =
    e instanceof cu.ClickUpApiError
      ? e.body
      : e instanceof Error
        ? e.message
        : String(e);
  return /Folder name taken|CAT_014/i.test(body);
}

function isListNameTakenError(e: unknown): boolean {
  const body =
    e instanceof cu.ClickUpApiError
      ? e.body
      : e instanceof Error
        ? e.message
        : String(e);
  return /List name taken|SUBCAT_016/i.test(body);
}

function isListDeletedError(e: unknown): boolean {
  const body =
    e instanceof cu.ClickUpApiError
      ? e.body
      : e instanceof Error
        ? e.message
        : String(e);
  return /list deleted|ACCESS_100/i.test(body);
}

/** Find an existing space/client folder by name (case-insensitive). */
async function findFolderByName(
  auth: ClickUpAuth,
  spaceId: string,
  name: string,
  parentFolderId?: string | null,
): Promise<cu.ClickUpFolder | null> {
  const key = folderNameKey(name);
  if (!key) return null;

  if (parentFolderId) {
    try {
      const parent = await cu.getFolder(auth, parentFolderId, {
        includeSubfolders: true,
      });
      const nested = parent.folders ?? [];
      const hit = nested.find((f) => folderNameKey(f.name) === key);
      if (hit) return hit;
    } catch {
      /* fall through to space list */
    }
  }

  const folders = await cu.getFolders(auth, spaceId);
  return folders.find((f) => folderNameKey(f.name) === key) ?? null;
}

async function clickUpListAlive(
  auth: ClickUpAuth,
  listId: string,
): Promise<{ alive: boolean; list?: cu.ClickUpList }> {
  try {
    const list = await cu.getList(auth, listId);
    return { alive: true, list };
  } catch {
    return { alive: false };
  }
}

async function findListByNameInFolder(
  auth: ClickUpAuth,
  folderId: string,
  name: string,
): Promise<cu.ClickUpList | null> {
  const key = folderNameKey(name);
  const lists = await cu.getAllListsInFolder(auth, folderId);
  const matches = lists.filter((l) => folderNameKey(l.name) === key);
  if (!matches.length) return null;
  return matches.find((l) => !l.archived) ?? matches[0] ?? null;
}

async function adoptOrUnarchiveList(
  auth: ClickUpAuth,
  list: cu.ClickUpList,
  desiredName: string,
): Promise<string> {
  const patch: { name?: string; archived?: boolean } = {};
  if (list.archived) patch.archived = false;
  if (folderNameKey(list.name) !== folderNameKey(desiredName)) {
    patch.name = desiredName;
  }
  if (Object.keys(patch).length) {
    try {
      await cu.updateList(auth, list.id, patch);
    } catch {
      if (list.archived) {
        try {
          await cu.updateList(auth, list.id, { archived: false });
        } catch {
          /* keep */
        }
      }
    }
  }
  return list.id;
}

async function createListOrAdopt(
  auth: ClickUpAuth,
  folderId: string,
  name: string,
): Promise<string> {
  try {
    const created = await cu.createList(auth, folderId, name);
    return created.id;
  } catch (e) {
    if (!isListNameTakenError(e)) throw e;
    const existing = await findListByNameInFolder(auth, folderId, name);
    if (existing) return adoptOrUnarchiveList(auth, existing, name);
    // Name held by a trashed/hidden list we cannot see — unique suffix.
    const created = await cu.createList(auth, folderId, `${name} (Reaper)`);
    return created.id;
  }
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
    const alive = await clickUpFolderAlive(auth, spaceId, existing);
    if (alive) {
      try {
        await cu.updateFolder(auth, existing, client.name);
      } catch {
        /* keep link; rename best-effort */
      }
      return existing;
    }
    await clearStaleLink(admin, orgId, "client", client.id);
  }
  const folders = await cu.getFolders(auth, spaceId);
  const byName = folders.find(
    (f) => f.name.trim().toLowerCase() === client.name.trim().toLowerCase(),
  );
  if (byName) {
    await setLink(admin, orgId, "client", client.id, byName.id);
    return byName.id;
  }
  try {
    const created = await cu.createFolder(auth, spaceId, client.name);
    await setLink(admin, orgId, "client", client.id, created.id);
    return created.id;
  } catch (e) {
    if (!isFolderNameTakenError(e)) throw e;
    const again = await findFolderByName(auth, spaceId, client.name);
    if (again) {
      await setLink(admin, orgId, "client", client.id, again.id);
      return again.id;
    }
    throw e;
  }
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
): Promise<{ folderId: string; rebuilt: boolean }> {
  if (mode === "link" && linkClickUpId) {
    await setLink(admin, orgId, "project", project.id, linkClickUpId);
    try {
      await cu.updateFolder(auth, linkClickUpId, project.name);
    } catch {
      /* list-linked projects may not be folders */
    }
    return { folderId: linkClickUpId, rebuilt: false };
  }
  const existing = await getLink(admin, orgId, "project", project.id);
  if (existing) {
    const alive = await clickUpFolderAlive(auth, spaceId, existing);
    if (alive) {
      try {
        await cu.updateFolder(auth, existing, project.name);
      } catch {
        /* keep */
      }
      return { folderId: existing, rebuilt: false };
    }
    await clearStaleLink(admin, orgId, "project", project.id);
    await purgeProjectSubtreeLinks(admin, orgId, project.id);
  }

  // After delete/recreate in Reaper, ClickUp often still has the folder.
  const adopted = await findFolderByName(
    auth,
    spaceId,
    project.name,
    clientFolderId,
  );
  if (adopted) {
    await setLink(admin, orgId, "project", project.id, adopted.id);
    // Rematch lists by name; keep task links so we don't duplicate ClickUp tasks.
    const { data: lists } = await admin
      .from("task_lists")
      .select("id")
      .eq("organization_id", orgId)
      .eq("project_id", project.id);
    for (const list of lists ?? []) {
      await deleteLink(admin, orgId, "task_list", list.id as string);
    }
    return { folderId: adopted.id, rebuilt: true };
  }

  async function createOrAdopt(parentId?: string): Promise<string> {
    try {
      const created = await cu.createFolder(
        auth,
        spaceId,
        project.name,
        parentId,
      );
      return created.id;
    } catch (e) {
      if (!isFolderNameTakenError(e)) throw e;
      const again = await findFolderByName(
        auth,
        spaceId,
        project.name,
        parentId ?? clientFolderId,
      );
      if (again) return again.id;
      throw e;
    }
  }

  try {
    const folderId = await createOrAdopt(clientFolderId);
    await setLink(admin, orgId, "project", project.id, folderId);
    return { folderId, rebuilt: true };
  } catch {
    const folderId = await createOrAdopt(undefined);
    await setLink(admin, orgId, "project", project.id, folderId);
    return { folderId, rebuilt: true };
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
    const { alive, list: cuList } = await clickUpListAlive(auth, existing);
    if (alive && cuList) {
      try {
        await adoptOrUnarchiveList(auth, cuList, list.name);
      } catch {
        /* keep */
      }
      return existing;
    }
    await clearStaleLink(admin, orgId, "task_list", list.id);
  }

  const byName = await findListByNameInFolder(auth, projectFolderId, list.name);
  if (byName) {
    const id = await adoptOrUnarchiveList(auth, byName, list.name);
    await setLink(admin, orgId, "task_list", list.id, id);
    return id;
  }

  const createdId = await createListOrAdopt(auth, projectFolderId, list.name);
  await setLink(admin, orgId, "task_list", list.id, createdId);
  return createdId;
}

/** Ensure at least one writable list exists under the project folder. */
async function ensureFallbackList(
  auth: ClickUpAuth,
  projectFolderId: string,
  preferredIds: string[],
): Promise<string | null> {
  for (const id of preferredIds) {
    const { alive, list } = await clickUpListAlive(auth, id);
    if (alive && list && !list.archived) return id;
    if (alive && list?.archived) {
      try {
        await cu.updateList(auth, id, { archived: false });
        return id;
      } catch {
        /* try next */
      }
    }
  }

  const lists = await cu.getAllListsInFolder(auth, projectFolderId);
  const active =
    lists.find((l) => !l.archived && folderNameKey(l.name) === "tasks") ??
    lists.find((l) => !l.archived) ??
    lists.find((l) => folderNameKey(l.name) === "tasks") ??
    lists[0];
  if (active) {
    return adoptOrUnarchiveList(auth, active, active.name);
  }

  try {
    return await createListOrAdopt(auth, projectFolderId, "Tasks");
  } catch {
    return null;
  }
}

async function createTaskInClickUp(
  admin: SupabaseClient,
  orgId: string,
  auth: ClickUpAuth,
  listClickUpId: string,
  body: ReturnType<typeof taskToClickUpBody>,
  taskId: string,
  assigneeIds: number[],
  task: Task,
): Promise<string> {
  const { status, ...createBody } = body;
  const created = await cu.createTask(auth, listClickUpId, createBody);
  await setLink(admin, orgId, "task", taskId, created.id);
  if (status) {
    try {
      await cu.updateTask(auth, created.id, {
        status,
        ...(assigneeIds.length
          ? { assignees: { add: assigneeIds, rem: [] } }
          : {}),
      });
    } catch {
      /* status/assignee apply best-effort after create */
    }
  }
  await touchLinkPushMeta(
    admin,
    orgId,
    "task",
    taskId,
    taskContentHash({
      title: task.title,
      status: task.status,
      start_date: task.start_date,
      due_date: task.due_date,
      notes: task.notes,
      assignee_person_id: task.assignee_person_id,
    }),
  );
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
    // Flat assignees only on create; updates use add/rem via pushAssigneeDiff.
    assigneeClickUpIds: undefined,
  });
  const hash = taskContentHash({
    title: task.title,
    status: task.status,
    start_date: task.start_date,
    due_date: task.due_date,
    notes: task.notes,
    assignee_person_id: task.assignee_person_id,
  });
  const existing = await getLink(admin, orgId, "task", task.id);
  if (existing) {
    try {
      const { assignees: _flatAssignees, ...updateFields } = body;
      void _flatAssignees;
      await cu.updateTask(auth, existing, updateFields);
      await pushAssigneeDiff(auth, existing, assigneeIds);
      await touchLinkPushMeta(admin, orgId, "task", task.id, hash);
      return "updated";
    } catch (e) {
      if (!isNotFoundClickUpError(e)) throw e;
      // Task gone — recreate. If the error is actually list-deleted, caller retries.
      if (isListDeletedError(e)) {
        throw e;
      }
      await clearStaleLink(admin, orgId, "task", task.id);
    }
  }
  const createBody = taskToClickUpBody(task, statusMap, {
    parentClickUpId,
    assigneeClickUpIds: assigneeIds.length ? assigneeIds : undefined,
  });
  await createTaskInClickUp(
    admin,
    orgId,
    auth,
    listClickUpId,
    createBody,
    task.id,
    assigneeIds,
    task,
  );
  return "created";
}

/**
 * Push task; if ClickUp says the list is deleted, rebuild the list under the
 * project folder and retry once (then fall back to a shared list).
 */
async function pushTaskWithListRepair(
  admin: SupabaseClient,
  orgId: string,
  auth: ClickUpAuth,
  statusMap: ClickUpStatusMap,
  projectFolderId: string,
  listIdMap: Map<string, string>,
  task: Task,
  parentClickUpId: string | null,
  assigneeIds: number[],
  listRows: TaskList[],
  fallbackListId: string | null,
): Promise<"created" | "updated" | "in_sync"> {
  let cuListId = listIdMap.get(task.list_id) ?? null;
  if (!cuListId) {
    const list = listRows.find((l) => l.id === task.list_id);
    if (list) {
      cuListId = await ensureTaskList(
        admin,
        orgId,
        auth,
        projectFolderId,
        list,
      );
      listIdMap.set(task.list_id, cuListId);
    } else if (fallbackListId) {
      // Orphaned / missing list_id (e.g. after project recreate) — still sync.
      cuListId = fallbackListId;
      if (task.list_id) listIdMap.set(task.list_id, cuListId);
    } else {
      throw new Error("no ClickUp list");
    }
  }

  try {
    return await pushTask(
      admin,
      orgId,
      auth,
      statusMap,
      cuListId,
      task,
      parentClickUpId,
      assigneeIds,
    );
  } catch (e) {
    if (!isListDeletedError(e) && !isListNameTakenError(e)) throw e;

    await clearStaleLink(admin, orgId, "task_list", task.list_id);
    await clearStaleLink(admin, orgId, "task", task.id);

    let repairListId: string | null = null;
    const list = listRows.find((l) => l.id === task.list_id);
    if (list) {
      try {
        repairListId = await ensureTaskList(
          admin,
          orgId,
          auth,
          projectFolderId,
          list,
        );
      } catch {
        repairListId = null;
      }
    }
    if (!repairListId) {
      repairListId =
        (await ensureFallbackList(
          auth,
          projectFolderId,
          [
            ...(fallbackListId ? [fallbackListId] : []),
            ...listIdMap.values(),
          ],
        )) ?? fallbackListId;
    }
    if (!repairListId) throw e;

    if (task.list_id) listIdMap.set(task.list_id, repairListId);
    return pushTask(
      admin,
      orgId,
      auth,
      statusMap,
      repairListId,
      task,
      parentClickUpId,
      assigneeIds,
    );
  }
}

/** Resolve ClickUp user ids for a Reaper person (map → OAuth → email). */
async function resolveAssigneeClickUpIds(
  admin: SupabaseClient,
  orgId: string,
  personId: string | null | undefined,
  personToCu: Map<string, number>,
  emailToCu: Map<string, number>,
): Promise<number[]> {
  if (!personId) return [];
  const mapped = personToCu.get(personId);
  if (mapped != null && Number.isFinite(mapped)) return [mapped];

  const { data: person } = await admin
    .from("people")
    .select("id, email, profile_id")
    .eq("id", personId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!person) return [];

  if (person.profile_id) {
    const { data: oauth } = await admin
      .from("addon_clickup_oauth_tokens")
      .select("clickup_user_id")
      .eq("organization_id", orgId)
      .eq("profile_id", person.profile_id)
      .maybeSingle();
    if (oauth?.clickup_user_id) {
      const n = Number(oauth.clickup_user_id);
      if (Number.isFinite(n)) return [n];
    }
  }

  const email =
    typeof person.email === "string" ? person.email.trim().toLowerCase() : "";
  if (email && emailToCu.has(email)) {
    return [emailToCu.get(email)!];
  }
  return [];
}

/**
 * Require a ClickUp user id when Reaper has an assignee. Silent empty resolve
 * left CU assignees unchanged while Reaper showed a different person.
 */
async function requireAssigneeClickUpIds(
  admin: SupabaseClient,
  orgId: string,
  personId: string | null | undefined,
  personToCu: Map<string, number>,
  emailToCu: Map<string, number>,
): Promise<number[]> {
  if (!personId) return [];
  const ids = await resolveAssigneeClickUpIds(
    admin,
    orgId,
    personId,
    personToCu,
    emailToCu,
  );
  if (ids.length === 0) {
    throw new Error(
      "Cannot map task assignee to a ClickUp user — connect ClickUp for that person or set them in the Admin assignee map",
    );
  }
  return ids;
}

async function loadAssigneeLookups(
  admin: SupabaseClient,
  orgId: string,
  teamId: string | null,
  auth: ClickUpAuth,
): Promise<{ personToCu: Map<string, number>; emailToCu: Map<string, number> }> {
  const { data: userMaps } = await admin
    .from("addon_clickup_user_map")
    .select("person_id, clickup_user_id")
    .eq("organization_id", orgId);
  const personToCu = new Map<string, number>();
  for (const r of userMaps ?? []) {
    const n = Number(r.clickup_user_id);
    if (r.person_id && Number.isFinite(n)) {
      personToCu.set(r.person_id as string, n);
    }
  }

  const emailToCu = new Map<string, number>();
  if (teamId) {
    try {
      const members = await cu.getTeamMembers(auth, teamId);
      for (const m of members) {
        if (m.email) emailToCu.set(m.email.trim().toLowerCase(), m.id);
      }
    } catch {
      /* optional */
    }
  }

  // OAuth connections → person via profile_id
  const { data: tokens } = await admin
    .from("addon_clickup_oauth_tokens")
    .select("profile_id, clickup_user_id")
    .eq("organization_id", orgId)
    .not("clickup_user_id", "is", null);
  if (tokens?.length) {
    const profileIds = tokens.map((t) => t.profile_id as string);
    const { data: people } = await admin
      .from("people")
      .select("id, profile_id")
      .eq("organization_id", orgId)
      .in("profile_id", profileIds);
    const byProfile = new Map(
      (people ?? []).map((p) => [p.profile_id as string, p.id as string]),
    );
    for (const t of tokens) {
      const personId = byProfile.get(t.profile_id as string);
      const n = Number(t.clickup_user_id);
      if (personId && Number.isFinite(n) && !personToCu.has(personId)) {
        personToCu.set(personId, n);
      }
    }
  }

  return { personToCu, emailToCu };
}

async function pushAssigneeDiff(
  auth: ClickUpAuth,
  clickUpTaskId: string,
  desiredIds: number[],
): Promise<void> {
  let currentAssigneeIds: number[] = [];
  try {
    const cuTask = await cu.getTask(auth, clickUpTaskId);
    currentAssigneeIds = (cuTask.assignees ?? [])
      .map((a) => a.id)
      .filter((id) => Number.isFinite(id));
  } catch {
    /* rem may be incomplete if GET fails */
  }
  const diff = cu.assigneeUpdateDiff(desiredIds, currentAssigneeIds);
  if (!diff.add.length && !diff.rem.length) return;
  // Dedicated call — combined field+assignee PUTs have been observed to drop assignees.
  await cu.updateTask(auth, clickUpTaskId, { assignees: diff });
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
  const { folderId: projectFolderId } = await ensureProjectFolder(
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
  // Include archived lists so tasks still pointing at them can map to ClickUp.
  const listsToEnsure = listRows;

  const listIdMap = new Map<string, string>();
  for (const list of listsToEnsure) {
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

  // Always ensure a fallback list exists in the project folder before pushing tasks.
  let fallbackListId: string | null = await ensureFallbackList(
    auth,
    projectFolderId,
    [...listIdMap.values()],
  );
  if (!fallbackListId) {
    summary.errors.push(
      "Default list: could not find or create a ClickUp list under the project folder",
    );
  }

  if (!fallbackListId) {
    summary.errors.push(
      "No ClickUp list available under the project folder — cannot sync tasks",
    );
  } else {
    for (const list of listsToEnsure) {
      if (!listIdMap.has(list.id)) {
        listIdMap.set(list.id, fallbackListId);
      }
    }
  }

  const { data: tasks } = await admin
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: true });

  const taskRows = ((tasks ?? []) as Task[]).filter((t) => !t.is_divider);

  const { personToCu, emailToCu } = await loadAssigneeLookups(
    admin,
    orgId,
    settings.clickup_team_id,
    auth,
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
      if (!listIdMap.has(task.list_id) && !fallbackListId) {
        summary.errors.push(`Task ${task.title}: no ClickUp list`);
        continue;
      }
      // Seed fallback into map so repair helper can use it
      if (!listIdMap.has(task.list_id) && fallbackListId) {
        listIdMap.set(task.list_id, fallbackListId);
      }
      let parentCu: string | null = null;
      if (task.parent_id) {
        parentCu = await getLink(admin, orgId, "task", task.parent_id);
      }
      const existing = await getLink(admin, orgId, "task", task.id);
      const assignees = await resolveAssigneeClickUpIds(
        admin,
        orgId,
        task.assignee_person_id,
        personToCu,
        emailToCu,
      );

      if (existing) {
        let foundInInventory = false;
        let inSync = false;
        for (const cuTasks of cuTasksByList.values()) {
          const found = cuTasks.find((t) => t.id === existing);
          if (found) {
            foundInInventory = true;
            if (taskFieldsMatchClickUp(task, found, statusMap)) {
              inSync = true;
            }
            break;
          }
        }
        if (inSync) {
          summary.in_sync += 1;
          continue;
        }
        if (!foundInInventory) {
          await clearStaleLink(admin, orgId, "task", task.id);
        }
      }

      const result = await pushTaskWithListRepair(
        admin,
        orgId,
        auth,
        statusMap,
        projectFolderId,
        listIdMap,
        task,
        parentCu,
        assignees,
        listRows,
        fallbackListId,
      );
      if (result === "created") summary.created += 1;
      else if (result === "updated") summary.updated += 1;
      else summary.in_sync += 1;
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
          try {
            await cu.updateTask(auth, existing, body);
            summary.updated += 1;
          } catch (e) {
            if (!isNotFoundClickUpError(e)) throw e;
            await clearStaleLink(admin, orgId, "milestone", m.id);
            const created = await cu.createTask(auth, milestoneListId, body);
            await setLink(admin, orgId, "milestone", m.id, created.id);
            summary.created += 1;
          }
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
        ? await resolveAttributionAuth({
            admin,
            orgId,
            actorProfileId: c.author_profile_id,
            orgAuth: auth,
          })
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

async function resolveOutboxActorProfileId(args: {
  admin: SupabaseClient;
  entityType: string;
  reaperId: string;
  actorProfileId?: string | null;
}): Promise<string | null> {
  if (args.actorProfileId) return args.actorProfileId;
  if (args.entityType === "task") {
    const { data } = await args.admin
      .from("tasks")
      .select(
        "edited_by_profile_id, status_changed_by_profile_id, created_by_profile_id",
      )
      .eq("id", args.reaperId)
      .maybeSingle();
    return (
      data?.edited_by_profile_id ??
      data?.status_changed_by_profile_id ??
      data?.created_by_profile_id ??
      null
    );
  }
  if (args.entityType === "comment") {
    const { data } = await args.admin
      .from("task_comments")
      .select("author_profile_id")
      .eq("id", args.reaperId)
      .maybeSingle();
    return data?.author_profile_id ?? null;
  }
  return null;
}

/**
 * Prefer the editor's OAuth for attribution; fall back to org/service so sync
 * still works when they have not connected (or their token cannot write).
 */
async function resolveAttributionAuth(args: {
  admin: SupabaseClient;
  orgId: string;
  actorProfileId: string | null;
  orgAuth: ClickUpAuth;
}): Promise<ClickUpAuth> {
  if (!args.actorProfileId) return args.orgAuth;
  try {
    return await resolveClickUpAuth(args.admin, args.orgId, args.actorProfileId, {
      requireActor: true,
    });
  } catch (e) {
    if (e instanceof ClickUpActorAuthRequiredError) return args.orgAuth;
    throw e;
  }
}

/** Run a ClickUp write with actor auth; on permission failure retry as org. */
async function withAttributionWriteFallback<T>(args: {
  actorAuth: ClickUpAuth;
  orgAuth: ClickUpAuth;
  actorProfileId: string | null;
  admin: SupabaseClient;
  orgId: string;
  write: (auth: ClickUpAuth) => Promise<T>;
}): Promise<T> {
  const sameToken = args.actorAuth.token === args.orgAuth.token;
  try {
    return await args.write(args.actorAuth);
  } catch (e) {
    if (isInvalidTokenClickUpError(e) && args.actorProfileId && !sameToken) {
      await markOAuthNeedsReauth(args.admin, args.orgId, args.actorProfileId);
    }
    if (
      !sameToken &&
      isUnauthorizedClickUpError(e)
    ) {
      return await args.write(args.orgAuth);
    }
    throw e;
  }
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

  // Deletes + folder/list structure use org/service credentials (permissions).
  // Task/comment content prefers the editor's OAuth for attribution, then
  // falls back to org so sync does not stall when they are not connected.
  const orgAuth = await resolveOrgClickUpAuth(admin, orgId);
  const attributionSensitive =
    op !== "delete" && (entityType === "task" || entityType === "comment");
  const resolvedActorId = attributionSensitive
    ? await resolveOutboxActorProfileId({
        admin,
        entityType,
        reaperId,
        actorProfileId,
      })
    : actorProfileId ?? null;
  const actorAuth = attributionSensitive
    ? await resolveAttributionAuth({
        admin,
        orgId,
        actorProfileId: resolvedActorId,
        orgAuth,
      })
    : orgAuth;

  const spaceId = requireSpace(settings.space_id);
  const statusMap = requireStatusMap(normalizeStatusMap(settings.status_map));

  await pushEntityWithAuth({
    admin,
    orgId,
    entityType,
    reaperId,
    op,
    auth: orgAuth,
    actorAuth,
    actorProfileId: resolvedActorId,
    spaceId,
    statusMap,
    teamId: settings.clickup_team_id,
  });
}

async function pushEntityWithAuth(args: {
  admin: SupabaseClient;
  orgId: string;
  entityType: string;
  reaperId: string;
  op: string;
  /** Org/service auth — folders, lists, deletes, assignee lookups. */
  auth: ClickUpAuth;
  /** Editor auth (or org fallback) — task/comment create & update. */
  actorAuth: ClickUpAuth;
  actorProfileId: string | null;
  spaceId: string;
  statusMap: ClickUpStatusMap;
  teamId: string | null;
}): Promise<void> {
  const {
    admin,
    orgId,
    entityType,
    reaperId,
    op,
    auth,
    actorAuth,
    actorProfileId,
    spaceId,
    statusMap,
    teamId,
  } = args;

  if (op === "delete") {
    const clickupId = await getLink(admin, orgId, entityType as ClickUpLinkEntityType, reaperId);

    // Tasks (and milestone mirrors) → hard-delete in ClickUp. Folders/lists
    // stay link-only so hierarchy wipe from Reaper does not nuke the Space.
    if (
      clickupId &&
      (entityType === "task" || entityType === "milestone")
    ) {
      try {
        await cu.deleteTask(auth, clickupId);
      } catch (e) {
        if (!isNotFoundClickUpError(e)) throw e;
      }
    }

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
    let folderId = await getLink(admin, orgId, "project", task.project_id);
    if (!folderId) {
      const { data: project } = await admin
        .from("projects")
        .select("*")
        .eq("id", task.project_id)
        .maybeSingle();
      const { data: client } = project
        ? await admin
            .from("clients")
            .select("*")
            .eq("id", project.client_id)
            .maybeSingle()
        : { data: null };
      if (project && client) {
        const clientFolderId = await ensureClientFolder(
          admin,
          orgId,
          auth,
          spaceId,
          client as Client,
        );
        const ensured = await ensureProjectFolder(
          admin,
          orgId,
          auth,
          spaceId,
          clientFolderId,
          project as Project,
          "create",
        );
        folderId = ensured.folderId;
      }
    }
    if (!folderId) return;
    const { data: list } = await admin
      .from("task_lists")
      .select("*")
      .eq("id", task.list_id)
      .maybeSingle();
    if (!list || list.archived) return;
    // Always re-ensure so deleted lists are detected via folder membership.
    listCu = await ensureTaskList(
      admin,
      orgId,
      auth,
      folderId,
      list as TaskList,
    );
    if (!listCu) return;
    let parentCu: string | null = null;
    if (task.parent_id) {
      parentCu = await getLink(admin, orgId, "task", task.parent_id);
    }
    const { personToCu, emailToCu } = await loadAssigneeLookups(
      admin,
      orgId,
      teamId,
      auth,
    );
    const assignees = await requireAssigneeClickUpIds(
      admin,
      orgId,
      task.assignee_person_id,
      personToCu,
      emailToCu,
    );

    await withAttributionWriteFallback({
      actorAuth,
      orgAuth: auth,
      actorProfileId,
      admin,
      orgId,
      write: (writeAuth) =>
        pushTask(
          admin,
          orgId,
          writeAuth,
          statusMap,
          listCu!,
          task as Task,
          parentCu,
          assignees,
        ),
    });
    return;
  }

  if (entityType === "comment") {
    const { data: comment } = await admin
      .from("task_comments")
      .select("*")
      .eq("id", reaperId)
      .maybeSingle();
    if (!comment) return;
    const taskCu = await getLink(admin, orgId, "task", comment.task_id);
    if (!taskCu) return;
    const text =
      notesToDescription(comment.body) || String(comment.body ?? "");
    if (!text.trim()) return;
    const existing = await getLink(admin, orgId, "comment", comment.id);
    if (existing) {
      try {
        await withAttributionWriteFallback({
          actorAuth,
          orgAuth: auth,
          actorProfileId,
          admin,
          orgId,
          write: async (writeAuth) => {
            await cu.updateTaskComment(writeAuth, existing, text);
            await touchLinkPushMeta(
              admin,
              orgId,
              "comment",
              comment.id,
              `c:${normalizeDescription(text)}`,
            );
          },
        });
      } catch (e) {
        if (!isNotFoundClickUpError(e)) throw e;
        await clearStaleLink(admin, orgId, "comment", comment.id);
        await withAttributionWriteFallback({
          actorAuth,
          orgAuth: auth,
          actorProfileId,
          admin,
          orgId,
          write: async (writeAuth) => {
            const created = await cu.createTaskComment(
              writeAuth,
              taskCu,
              text,
            );
            await setLink(
              admin,
              orgId,
              "comment",
              comment.id,
              String(created.id),
              {
                content_hash: `c:${normalizeDescription(text)}`,
                last_pushed_at: new Date().toISOString(),
              },
            );
          },
        });
      }
      return;
    }
    await withAttributionWriteFallback({
      actorAuth,
      orgAuth: auth,
      actorProfileId,
      admin,
      orgId,
      write: async (writeAuth) => {
        const created = await cu.createTaskComment(writeAuth, taskCu, text);
        await setLink(admin, orgId, "comment", comment.id, String(created.id), {
          content_hash: `c:${normalizeDescription(text)}`,
          last_pushed_at: new Date().toISOString(),
        });
      },
    });
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
    const lists = await cu.getAllListsInFolder(auth, folderId);
    const listId = lists.find((l) => !l.archived)?.id ?? lists[0]?.id;
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
      try {
        await cu.updateTask(auth, existing, body);
      } catch (e) {
        if (!isNotFoundClickUpError(e)) throw e;
        await clearStaleLink(admin, orgId, "milestone", m.id);
        const created = await cu.createTask(auth, listId, body);
        await setLink(admin, orgId, "milestone", m.id, created.id);
      }
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
