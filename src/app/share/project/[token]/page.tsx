"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ExternalLink, Mail } from "lucide-react";
import { ProgressBar } from "@/components/projects/progress-bar";
import { createDemoSeed, DEMO_STORAGE_KEY } from "@/lib/demo/seed";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  sanitizeProjectPortal,
  type ProjectPortalPayload,
} from "@/lib/share/sanitize";
import { ASSET_KIND_LABELS, assetIconLabel } from "@/lib/domain/assets";
import { toDateKey } from "@/lib/domain/dates";
import { cn } from "@/lib/cn";
import type { DemoState } from "@/lib/types";

function loadDemoPortal(token: string): ProjectPortalPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    const seed = createDemoSeed();
    const parsed = raw ? (JSON.parse(raw) as Partial<DemoState>) : {};
    const merged: DemoState = { ...seed, ...parsed };
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

  const milestonesSorted = [...portal.milestones].sort((a, b) =>
    a.due_date.localeCompare(b.due_date),
  );
  const assetsSorted = [...portal.assets];
  const teamSorted = [...portal.team];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <div>
        <p className="text-xs text-[var(--text-muted)]">
          {portal.clientName ?? "Client portal"} · {portal.organizationName}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {portal.project.name}
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">
          {portal.project.status.replace("_", " ")}
        </p>
      </div>

      {teamSorted.length > 0 ? (
        <section className="rounded-md border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Team</h2>
          <ul className="flex flex-wrap gap-3">
            {teamSorted.map((member) => (
              <li key={member.email || member.name} className="text-sm">
                <span className="font-medium">{member.name}</span>
                {member.email ? (
                  <a
                    href={`mailto:${member.email}`}
                    className="ml-1.5 inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                  >
                    <Mail size={11} />
                    {member.email}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-md border border-[var(--border)] p-4">
        <ProgressBar pct={overallPct} label="Overall progress" size="lg" />
      </section>

      {milestonesSorted.length > 0 ? (
        <section className="rounded-md border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Milestones</h2>
          <div className="space-y-3">
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
                    label={`${m.name} · ${format(parseISO(m.due_date), "MMM d, yyyy")}`}
                    approved={m.client_approved}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {assetsSorted.length > 0 ? (
        <section className="rounded-md border border-[var(--border)] p-4">
          <h2 className="mb-3 text-sm font-semibold">Links & assets</h2>
          <ul className="space-y-1.5">
            {assetsSorted.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm"
              >
                <span className="inline-flex h-6 w-8 shrink-0 items-center justify-center rounded bg-[var(--bg-elevated)] text-[10px] font-semibold text-[var(--text-muted)]">
                  {assetIconLabel(a.kind as keyof typeof ASSET_KIND_LABELS)}
                </span>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-[var(--accent)] hover:underline"
                >
                  {a.label ||
                    ASSET_KIND_LABELS[a.kind as keyof typeof ASSET_KIND_LABELS]}
                </a>
                <ExternalLink
                  size={12}
                  className="shrink-0 text-[var(--text-muted)]"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-md border border-[var(--border)] p-4">
        <h2 className="mb-3 text-sm font-semibold">Tasks</h2>
        {portal.taskLists.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No tasks published yet.
          </p>
        ) : (
          <div className="space-y-4">
            {portal.taskLists.map((list) => {
              const listTasks = portal.tasks.filter(
                (t) => t.list_id === list.id && !t.parent_id,
              );
              if (listTasks.length === 0) return null;
              return (
                <div key={list.id}>
                  <h3 className="mb-1.5 text-xs font-medium text-[var(--text-muted)]">
                    {list.name}
                  </h3>
                  <ul className="space-y-1">
                    {listTasks.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                      >
                        <span
                          className={cn(
                            t.status === "complete" &&
                              "text-[var(--text-muted)] line-through",
                          )}
                        >
                          {t.title}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-xs capitalize",
                            t.status === "complete"
                              ? "text-[var(--status-healthy)]"
                              : t.status === "active"
                                ? "text-[var(--accent)]"
                                : "text-[var(--text-muted)]",
                          )}
                        >
                          {t.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
