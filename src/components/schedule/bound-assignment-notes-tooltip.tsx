"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import {
  assignmentIsOutOfSync,
  parseBoundTasksNotesTitles,
  sortBoundTaskIdsByListOrder,
} from "@/lib/domain/assignment-bound-tasks";
import { useData } from "@/lib/data/store";
import { cn } from "@/lib/cn";
import type { Project } from "@/lib/types";

export function BoundAssignmentNotesTooltip({
  assignmentId,
  notesHtml,
  projectHref,
}: {
  assignmentId: string;
  notesHtml?: string | null;
  projectHref: (
    project: Pick<Project, "client_id" | "slug">,
    search?: string,
  ) => string;
}) {
  const { state, ensureBoundAssignmentTasks, ensureProjectData } = useData();

  const projectId = useMemo(() => {
    const assignment = state.assignments.find((a) => a.id === assignmentId);
    return assignment?.project_id ?? null;
  }, [state.assignments, assignmentId]);

  // Hover must not wait for the sidebar: load org binds + this project's
  // bundle so task ids are available for links.
  useEffect(() => {
    void ensureBoundAssignmentTasks();
    if (projectId) void ensureProjectData(projectId);
  }, [assignmentId, projectId, ensureBoundAssignmentTasks, ensureProjectData]);

  const { heading, rows, project } = useMemo(() => {
    const assignment = state.assignments.find((a) => a.id === assignmentId);
    const projectRow = assignment
      ? state.projects.find((p) => p.id === assignment.project_id)
      : null;
    const binds = state.assignment_bound_tasks
      .filter((r) => r.assignment_id === assignmentId)
      .sort((a, b) => a.sort_order - b.sort_order);
    const bindIds = binds.map((b) => b.task_id);
    const parsedTitles = parseBoundTasksNotesTitles(
      notesHtml ?? assignment?.notes,
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
    const headingText = oos
      ? "Task Dates out of Sync"
      : "Tasks Bound to Assignment";

    // Binds may still be hydrating on first schedule paint — fall back to
    // titles embedded in the assignment notes so the hover isn't blank.
    if (bindIds.length === 0) {
      const projectTasks = projectRow
        ? state.tasks.filter((t) => t.project_id === projectRow.id)
        : [];
      return {
        heading: headingText,
        rows: parsedTitles.map((title, index) => {
          const task = projectTasks.find((t) => t.title?.trim() === title);
          return {
            taskId: task?.id ?? `notes-fallback:${index}`,
            title,
            linkable: Boolean(task && projectRow),
          };
        }),
        project: projectRow ?? null,
      };
    }

    const allTasksLoaded = bindIds.every((id) =>
      state.tasks.some((t) => t.id === id),
    );
    const orderedIds = allTasksLoaded
      ? sortBoundTaskIdsByListOrder(
          bindIds,
          state.tasks,
          state.task_lists,
        )
      : bindIds;
    return {
      heading: headingText,
      rows: orderedIds.map((taskId, index) => {
        const task = state.tasks.find((t) => t.id === taskId);
        const title =
          task?.title?.trim() ||
          parsedTitles[index]?.trim() ||
          parsedTitles.find((_, i) => bindIds[i] === taskId)?.trim() ||
          "Task";
        return { taskId, title, linkable: true };
      }),
      project: projectRow ?? null,
    };
  }, [
    assignmentId,
    notesHtml,
    state.assignments,
    state.assignment_bound_tasks,
    state.tasks,
    state.task_lists,
    state.projects,
  ]);

  if (rows.length === 0) return null;

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
        {rows.map(({ taskId, title, linkable }) => {
          if (linkable && project) {
            return (
              <li key={taskId}>
                <Link
                  href={projectHref(project, `task=${taskId}`)}
                  className="text-[var(--accent)] hover:underline"
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
