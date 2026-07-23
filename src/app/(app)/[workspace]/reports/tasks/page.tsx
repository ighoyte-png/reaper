"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CalendarOff, CheckCircle2 } from "lucide-react";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { ReportBreadcrumb } from "@/components/nav/breadcrumbs";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { toDateKey } from "@/lib/domain/dates";
import { dueDateToneClass } from "@/lib/domain/tasks";
import { cn } from "@/lib/cn";
import type { Client, Project, Task } from "@/lib/types";

function TaskTable({
  tasks,
  projectById,
  clientById,
  projectHref,
  emptyLabel,
  showDue,
  todayKey,
}: {
  tasks: Task[];
  projectById: Map<string, Project>;
  clientById: Map<string, Client>;
  projectHref: (project: Project, search?: string) => string;
  emptyLabel: string;
  showDue: boolean;
  todayKey: string;
}) {
  if (tasks.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">{emptyLabel}</p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg)]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Task</th>
            <th className="px-3 py-2 font-medium">Project</th>
            <th className="px-3 py-2 font-medium">Client</th>
            {showDue ? (
              <th className="px-3 py-2 font-medium">Due</th>
            ) : null}
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const project = projectById.get(task.project_id);
            const client = project?.client_id
              ? clientById.get(project.client_id)
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
                {showDue ? (
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
                ) : null}
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
                    {task.status}
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

export default function TasksReportPage() {
  const { state } = useData();
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const todayKey = toDateKey(new Date());

  const projectById = useMemo(
    () => new Map(state.projects.map((p) => [p.id, p])),
    [state.projects],
  );
  const clientById = useMemo(
    () => new Map(state.clients.map((c) => [c.id, c])),
    [state.clients],
  );

  const overdueTasks = useMemo(
    () =>
      state.tasks
        .filter(
          (t) =>
            t.status !== "complete" && t.due_date && t.due_date < todayKey,
        )
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")),
    [state.tasks, todayKey],
  );

  const noDueDateTasks = useMemo(
    () =>
      state.tasks
        .filter((t) => t.status !== "complete" && !t.due_date)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [state.tasks],
  );

  const recentlyCompleted = useMemo(
    () =>
      state.tasks
        .filter((t) => t.status === "complete")
        .sort((a, b) => (b.due_date ?? "").localeCompare(a.due_date ?? ""))
        .slice(0, 20),
    [state.tasks],
  );

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader title={<ReportBreadcrumb current="Tasks" />} />
      <div className="space-y-6 p-3 sm:p-5">
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
            projectHref={projectHref}
            emptyLabel="Nothing overdue — nice work."
            showDue
            todayKey={todayKey}
          />
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <CalendarOff size={14} className="text-[var(--text-muted)]" />
            <h2 className="text-sm font-semibold">
              No Due Date
              {noDueDateTasks.length > 0 ? ` (${noDueDateTasks.length})` : ""}
            </h2>
          </div>
          <TaskTable
            tasks={noDueDateTasks}
            projectById={projectById}
            clientById={clientById}
            projectHref={projectHref}
            emptyLabel="Every open task has a due date."
            showDue={false}
            todayKey={todayKey}
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
            projectHref={projectHref}
            emptyLabel="No completed tasks yet."
            showDue
            todayKey={todayKey}
          />
        </section>
      </div>
    </PageContainer>
  );
}
