import type { Task, TaskList } from "@/lib/types";

/**
 * Reassign a list (and its tasks) to another project in the same org.
 * Target active lists shift down so the moved list sits at sort_order 0.
 * Milestone links are cleared because milestones are per-project.
 */
export function applyMoveTaskList(args: {
  lists: TaskList[];
  tasks: Task[];
  listId: string;
  targetProjectId: string;
}): { lists: TaskList[]; tasks: Task[] } | null {
  const source = args.lists.find((l) => l.id === args.listId);
  if (!source) return null;
  if (source.project_id === args.targetProjectId) return null;

  const lists = args.lists.map((list) => {
    if (list.id === source.id) {
      return {
        ...list,
        project_id: args.targetProjectId,
        milestone_id: null,
        sort_order: 0,
      };
    }
    if (list.project_id === args.targetProjectId && !list.archived) {
      return { ...list, sort_order: list.sort_order + 1 };
    }
    return list;
  });

  const tasks = args.tasks.map((task) =>
    task.list_id === source.id
      ? { ...task, project_id: args.targetProjectId }
      : task,
  );

  return { lists, tasks };
}
