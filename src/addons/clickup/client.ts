/** Minimal ClickUp REST client (PAT or OAuth Bearer). */

import type { ClickUpAuth } from "@/addons/clickup/types";

export class ClickUpApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`ClickUp API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

export type ClickUpTeam = { id: string; name: string };
export type ClickUpSpace = {
  id: string;
  name: string;
  statuses?: { status: string; type?: string }[];
};
export type ClickUpFolder = { id: string; name: string };
export type ClickUpList = {
  id: string;
  name: string;
  statuses?: { status: string }[];
};
export type ClickUpTask = {
  id: string;
  name: string;
  description?: string;
  status?: { status: string };
  start_date?: string | null;
  due_date?: string | null;
  parent?: string | null;
};

export type ClickUpUser = {
  id: number;
  username?: string;
  email?: string;
};

function authorizationValue(auth: ClickUpAuth): string {
  return auth.type === "oauth" ? `Bearer ${auth.token}` : auth.token;
}

function authHeaders(auth: ClickUpAuth): HeadersInit {
  return {
    Authorization: authorizationValue(auth),
    "Content-Type": "application/json",
  };
}

async function cuFetch<T>(
  auth: ClickUpAuth,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`https://api.clickup.com/api/v2${path}`, {
    ...init,
    headers: {
      ...authHeaders(auth),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ClickUpApiError(res.status, text.slice(0, 500));
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function exchangeOAuthCode(args: {
  clientId: string;
  clientSecret: string;
  code: string;
}): Promise<{ access_token: string }> {
  const res = await fetch("https://api.clickup.com/api/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      code: args.code,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ClickUpApiError(res.status, text.slice(0, 500));
  }
  const data = JSON.parse(text) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("ClickUp OAuth response missing access_token");
  }
  return { access_token: data.access_token };
}

export async function getAuthorizedUser(auth: ClickUpAuth): Promise<ClickUpUser> {
  const data = await cuFetch<{ user: ClickUpUser }>(auth, "/user");
  if (!data.user?.id) throw new Error("ClickUp /user missing id");
  return data.user;
}

export async function getAuthorizedTeams(
  auth: ClickUpAuth,
): Promise<ClickUpTeam[]> {
  const data = await cuFetch<{ teams: ClickUpTeam[] }>(auth, "/team");
  return data.teams ?? [];
}

export async function getSpaces(
  auth: ClickUpAuth,
  teamId: string,
): Promise<ClickUpSpace[]> {
  const data = await cuFetch<{ spaces: ClickUpSpace[] }>(
    auth,
    `/team/${teamId}/space?archived=false`,
  );
  return data.spaces ?? [];
}

export async function createSpace(
  auth: ClickUpAuth,
  teamId: string,
  name: string,
): Promise<ClickUpSpace> {
  return cuFetch<ClickUpSpace>(auth, `/team/${teamId}/space`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getFolders(
  auth: ClickUpAuth,
  spaceId: string,
): Promise<ClickUpFolder[]> {
  const data = await cuFetch<{ folders: ClickUpFolder[] }>(
    auth,
    `/space/${spaceId}/folder?archived=false`,
  );
  return data.folders ?? [];
}

export async function createFolder(
  auth: ClickUpAuth,
  spaceId: string,
  name: string,
  parentFolderId?: string,
): Promise<ClickUpFolder> {
  return cuFetch<ClickUpFolder>(auth, `/space/${spaceId}/folder`, {
    method: "POST",
    body: JSON.stringify({
      name,
      ...(parentFolderId ? { parent_folder_id: parentFolderId } : {}),
    }),
  });
}

export async function updateFolder(
  auth: ClickUpAuth,
  folderId: string,
  name: string,
): Promise<ClickUpFolder> {
  return cuFetch<ClickUpFolder>(auth, `/folder/${folderId}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function getListsInFolder(
  auth: ClickUpAuth,
  folderId: string,
): Promise<ClickUpList[]> {
  const data = await cuFetch<{ lists: ClickUpList[] }>(
    auth,
    `/folder/${folderId}/list?archived=false`,
  );
  return data.lists ?? [];
}

export async function createList(
  auth: ClickUpAuth,
  folderId: string,
  name: string,
): Promise<ClickUpList> {
  return cuFetch<ClickUpList>(auth, `/folder/${folderId}/list`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function createListInSpace(
  auth: ClickUpAuth,
  spaceId: string,
  name: string,
): Promise<ClickUpList> {
  return cuFetch<ClickUpList>(auth, `/space/${spaceId}/list`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateList(
  auth: ClickUpAuth,
  listId: string,
  name: string,
): Promise<ClickUpList> {
  return cuFetch<ClickUpList>(auth, `/list/${listId}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function getTasksInList(
  auth: ClickUpAuth,
  listId: string,
): Promise<ClickUpTask[]> {
  const data = await cuFetch<{ tasks: ClickUpTask[] }>(
    auth,
    `/list/${listId}/task?archived=false&subtasks=true&include_closed=true`,
  );
  return data.tasks ?? [];
}

export type CreateTaskBody = {
  name: string;
  description?: string;
  status?: string;
  start_date?: number;
  due_date?: number;
  parent?: string;
  assignees?: number[];
  markdown_content?: string;
};

export async function createTask(
  auth: ClickUpAuth,
  listId: string,
  body: CreateTaskBody,
): Promise<ClickUpTask> {
  return cuFetch<ClickUpTask>(auth, `/list/${listId}/task`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateTask(
  auth: ClickUpAuth,
  taskId: string,
  body: Partial<CreateTaskBody> & { name?: string },
): Promise<ClickUpTask> {
  return cuFetch<ClickUpTask>(auth, `/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function createTaskComment(
  auth: ClickUpAuth,
  taskId: string,
  commentText: string,
): Promise<{ id: string }> {
  return cuFetch<{ id: string }>(auth, `/task/${taskId}/comment`, {
    method: "POST",
    body: JSON.stringify({ comment_text: commentText }),
  });
}

export async function getTeamMembers(
  auth: ClickUpAuth,
  teamId: string,
): Promise<{ id: number; email?: string; username?: string }[]> {
  const data = await cuFetch<{
    team?: {
      members?: {
        user: { id: number; email?: string; username?: string };
      }[];
    };
  }>(auth, `/team/${teamId}`);
  return (data.team?.members ?? []).map((m) => m.user);
}

/** Date key YYYY-MM-DD → ClickUp ms epoch (UTC noon to reduce TZ shifts). */
export function dateKeyToClickUpMs(
  dateKey: string | null | undefined,
): number | undefined {
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return undefined;
  return Date.parse(`${dateKey}T12:00:00.000Z`);
}

export function clickUpMsToDateKey(
  ms: string | number | null | undefined,
): string | null {
  if (ms == null || ms === "") return null;
  const n = typeof ms === "string" ? Number(ms) : ms;
  if (!Number.isFinite(n)) return null;
  return new Date(n).toISOString().slice(0, 10);
}
