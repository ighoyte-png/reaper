/** Field mappers Reaper ↔ ClickUp (Tier 1). */

import type { ClickUpStatusMap } from "@/addons/clickup/types";
import {
  dateKeyToClickUpMs,
  type CreateTaskBody,
} from "@/addons/clickup/client";
import type { Task, TaskStatus } from "@/lib/types";

const HTML_TAG = /<[^>]+>/g;

export function notesToDescription(notes: string | null | undefined): string {
  if (!notes) return "";
  return notes
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(HTML_TAG, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeDescription(text: string): string {
  return notesToDescription(text).replace(/\s+/g, " ").trim().toLowerCase();
}

export function mapReaperStatusToClickUp(
  status: TaskStatus,
  statusMap: ClickUpStatusMap,
): string {
  if (status === "upcoming") return statusMap.upcoming;
  if (status === "active") return statusMap.active;
  return statusMap.complete;
}

export function appendReaperLink(
  description: string,
  reaperUrl: string | null,
): string {
  if (!reaperUrl) return description;
  const footer = `\n\n—\nOpen in Reaper: ${reaperUrl}`;
  if (description.includes(reaperUrl)) return description;
  return `${description}${footer}`.trim();
}

export function taskToClickUpBody(
  task: Pick<
    Task,
    "title" | "status" | "start_date" | "due_date" | "notes" | "parent_id"
  >,
  statusMap: ClickUpStatusMap,
  opts?: {
    parentClickUpId?: string | null;
    reaperUrl?: string | null;
    assigneeClickUpIds?: number[];
  },
): CreateTaskBody {
  const description = appendReaperLink(
    notesToDescription(task.notes),
    opts?.reaperUrl ?? null,
  );
  const body: CreateTaskBody = {
    name: task.title || "Untitled",
    description,
    status: mapReaperStatusToClickUp(task.status, statusMap),
  };
  const start = dateKeyToClickUpMs(task.start_date);
  const due = dateKeyToClickUpMs(task.due_date);
  if (start != null) body.start_date = start;
  if (due != null) body.due_date = due;
  if (opts?.parentClickUpId) body.parent = opts.parentClickUpId;
  if (opts?.assigneeClickUpIds?.length) {
    body.assignees = opts.assigneeClickUpIds;
  }
  return body;
}

export function taskFieldsMatchClickUp(
  task: Pick<Task, "title" | "status" | "start_date" | "due_date" | "notes">,
  cu: {
    name?: string;
    description?: string;
    status?: { status?: string } | string;
    start_date?: string | number | null;
    due_date?: string | number | null;
  },
  statusMap: ClickUpStatusMap,
): boolean {
  const cuStatus =
    typeof cu.status === "string" ? cu.status : (cu.status?.status ?? "");
  if ((task.title || "Untitled") !== (cu.name ?? "")) return false;
  if (
    mapReaperStatusToClickUp(task.status, statusMap).toLowerCase() !==
    cuStatus.toLowerCase()
  ) {
    return false;
  }
  const wantDesc = normalizeDescription(notesToDescription(task.notes));
  const gotDesc = normalizeDescription(cu.description ?? "");
  // Allow Reaper link footer on ClickUp side
  if (wantDesc && !gotDesc.includes(wantDesc) && wantDesc !== gotDesc) {
    return false;
  }
  return true;
}
