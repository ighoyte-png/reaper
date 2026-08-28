"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  assignmentIsOutOfSync,
  sortBoundTaskIdsByListOrder,
} from "@/lib/domain/assignment-bound-tasks";
import { useData } from "@/lib/data/store";
import { cn } from "@/lib/cn";
import type { Project } from "@/lib/types";

export function BoundAssignmentNotesTooltip({
  assignmentId,
  projectHref,
}: {
  assignmentId: string;
  projectHref: (
    project: Pick<Project, "client_id" | "slug">,
    search?: string,
  ) => string;
}) {
  const { state } = useData();

  const { heading, taskIds, project } = useMemo(() => {
    const assignment = state.assignments.find((a) => a.id === assignmentId);
    const projectRow = assignment
      ? state.projects.find((p) => p.id === assignment.project_id)
      : null;
    const ids = state.assignment_bound_tasks
      .filter((r) => r.assignment_id === assignmentId)
      .map((r) => r.task_id);
    const ordered = sortBoundTaskIdsByListOrder(
      ids,
      state.tasks,
      state.task_lists,
    );
    const oos = assignment
      ? assignmentIsOutOfSync(
          state.assignment_bound_tasks,
          state.tasks,
          state.task_lists,
          state.assignments,
          assignmentId,
        )
      : false;
    return {
      heading: oos
        ? "Task Dates out of Sync"
        : "Tasks Bound to Assignment",
      taskIds: ordered,
      project: projectRow ?? null,
    };
  }, [
    assignmentId,
    state.assignments,
    state.assignment_bound_tasks,
    state.tasks,
    state.task_lists,
    state.projects,
  ]);

  if (taskIds.length === 0) return null;

  return (
    <div
      className={cn(
        "rich-notes block leading-relaxed",
        "[&_p]:m-0 [&_p+p]:mt-2",
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_li]:my-1",
        "[&_p+ul]:mt-3",
      )}
    >
      <p>
        <strong>{heading}</strong>
      </p>
      <ul>
        {taskIds.map((taskId) => {
          const task = state.tasks.find((t) => t.id === taskId);
          const title = task?.title?.trim() || "Task";
          if (project && task) {
            return (
              <li key={taskId}>
                <Link
                  href={projectHref(project, `task=${taskId}`)}
                  className="hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {title}
                </Link>
              </li>
            );
          }
          return <li key={taskId}>{title}</li>;
        })}
      </ul>
    </div>
  );
}
