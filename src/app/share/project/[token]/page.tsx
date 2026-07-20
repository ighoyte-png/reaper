"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ExternalLink, Mail } from "lucide-react";
import { PersonAvatar } from "@/components/people/person-avatar";
import { ProgressBar } from "@/components/projects/progress-bar";
import { createDemoSeed, DEMO_STORAGE_KEY } from "@/lib/demo/seed";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  sanitizeProjectPortal,
  type ProjectPortalPayload,
} from "@/lib/share/sanitize";
import { ASSET_KIND_LABELS } from "@/lib/domain/assets";
import { AssetKindIcon } from "@/components/projects/asset-kind-icon";
import type { ProjectAssetKind } from "@/lib/types";
import { toDateKey } from "@/lib/domain/dates";
import { cn } from "@/lib/cn";
import type { DemoState } from "@/lib/types";

function loadDemoPortal(token: string): ProjectPortalPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    const seed = createDemoSeed();
    const parsed = raw ? (JSON.parse(raw) as Partial<DemoState>) : {};
    const merged: DemoState = {
      ...seed,
      ...parsed,
      task_lists: parsed.task_lists ?? seed.task_lists,
      tasks: parsed.tasks ?? seed.tasks,
      projects: parsed.projects ?? seed.projects,
      people: parsed.people ?? seed.people,
      milestones: parsed.milestones ?? seed.milestones,
      project_assets: parsed.project_assets ?? seed.project_assets,
      clients: parsed.clients ?? seed.clients,
      assignments: parsed.assignments ?? seed.assignments,
    };
    const project = merged.projects.find(
      (p) => p.share_enabled && p.share_token === token,
    );
    if (!project) return null;
    return sanitizeProjectPortal(merged, project.id);
  } catch {
    return null;
  }
}

function dateProgress(
  startDate: string | null,
  endDate: string | null,
  todayKey: string,
): number | null {
  if (!startDate || !endDate || endDate <= startDate) return null;
  const s = new Date(`${startDate}T12:00:00`).getTime();
  const e = new Date(`${endDate}T12:00:00`).getTime();
  const t = new Date(`${todayKey}T12:00:00`).getTime();
  if (t <= s) return 0;
  if (t >= e) return 100;
  return Math.round(((t - s) / (e - s)) * 100);
}

function taskCompletionPct(
  tasks: { parent_id: string | null; status: string }[],
): number {
  const parents = tasks.filter((t) => !t.parent_id);
  if (parents.length === 0) return 0;
  const done = parents.filter((t) => t.status === "complete").length;
  return Math.round((done / parents.length) * 100);
}

function formatDisplayDate(dateKey: string): string {
  return format(parseISO(dateKey), "MMM d, yyyy");
}

function PortalTaskRow({
  task,
}: {
  task: { title: string; status: string };
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm">
      <span
        className={cn(
          task.status === "complete" &&
            "text-[var(--task-complete-fg)] line-through",
        )}
      >
        {task.title}
      </span>
      <span
        className={cn(
          "shrink-0 text-xs capitalize",
          task.status === "complete"
            ? "text-[var(--task-complete-fg)]"
            : task.status === "active"
              ? "text-[var(--task-active-fg)]"
              : "text-[var(--task-upcoming-fg)]",
        )}
      >
        {task.status}
      </span>
    </div>
  );
}

export default function ProjectSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portal, setPortal] = useState<ProjectPortalPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setReady(false);
      setError(null);
      try {
        if (!isSupabaseConfigured()) {
          const demoPortal = loadDemoPortal(token);
          if (!cancelled) {
            if (demoPortal) setPortal(demoPortal);
            else {
              setPortal(null);
              setError(
                "This client portal link is off, invalid, or only available when the workspace uses Supabase.",
              );
            }
          }
          return;
        }

        const res = await fetch(
          `/api/share/project/${encodeURIComponent(token)}`,
        );
        const body = (await res.json()) as {
          portal?: ProjectPortalPayload;
          error?: string;
        };
        if (!cancelled) {
          if (!res.ok || !body.portal) {
            setPortal(null);
            setError(body.error || "This client portal link is off or invalid.");
          } else {
            setPortal(body.portal);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setPortal(null);
          setError(
            err instanceof Error ? err.message : "Could not load this portal",
          );
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  if (error || !portal) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <p className="text-sm font-medium text-[var(--text)]">
          Link unavailable
        </p>
        <p className="max-w-sm text-sm text-[var(--text-muted)]">
          {error || "This client portal link is off or invalid."}
        </p>
      </div>
    );
  }

  const todayKey = toDateKey(new Date());
  const overallPct =
    dateProgress(portal.project.start_date, portal.project.end_date, todayKey) ??
    0;

  const milestonesSorted = [...portal.milestones].sort(
    (a, b) =>
      a.sort_order - b.sort_order || a.due_date.localeCompare(b.due_date),
  );
  const assetsSorted = [...portal.assets];
  const teamSorted = [...portal.team];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <div>
        <p className="text-xs text-[var(--text-muted)]">
          Client Dashboard - {portal.clientName ?? "Client"}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {portal.project.name}
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">
          {portal.project.status.replace("_", " ")}
        </p>
      </div>

      {teamSorted.length > 0 ? (
        <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Team</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teamSorted.map((member) => (
              <li
                key={member.email || member.name}
                className="flex flex-col items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-center"
              >
                <PersonAvatar
                  avatarUrl={member.avatar_url}
                  name={member.name}
                  size="lg"
                />
                <div className="min-w-0 w-full">
                  <div className="truncate text-base font-semibold tracking-tight">
                    {member.name}
                  </div>
                  {member.title ? (
                    <div className="truncate text-xs text-[var(--text-muted)]">
                      {member.title}
                    </div>
                  ) : null}
                  {member.email ? (
                    <a
                      href={`mailto:${member.email}`}
                      className="mt-1 inline-flex items-center justify-center gap-1 text-xs text-[var(--accent)] hover:underline"
                    >
                      <Mail size={11} />
                      {member.email}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
        <ProgressBar
          pct={overallPct}
          label="Overall Project Progress"
          size="lg"
          footerStart={
            portal.project.start_date
              ? formatDisplayDate(portal.project.start_date)
              : null
          }
          footerEnd={
            portal.project.end_date
              ? formatDisplayDate(portal.project.end_date)
              : null
          }
        />
      </section>

      {milestonesSorted.length > 0 ? (
        <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Milestones</h2>
          <div className="space-y-6">
            {milestonesSorted.map((m) => {
              const listIds = portal.taskLists
                .filter((l) => l.milestone_id === m.id)
                .map((l) => l.id);
              const milestoneTasks = portal.tasks.filter((t) =>
                listIds.includes(t.list_id),
              );
              const pct =
                listIds.length > 0
                  ? taskCompletionPct(milestoneTasks)
                  : dateProgress(
                      portal.project.start_date,
                      m.due_date,
                      todayKey,
                    ) ?? 0;
              return (
                <div key={m.id}>
                  <ProgressBar
                    pct={pct}
                    label={`${m.name} · ${formatDisplayDate(m.due_date)}`}
                    approved={m.client_approved}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {assetsSorted.length > 0 ? (
        <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Links & Assets</h2>
          <ul className="space-y-1.5">
            {assetsSorted.map((a) => {
              const isNote = Boolean(a.body.trim());
              return (
                <li
                  key={a.id}
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
                >
                  {isNote ? (
                    <div className="space-y-1">
                      <span className="block truncate font-medium">
                        {a.label || "Note"}
                      </span>
                      <p className="whitespace-pre-wrap text-[var(--text-muted)]">
                        {a.body}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AssetKindIcon
                        kind={a.kind as ProjectAssetKind}
                      />
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-[var(--accent)] hover:underline"
                      >
                        {a.label ||
                          ASSET_KIND_LABELS[a.kind as ProjectAssetKind]}
                      </a>
                      <ExternalLink
                        size={12}
                        className="shrink-0 text-[var(--text-muted)]"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
        <h2 className="mb-3 text-sm font-semibold">Tasks</h2>
        {portal.taskLists.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No tasks published yet.
          </p>
        ) : (
          <div className="space-y-4">
            {portal.taskLists.map((list) => {
              const listTasks = portal.tasks
                .filter((t) => t.list_id === list.id)
                .sort((a, b) => a.title.localeCompare(b.title));
              const idSet = new Set(listTasks.map((t) => t.id));
              const parents = listTasks.filter(
                (t) => !t.parent_id || !idSet.has(t.parent_id),
              );
              const childrenOf = (parentId: string) =>
                listTasks.filter((t) => t.parent_id === parentId);

              return (
                <div key={list.id}>
                  <h3 className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                    {list.name}
                  </h3>
                  {parents.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">No tasks</p>
                  ) : (
                    <ul className="space-y-1">
                      {parents.map((t) => (
                        <li key={t.id}>
                          <PortalTaskRow task={t} />
                          {childrenOf(t.id).map((child) => (
                            <div key={child.id} className="ml-4 mt-1">
                              <PortalTaskRow task={child} />
                            </div>
                          ))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
