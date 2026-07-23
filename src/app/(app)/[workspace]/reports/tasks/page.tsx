"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarOff,
  CheckCircle2,
} from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ReportBreadcrumb } from "@/components/nav/breadcrumbs";
import { Select } from "@/components/ui/select";
import { useData } from "@/lib/data/store";
import { useProjectHref } from "@/lib/hooks/use-app-href";
import { toDateKey } from "@/lib/domain/dates";
import { dueDateToneClass, taskStatusLabel } from "@/lib/domain/tasks";
import { sortClientsByName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { Client, Person, Project, Task } from "@/lib/types";

type ClientFilter = "all" | "none" | string;
type SortKey =
  | "title"
  | "project"
  | "client"
  | "assignee"
  | "start"
  | "end"
  | "status";
type SortDir = "asc" | "desc";

function projectMatchesClient(
  project: Project | undefined,
  clientFilter: ClientFilter,
): boolean {
  if (!project) return clientFilter === "all";
  if (clientFilter === "all") return true;
  if (clientFilter === "none") return !project.client_id;
  return project.client_id === clientFilter;
}

function compareNullableDates(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function sortTasks(
  tasks: Task[],
  sortKey: SortKey,
  sortDir: SortDir,
  projectById: Map<string, Project>,
  clientById: Map<string, Client>,
  peopleById: Map<string, Person>,
): Task[] {
  const dir = sortDir === "asc" ? 1 : -1;
  return [...tasks].sort((a, b) => {
    const projectA = projectById.get(a.project_id);
    const projectB = projectById.get(b.project_id);
    const clientA = projectA?.client_id
      ? clientById.get(projectA.client_id)
      : undefined;
    const clientB = projectB?.client_id
      ? clientById.get(projectB.client_id)
      : undefined;
    const assigneeA = a.assignee_person_id
      ? peopleById.get(a.assignee_person_id)
      : undefined;
    const assigneeB = b.assignee_person_id
      ? peopleById.get(b.assignee_person_id)
      : undefined;

    let cmp = 0;
    switch (sortKey) {
      case "title":
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
        break;
      case "project":
        cmp = (projectA?.name ?? "").localeCompare(projectB?.name ?? "", undefined, {
          sensitivity: "base",
        });
        break;
      case "client":
        cmp = (clientA?.name ?? "").localeCompare(clientB?.name ?? "", undefined, {
          sensitivity: "base",
        });
        break;
      case "assignee":
        cmp = (assigneeA?.name ?? "").localeCompare(
          assigneeB?.name ?? "",
          undefined,
          { sensitivity: "base" },
        );
        break;
      case "start":
        cmp = compareNullableDates(a.start_date, b.start_date);
        break;
      case "end":
        cmp = compareNullableDates(a.due_date, b.due_date);
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
    }
    if (cmp !== 0) return cmp * dir;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

function SortableTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 hover:text-[var(--text)]",
          active ? "text-[var(--text)]" : "text-[var(--text-muted)]",
        )}
        onClick={() => onSort(column)}
      >
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp size={12} aria-hidden />
          ) : (
            <ArrowDown size={12} aria-hidden />
          )
        ) : (
          <ArrowUpDown size={12} className="opacity-40" aria-hidden />
        )}
      </button>
    </th>
  );
}

function TaskTable({
  tasks,
  projectById,
  clientById,
  peopleById,
  projectHref,
  emptyLabel,
  todayKey,
  defaultSortKey,
}: {
  tasks: Task[];
  projectById: Map<string, Project>;
  clientById: Map<string, Client>;
  peopleById: Map<string, Person>;
  projectHref: (project: Project, search?: string) => string;
  emptyLabel: string;
  todayKey: string;
  defaultSortKey: SortKey;
}) {
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function onSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  const sorted = useMemo(
    () =>
      sortTasks(tasks, sortKey, sortDir, projectById, clientById, peopleById),
    [tasks, sortKey, sortDir, projectById, clientById, peopleById],
  );

  if (tasks.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg)]">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
          <tr>
            <SortableTh
              label="Task"
              column="title"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              label="Project"
              column="project"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              label="Client"
              column="client"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              label="Assignee"
              column="assignee"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              label="Start"
              column="start"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              label="End"
              column="end"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
            <SortableTh
              label="Status"
              column="status"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
            />
          </tr>
        </thead>
        <tbody>
          {sorted.map((task) => {
            const project = projectById.get(task.project_id);
            const client = project?.client_id
              ? clientById.get(project.client_id)
              : undefined;
            const assignee = task.assignee_person_id
              ? peopleById.get(task.assignee_person_id)
              : undefined;
            return (
              <tr
                key={task.id}
                className="border-t border-[var(--border)] hover:bg-[var(--row-hover)]"
              >
                <td className="px-3 py-2.5 font-medium">{task.title}</td>
                <td className="px-3 py-2.5">
                  {project ? (
                    <Link
                      href={projectHref(project)}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {project.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2.5 text-[var(--text-muted)]">
                  {client?.name ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-[var(--text-muted)]">
                  {assignee?.name ?? "Unassigned"}
                </td>
                <td className="px-3 py-2.5 text-[var(--text-muted)]">
                  {task.start_date ?? "—"}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5",
                    dueDateToneClass(task.due_date, todayKey, {
                      complete: task.status === "complete",
                    }),
                  )}
                >
                  {task.due_date ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide",
                      task.status === "complete"
                        ? "bg-[var(--task-complete-bg)] text-[var(--task-complete-fg)] line-through"
                        : task.status === "active"
                          ? "bg-[var(--task-active-bg)] text-[var(--task-active-fg)]"
                          : "bg-[var(--task-upcoming-bg)] text-[var(--task-upcoming-fg)]",
                    )}
                  >
                    {taskStatusLabel(task.status)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClientNavButton({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
        active
          ? "bg-[var(--row-hover)] font-medium text-[var(--text)]"
          : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
      )}
    >
      {color ? (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      ) : (
        <span className="h-2 w-2 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-xs text-[var(--text-muted)]">{count}</span>
    </button>
  );
}

function MobileClientChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs",
        active
          ? "border-[var(--text)] bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)]",
      )}
    >
      {color ? (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      ) : null}
      {label}
    </button>
  );
}

export default function TasksReportPage() {
  const { state } = useData();
  const projectHref = useProjectHref();
  const todayKey = toDateKey(new Date());
  const [clientFilter, setClientFilter] = useState<ClientFilter>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const projectById = useMemo(
    () => new Map(state.projects.map((p) => [p.id, p])),
    [state.projects],
  );
  const clientById = useMemo(
    () => new Map(state.clients.map((c) => [c.id, c])),
    [state.clients],
  );
  const peopleById = useMemo(
    () => new Map(state.people.map((p) => [p.id, p])),
    [state.people],
  );
  const clients = useMemo(
    () => sortClientsByName(state.clients),
    [state.clients],
  );

  const clientCounts = useMemo(() => {
    const counts = new Map<string | "none", number>();
    for (const task of state.tasks) {
      const project = projectById.get(task.project_id);
      const key = project?.client_id ?? "none";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [state.tasks, projectById]);

  const sidebarClients = useMemo(
    () => clients.filter((c) => (clientCounts.get(c.id) ?? 0) > 0),
    [clients, clientCounts],
  );

  const projectsForFilter = useMemo(() => {
    return [...state.projects]
      .filter((p) => projectMatchesClient(p, clientFilter))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [state.projects, clientFilter]);

  function selectClient(next: ClientFilter) {
    setClientFilter(next);
    setProjectFilter("all");
  }

  const scopedTasks = useMemo(() => {
    return state.tasks.filter((task) => {
      const project = projectById.get(task.project_id);
      if (!projectMatchesClient(project, clientFilter)) return false;
      if (projectFilter !== "all" && task.project_id !== projectFilter) {
        return false;
      }
      return true;
    });
  }, [state.tasks, projectById, clientFilter, projectFilter]);

  const overdueTasks = useMemo(
    () =>
      scopedTasks.filter(
        (t) => t.status !== "complete" && t.due_date && t.due_date < todayKey,
      ),
    [scopedTasks, todayKey],
  );

  const noDueDateTasks = useMemo(
    () => scopedTasks.filter((t) => t.status !== "complete" && !t.due_date),
    [scopedTasks],
  );

  const recentlyCompleted = useMemo(
    () =>
      scopedTasks
        .filter((t) => t.status === "complete")
        .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""))
        .slice(0, 40),
    [scopedTasks],
  );

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title={<ReportBreadcrumb current="Tasks" />} />
      <div className="flex flex-col md:flex-row">
        <aside className="sticky top-3 mt-3 ml-3 hidden max-h-[calc(100dvh-5.5rem)] w-64 shrink-0 flex-col self-start overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] sm:top-5 sm:mt-5 sm:ml-5 md:flex">
          <div className="shrink-0 border-b border-[var(--border)] px-3 py-2">
            <p className="text-xs font-medium text-[var(--text-muted)]">
              Clients
            </p>
          </div>
          <nav className="space-y-0.5 p-2" aria-label="Clients">
            <ClientNavButton
              active={clientFilter === "all"}
              onClick={() => selectClient("all")}
              label="All clients"
              count={state.tasks.length}
            />
            {sidebarClients.map((client) => (
              <ClientNavButton
                key={client.id}
                active={clientFilter === client.id}
                onClick={() => selectClient(client.id)}
                label={client.name}
                count={clientCounts.get(client.id) ?? 0}
                color={client.color}
              />
            ))}
            {(clientCounts.get("none") ?? 0) > 0 ? (
              <ClientNavButton
                active={clientFilter === "none"}
                onClick={() => selectClient("none")}
                label="No client"
                count={clientCounts.get("none") ?? 0}
              />
            ) : null}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 space-y-6 p-3 sm:p-5">
          <div className="mb-1 flex gap-1 overflow-x-auto md:hidden">
            <MobileClientChip
              active={clientFilter === "all"}
              onClick={() => selectClient("all")}
              label="All"
            />
            {sidebarClients.map((c) => (
              <MobileClientChip
                key={c.id}
                active={clientFilter === c.id}
                onClick={() => selectClient(c.id)}
                label={c.name}
                color={c.color}
              />
            ))}
            {(clientCounts.get("none") ?? 0) > 0 ? (
              <MobileClientChip
                active={clientFilter === "none"}
                onClick={() => selectClient("none")}
                label="No Client"
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[12rem] flex-1 text-xs text-[var(--text-muted)] sm:max-w-xs">
              Project
              <Select
                className="mt-1"
                searchable
                value={projectFilter}
                onChange={setProjectFilter}
                options={[
                  { value: "all", label: "All projects" },
                  ...projectsForFilter.map((p) => ({
                    value: p.id,
                    label: p.name,
                  })),
                ]}
              />
            </label>
          </div>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--status-over)]" />
              <h2 className="text-sm font-semibold">
                Overdue Tasks
                {overdueTasks.length > 0 ? ` (${overdueTasks.length})` : ""}
              </h2>
            </div>
            <TaskTable
              tasks={overdueTasks}
              projectById={projectById}
              clientById={clientById}
              peopleById={peopleById}
              projectHref={projectHref}
              emptyLabel="Nothing overdue — nice work."
              todayKey={todayKey}
              defaultSortKey="end"
            />
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <CalendarOff size={14} className="text-[var(--text-muted)]" />
              <h2 className="text-sm font-semibold">
                No Due Date
                {noDueDateTasks.length > 0
                  ? ` (${noDueDateTasks.length})`
                  : ""}
              </h2>
            </div>
            <TaskTable
              tasks={noDueDateTasks}
              projectById={projectById}
              clientById={clientById}
              peopleById={peopleById}
              projectHref={projectHref}
              emptyLabel="Every open task has a due date."
              todayKey={todayKey}
              defaultSortKey="title"
            />
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2
                size={14}
                className="text-[var(--status-healthy)]"
              />
              <h2 className="text-sm font-semibold">Recently Completed</h2>
            </div>
            <TaskTable
              tasks={recentlyCompleted}
              projectById={projectById}
              clientById={clientById}
              peopleById={peopleById}
              projectHref={projectHref}
              emptyLabel="No completed tasks yet."
              todayKey={todayKey}
              defaultSortKey="end"
            />
          </section>
        </div>
      </div>
    </PageContainer>
  );
}
