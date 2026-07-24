"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarOff,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ReportBreadcrumb } from "@/components/nav/breadcrumbs";
import { ProjectManagerPerson } from "@/components/projects/project-manager-person";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { useData } from "@/lib/data/store";
import { useProjectHref } from "@/lib/hooks/use-app-href";
import { toDateKey } from "@/lib/domain/dates";
import { showProjectManagerUi } from "@/lib/domain/project-access";
import { dueDateToneClass, taskStatusLabel } from "@/lib/domain/tasks";
import { projectDisplayColor, sortClientsByName } from "@/lib/domain/sorting";
import { cn } from "@/lib/cn";
import type { Client, Person, Project, Task } from "@/lib/types";

type ProjectFilter = "all" | string;
type ManagerFilter = "all" | string;
type SortKey =
  | "title"
  | "project"
  | "client"
  | "assignee"
  | "start"
  | "end"
  | "status";
type SortDir = "asc" | "desc";

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
                <td className="px-3 py-2.5 font-medium">
                  {project ? (
                    <Link
                      href={projectHref(project, `task=${task.id}`)}
                      className="text-[var(--text)] hover:text-[var(--accent)] hover:underline"
                    >
                      {task.title}
                    </Link>
                  ) : (
                    task.title
                  )}
                </td>
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

function AllProjectsNavButton({
  active,
  onClick,
  count,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        active
          ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
          : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
      )}
    >
      <ProjectColorBar color="var(--border)" size="sm" />
      <span className="min-w-0 flex-1 truncate">All projects</span>
      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
        {count}
      </span>
    </button>
  );
}

function ClientAccordionRow({
  expanded,
  onToggle,
  label,
  count,
  color,
}: {
  expanded: boolean;
  onToggle: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        expanded
          ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
          : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
      )}
    >
      {color ? (
        <ProjectColorBar color={color} size="sm" />
      ) : (
        <ProjectColorBar color="var(--border)" size="sm" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
        {count}
      </span>
      {expanded ? (
        <ChevronDown size={14} className="shrink-0 text-[var(--text-muted)]" />
      ) : (
        <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />
      )}
    </button>
  );
}

function ProjectNavButton({
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
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md py-2 pl-7 pr-2.5 text-left text-sm transition-colors",
        active
          ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
          : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
      )}
    >
      {color ? (
        <ProjectColorBar color={color} size="sm" />
      ) : (
        <ProjectColorBar color="var(--border)" size="sm" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
        {count}
      </span>
    </button>
  );
}

function MobileProjectChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs",
        active
          ? "border-[var(--text)] bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
          : "border-[var(--border)] text-[var(--text-muted)]",
      )}
    >
      {color ? <ProjectColorBar color={color} size="sm" /> : null}
      {label}
    </button>
  );
}

export default function TasksReportPage() {
  const { state, mode, ensureOrgHeavyData } = useData();
  const projectHref = useProjectHref();
  const todayKey = toDateKey(new Date());
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("all");
  const [managerFilter, setManagerFilter] = useState<ManagerFilter>("all");
  const [expandedClientIds, setExpandedClientIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (mode === "supabase") void ensureOrgHeavyData();
  }, [mode, ensureOrgHeavyData]);

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

  const projectTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of state.tasks) {
      counts.set(task.project_id, (counts.get(task.project_id) ?? 0) + 1);
    }
    return counts;
  }, [state.tasks]);

  const projectsWithTasks = useMemo(() => {
    return state.projects
      .filter((p) => (projectTaskCounts.get(p.id) ?? 0) > 0)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [state.projects, projectTaskCounts]);

  const sidebarGroups = useMemo(() => {
    const byClient = new Map<string | "none", Project[]>();
    for (const project of projectsWithTasks) {
      const key = project.client_id ?? "none";
      const list = byClient.get(key) ?? [];
      list.push(project);
      byClient.set(key, list);
    }
    const groups: {
      key: string;
      label: string;
      color?: string;
      count: number;
      projects: Project[];
    }[] = [];

    for (const client of clients) {
      const projects = byClient.get(client.id);
      if (!projects?.length) continue;
      groups.push({
        key: client.id,
        label: client.name,
        color: client.color,
        count: projects.reduce(
          (sum, p) => sum + (projectTaskCounts.get(p.id) ?? 0),
          0,
        ),
        projects,
      });
    }

    const uncategorized = byClient.get("none");
    if (uncategorized?.length) {
      groups.push({
        key: "none",
        label: "No client",
        count: uncategorized.reduce(
          (sum, p) => sum + (projectTaskCounts.get(p.id) ?? 0),
          0,
        ),
        projects: uncategorized,
      });
    }

    return groups;
  }, [clients, projectsWithTasks, projectTaskCounts]);

  // Keep the selected project's client expanded.
  useEffect(() => {
    if (projectFilter === "all") return;
    const project = projectById.get(projectFilter);
    if (!project) return;
    const key = project.client_id ?? "none";
    setExpandedClientIds((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, [projectFilter, projectById]);

  const managerTabs = useMemo(() => {
    if (!showProjectManagerUi(projectsWithTasks)) return [];
    const ids = new Set<string>();
    for (const p of projectsWithTasks) {
      if (p.manager_person_id) ids.add(p.manager_person_id);
    }
    return state.people
      .filter((person) => ids.has(person.id))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [projectsWithTasks, state.people]);

  const showManagers = managerTabs.length >= 2;

  useEffect(() => {
    if (managerFilter === "all") return;
    if (!managerTabs.some((person) => person.id === managerFilter)) {
      setManagerFilter("all");
    }
  }, [managerFilter, managerTabs]);

  function toggleClientExpanded(key: string) {
    setExpandedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const scopedTasks = useMemo(() => {
    return state.tasks.filter((task) => {
      const project = projectById.get(task.project_id);
      if (!project) return false;
      if (projectFilter !== "all" && task.project_id !== projectFilter) {
        return false;
      }
      if (
        managerFilter !== "all" &&
        project.manager_person_id !== managerFilter
      ) {
        return false;
      }
      return true;
    });
  }, [state.tasks, projectById, projectFilter, managerFilter]);

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
            <AllProjectsNavButton
              active={projectFilter === "all"}
              onClick={() => setProjectFilter("all")}
              count={state.tasks.length}
            />
            {sidebarGroups.map((group) => {
              const expanded = expandedClientIds.has(group.key);
              return (
                <div key={group.key}>
                  <ClientAccordionRow
                    expanded={expanded}
                    onToggle={() => toggleClientExpanded(group.key)}
                    label={group.label}
                    count={group.count}
                    color={group.color}
                  />
                  {expanded
                    ? group.projects.map((project) => (
                        <ProjectNavButton
                          key={project.id}
                          active={projectFilter === project.id}
                          onClick={() => setProjectFilter(project.id)}
                          label={project.name}
                          count={projectTaskCounts.get(project.id) ?? 0}
                          color={projectDisplayColor(project, state.clients)}
                        />
                      ))
                    : null}
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 space-y-6 p-3 sm:p-5">
          <div className="mb-1 flex gap-1 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden">
            <MobileProjectChip
              active={projectFilter === "all"}
              onClick={() => setProjectFilter("all")}
              label="All projects"
            />
            {projectsWithTasks.map((project) => (
              <MobileProjectChip
                key={project.id}
                active={projectFilter === project.id}
                onClick={() => setProjectFilter(project.id)}
                label={project.name}
                color={projectDisplayColor(project, state.clients)}
              />
            ))}
          </div>

          {showManagers ? (
            <section
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4"
              aria-label="Project managers"
            >
              <h2 className="mb-3 text-sm font-semibold">Project Manager</h2>
              <ul className="flex flex-wrap gap-x-4 gap-y-2">
                {managerTabs.map((person) => {
                  const selected = managerFilter === person.id;
                  return (
                    <li key={person.id}>
                      <div
                        className={cn(
                          "flex items-center gap-1 rounded-md border px-1.5 py-1 transition-colors",
                          selected
                            ? "border-[var(--text)] bg-[var(--bg-elevated)]"
                            : "border-transparent hover:bg-[var(--row-hover)]",
                        )}
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          onClick={() => setManagerFilter(person.id)}
                          className="min-w-0 cursor-pointer text-left"
                        >
                          <ProjectManagerPerson person={person} />
                        </button>
                        {selected ? (
                          <button
                            type="button"
                            className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
                            aria-label={`Clear ${person.name} filter`}
                            onClick={() => setManagerFilter("all")}
                          >
                            <X size={14} strokeWidth={2} />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

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
