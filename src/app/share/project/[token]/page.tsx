"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, ExternalLink, Mail } from "lucide-react";
import { PersonAvatar } from "@/components/people/person-avatar";
import {
  MilestoneApprovalCheck,
  ProgressBar,
  milestonePortalGlowClass,
} from "@/components/projects/progress-bar";
import { ProjectManagerTag } from "@/components/projects/project-manager-person";
import { ProjectYearBurnChart } from "@/components/projects/monthly-retainer-chart";
import { Field, Modal, inputClass } from "@/components/ui/form";
import { createDemoSeed, DEMO_STORAGE_KEY } from "@/lib/demo/seed";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  sanitizeProjectPortal,
  type PortalHoursRetainer,
  type ProjectPortalPayload,
} from "@/lib/share/sanitize";
import { approveDemoPortalMilestone } from "@/lib/share/demo-milestone-approve";
import { PortalGanttProvider } from "@/lib/share/portal-gantt-provider";
import { sanitizeExternalUrl } from "@/lib/safe-url";
import {
  assetDisplayTitle,
  assetViewForApprovalTooltip,
  titleCaseWords,
} from "@/lib/domain/assets";
import { calendarYearBars } from "@/lib/domain/budget";
import { parseAssetKind } from "@/lib/domain/milestones";
import { compareTaskOrder } from "@/lib/domain/tasks";
import { AssetKindIcon } from "@/components/projects/asset-kind-icon";
import { ProjectGanttBoard } from "@/components/projects/project-gantt-board";
import {
  ProjectTasksPie,
  projectTasksPieStats,
} from "@/components/projects/project-tasks-pie";
import { TaskStatusTag } from "@/components/tasks/task-status-tag";
import type {
  Assignment,
  Project,
  ProjectAssetKind,
  TaskStatus,
} from "@/lib/types";
import { toDateKey } from "@/lib/domain/dates";
import { cn } from "@/lib/cn";
import type { DemoState } from "@/lib/types";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

function portalChartProject(
  projectId: string,
  budgetHours: number,
): Project {
  return {
    id: projectId,
    organization_id: "portal",
    client_id: null,
    name: "",
    slug: "portal",
    status: "active",
    priority: 0,
    color: "",
    start_date: null,
    end_date: null,
    budget_hours: budgetHours,
    budget_amount: null,
    budget_mode: "hours",
    budget_monthly_reset: true,
    notes: "",
    manager_person_id: null,
    hide_from_public_share: false,
    sandbox_mode: false,
  };
}

function portalChartAssignments(
  projectId: string,
  stubs: PortalHoursRetainer["assignments"],
): Assignment[] {
  return stubs.map((a, i) => ({
    id: `portal-${i}`,
    organization_id: "portal",
    person_id: "portal",
    project_id: projectId,
    start_date: a.start_date,
    end_date: a.end_date,
    hours_per_day: a.hours_per_day,
    allocation_pct: null,
    status: a.status,
    notes: "",
    recurrence: a.recurrence,
    recurrence_end_date: a.recurrence_end_date,
    recurrence_exceptions: a.recurrence_exceptions ?? [],
    created_at: new Date().toISOString(),
    edited_at: null,
    edited_by_profile_id: null,
  }));
}

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

function formatDisplayDate(dateKey: string | null | undefined): string {
  if (!dateKey) return "No date";
  return format(parseISO(dateKey), "MMM d, yyyy");
}

function PortalTaskRow({
  task,
}: {
  task: { title: string; status: string };
}) {
  const status = task.status as TaskStatus;
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
      <span
        className={cn(
          "min-w-0 truncate",
          status === "complete" &&
            "text-[var(--task-complete-fg)] line-through",
        )}
      >
        {task.title}
      </span>
      <TaskStatusTag status={status} className="shrink-0" />
    </div>
  );
}

export default function ProjectSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portal, setPortal] = useState<ProjectPortalPayload | null>(null);
  const [chartYear, setChartYear] = useState(() => new Date().getFullYear());
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveName, setApproveName] = useState("");
  const [approveEmail, setApproveEmail] = useState("");
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [credentialsOk, setCredentialsOk] = useState(false);
  const [celebrateId, setCelebrateId] = useState<string | null>(null);

  const portalTabTitle = portal
    ? portal.clientName
      ? `${portal.clientName} · ${portal.project.name}`
      : portal.project.name
    : "Client portal";
  useDocumentTitle(portalTabTitle);

  const yearBars =
    portal?.hoursRetainer != null
      ? calendarYearBars(
          portalChartProject(
            portal.project.id,
            portal.hoursRetainer.budgetHours,
          ),
          portalChartAssignments(
            portal.project.id,
            portal.hoursRetainer.assignments,
          ),
          [],
          chartYear,
          new Date(),
        )
      : [];

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

  useEffect(() => {
    if (!approvingId) return;
    const name = approveName;
    const email = approveEmail;
    if (!name.trim() || !email.trim()) {
      setCredentialsOk(false);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        if (!isSupabaseConfigured()) {
          const result = approveDemoPortalMilestone(
            token,
            approvingId,
            name,
            email,
            { verifyOnly: true },
          );
          setCredentialsOk(Boolean(result.ok && result.match !== false));
          return;
        }
        try {
          const res = await fetch(
            `/api/share/project/${encodeURIComponent(token)}/milestones/${encodeURIComponent(approvingId)}/approve`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, email, verifyOnly: true }),
            },
          );
          const body = (await res.json()) as { match?: boolean };
          setCredentialsOk(Boolean(body.match));
        } catch {
          setCredentialsOk(false);
        }
      })();
    }, 350);
    return () => window.clearTimeout(handle);
  }, [approvingId, approveName, approveEmail, token]);

  function openApprove(milestoneId: string) {
    setApprovingId(milestoneId);
    setApproveName("");
    setApproveEmail("");
    setApproveError(null);
    setCredentialsOk(false);
  }

  function closeApprove() {
    setApprovingId(null);
    setApproveName("");
    setApproveEmail("");
    setApproveError(null);
    setCredentialsOk(false);
    setApproveBusy(false);
  }

  async function confirmApprove() {
    if (!approvingId || !credentialsOk) return;
    setApproveBusy(true);
    setApproveError(null);
    try {
      if (!isSupabaseConfigured()) {
        const result = approveDemoPortalMilestone(
          token,
          approvingId,
          approveName,
          approveEmail,
        );
        if (!result.ok) {
          setApproveError(result.error);
          return;
        }
        setPortal((prev) =>
          prev
            ? {
                ...prev,
                milestones: prev.milestones.map((m) =>
                  m.id === result.milestone.id
                    ? {
                        ...m,
                        client_approved: true,
                        approved_by_client: true,
                        approved_by_name: result.milestone.approved_by_name,
                        approved_at: result.milestone.approved_at,
                      }
                    : m,
                ),
              }
            : prev,
        );
        setCelebrateId(approvingId);
        closeApprove();
        window.setTimeout(() => setCelebrateId(null), 1200);
        return;
      }

      const res = await fetch(
        `/api/share/project/${encodeURIComponent(token)}/milestones/${encodeURIComponent(approvingId)}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: approveName,
            email: approveEmail,
          }),
        },
      );
      const body = (await res.json()) as {
        milestone?: {
          id: string;
          approved_by_name: string | null;
          approved_at: string | null;
        };
        error?: string;
      };
      if (!res.ok || !body.milestone) {
        setApproveError(body.error || "Unable to approve milestone");
        return;
      }
      const approvedId = approvingId;
      setPortal((prev) =>
        prev
          ? {
              ...prev,
              milestones: prev.milestones.map((m) =>
                m.id === body.milestone!.id
                  ? {
                      ...m,
                      client_approved: true,
                      approved_by_client: true,
                      approved_by_name: body.milestone!.approved_by_name,
                      approved_at: body.milestone!.approved_at,
                    }
                  : m,
              ),
            }
          : prev,
      );
      setCelebrateId(approvedId);
      closeApprove();
      window.setTimeout(() => setCelebrateId(null), 1200);
    } catch (err) {
      setApproveError(
        err instanceof Error ? err.message : "Unable to approve milestone",
      );
    } finally {
      setApproveBusy(false);
    }
  }

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
      a.sort_order - b.sort_order ||
      (a.due_date ?? "").localeCompare(b.due_date ?? ""),
  );
  const assetsSorted = [...portal.assets].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const teamSorted = [...portal.team];
  const manager = portal.showProjectManagers ? portal.manager : null;
  const teamWithoutManager = manager
    ? teamSorted.filter((m) => m.name !== manager.name)
    : teamSorted;
  const showTeamSection = Boolean(manager) || teamSorted.length > 0;
  const hasGantt = portal.taskLists.some((l) => l.gantt_enabled);
  const pieTasks = portal.tasks.map((t) => ({
    status: t.status as TaskStatus,
    due_date: t.due_date ?? null,
    is_divider: false as const,
  }));
  const showTasksPie = pieTasks.length >= 20;
  const tasksPieStats = projectTasksPieStats(pieTasks, todayKey);

  const milestonesSection =
    milestonesSorted.length > 0 ? (
      <section className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
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
            const readyForApproval = m.approval_enabled && !m.client_approved;
            const byline =
              m.approved_by_client && m.approved_by_name
                ? `Approved by ${m.approved_by_name}${
                    m.approved_at
                      ? ` on ${formatDisplayDate(m.approved_at.slice(0, 10))}`
                      : ""
                  }`
                : null;
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-md p-2",
                  readyForApproval &&
                    cn("cursor-pointer", milestonePortalGlowClass),
                )}
                onClick={readyForApproval ? () => openApprove(m.id) : undefined}
                onKeyDown={
                  readyForApproval
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openApprove(m.id);
                        }
                      }
                    : undefined
                }
                role={readyForApproval ? "button" : undefined}
                tabIndex={readyForApproval ? 0 : undefined}
                title={readyForApproval ? "Click for Approval" : undefined}
                aria-label={
                  readyForApproval
                    ? `Approve milestone ${m.name}`
                    : undefined
                }
              >
                <ProgressBar
                  pct={pct}
                  label={`${m.name} · ${formatDisplayDate(m.due_date)}`}
                  approved={m.client_approved}
                  readyForApproval={readyForApproval}
                  footerStart={byline}
                  celebrate={celebrateId === m.id}
                  essential={{
                    kind: parseAssetKind(m.essential_kind),
                    label: m.essential_label,
                    url: m.essential_url,
                  }}
                  essentialGlowHover={Boolean(
                    parseAssetKind(m.essential_kind) && m.essential_url.trim(),
                  )}
                  essentialApprovalTooltip
                />
              </div>
            );
          })}
        </div>
      </section>
    ) : null;

  const essentialsSection =
    assetsSorted.length > 0 ? (
      <section className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
        <h2 className="mb-3 text-sm font-semibold">Links & Essentials</h2>
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
                      {titleCaseWords(a.label.trim() || "Note")}
                    </span>
                    <p className="whitespace-pre-wrap text-[var(--text-muted)]">
                      {a.body}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AssetKindIcon
                      kind={a.kind as ProjectAssetKind}
                      label={a.label}
                      title={assetViewForApprovalTooltip(
                        a.label,
                        a.kind as ProjectAssetKind,
                      )}
                    />
                    {sanitizeExternalUrl(a.url) ? (
                      <a
                        href={sanitizeExternalUrl(a.url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-[var(--accent)] hover:underline"
                      >
                        {assetDisplayTitle(a.label, a.kind as ProjectAssetKind)}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">
                        {assetDisplayTitle(a.label, a.kind as ProjectAssetKind)}
                      </span>
                    )}
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
    ) : null;

  const tasksSection = (
    <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
      <h2 className="mb-3 text-sm font-semibold">Tasks</h2>
      {portal.taskLists.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No tasks published yet.
        </p>
      ) : (
        <div className="space-y-3">
          {portal.taskLists.map((list) => {
            const listTasks = portal.tasks
              .filter((t) => t.list_id === list.id)
              .sort(compareTaskOrder);
            const idSet = new Set(listTasks.map((t) => t.id));
            const parents = listTasks
              .filter((t) => !t.parent_id || !idSet.has(t.parent_id))
              .sort(compareTaskOrder);
            const childrenOf = (parentId: string) =>
              listTasks
                .filter((t) => t.parent_id === parentId)
                .sort(compareTaskOrder);

            return (
              <div
                key={list.id}
                className="overflow-hidden rounded-md border border-[var(--divider)]"
              >
                <div className="border-b border-[var(--divider)] bg-[var(--bg-elevated)]/50 px-2 py-2.5">
                  <h3 className="text-lg font-medium">{list.name}</h3>
                </div>
                {parents.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-[var(--text-muted)]">
                    No tasks in this list yet.
                  </p>
                ) : (
                  <ul className="py-1">
                    {parents.map((t) => (
                      <li key={t.id}>
                        <PortalTaskRow task={t} />
                        {childrenOf(t.id).map((child) => (
                          <div key={child.id} className="ml-4">
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
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-8">
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

      {showTeamSection ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Team</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {manager ? (
              <li className="flex flex-col items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-center">
                <PersonAvatar
                  avatarUrl={manager.avatar_url}
                  name={manager.name}
                  size="lg"
                />
                <div className="min-w-0 w-full">
                  <div className="truncate text-base font-semibold tracking-tight">
                    {manager.name}
                  </div>
                  <div className="mt-1 flex justify-center">
                    <ProjectManagerTag />
                  </div>
                  {manager.title ? (
                    <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                      {manager.title}
                    </div>
                  ) : null}
                  {manager.email ? (
                    <a
                      href={`mailto:${manager.email}`}
                      className="mt-1 inline-flex items-center justify-center gap-1 text-xs text-[var(--accent)] hover:underline"
                    >
                      <Mail size={11} />
                      {manager.email}
                    </a>
                  ) : null}
                </div>
              </li>
            ) : null}
            {teamWithoutManager.map((member) => (
              <li
                key={member.name}
                className="flex flex-col items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg)] p-3 text-center"
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

      {portal.hoursRetainer ? (
        <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{chartYear} Calendar</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--row-hover)]"
                onClick={() => setChartYear((y) => y - 1)}
                aria-label="Previous year"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] hover:bg-[var(--row-hover)]"
                onClick={() => setChartYear((y) => y + 1)}
                aria-label="Next year"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <ProjectYearBurnChart
            bars={yearBars}
            unit="hours"
            monthlyCap={portal.hoursRetainer.budgetHours}
            year={chartYear}
          />
        </section>
      ) : null}

      {hasGantt ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
            {milestonesSection ?? <div aria-hidden />}
            {essentialsSection ?? <div aria-hidden />}
          </div>
          <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
            <PortalGanttProvider portal={portal}>
              <ProjectGanttBoard
                projectId={portal.project.id}
                readOnly
                showAssignees={false}
                showDrawer={false}
              />
            </PortalGanttProvider>
          </section>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          {tasksSection}
          <div className="space-y-4">
            {milestonesSection}
            {essentialsSection}
            {showTasksPie ? (
              <section className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4">
                <h2 className="mb-3 text-sm font-semibold">Project Tasks</h2>
                <ProjectTasksPie stats={tasksPieStats} />
              </section>
            ) : null}
          </div>
        </div>
      )}

      {approvingId ? (
        <Modal title="Approve Milestone" onClose={closeApprove}>
          <div className="grid gap-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={approveName}
                onChange={(e) => {
                  setApproveName(e.target.value);
                  setCredentialsOk(false);
                }}
                placeholder="Your name"
                autoComplete="name"
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                value={approveEmail}
                onChange={(e) => {
                  setApproveEmail(e.target.value);
                  setCredentialsOk(false);
                }}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
            {approveError ? (
              <p className="text-sm text-[var(--status-over)]">{approveError}</p>
            ) : null}
            {credentialsOk ? (
              <div className="flex flex-col items-center gap-2 pt-2">
                <p className="text-sm font-medium">Approve Milestone</p>
                <MilestoneApprovalCheck
                  interactive
                  pending
                  glowHover
                  onClick={() => {
                    if (!approveBusy) void confirmApprove();
                  }}
                />
                <p className="text-center text-sm text-[var(--text-muted)]">
                  This is Your Moment of Glory!
                </p>
              </div>
            ) : approveName.trim() && approveEmail.trim() ? (
              <p className="text-sm text-[var(--text-muted)]">
                Enter the name and email provided by your project manager to
                unlock approval.
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
