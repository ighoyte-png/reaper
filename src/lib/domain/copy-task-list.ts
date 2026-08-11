import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { toDateKey } from "@/lib/domain/dates";
import { emptyTaskAuditFields, orderTasksParentsFirst } from "@/lib/domain/tasks";
import type { Task, TaskList } from "@/lib/types";

/** Shift a yyyy-MM-dd key by calendar days; null stays null. */
export function shiftDateKey(
  date: string | null | undefined,
  days: number,
): string | null {
  if (!date) return null;
  if (days === 0) return date;
  return toDateKey(addDays(parseISO(date), days));
}

/**
 * Offer the align-after-end dialog when the source Gantt list has both list
 * dates and at least one task date to slide.
 */
export function canOfferAlignAfterSource(
  list: Pick<TaskList, "gantt_enabled" | "start_date" | "end_date">,
  tasks: Pick<Task, "start_date" | "due_date">[],
): boolean {
  if (!list.gantt_enabled) return false;
  if (!list.start_date || !list.end_date) return false;
  return tasks.some((t) => Boolean(t.start_date || t.due_date));
}

/** Calendar-day delta so the copy starts the day after the source list ends. */
export function alignAfterSourceShiftDays(
  list: Pick<TaskList, "start_date" | "end_date">,
): number {
  if (!list.start_date || !list.end_date) return 0;
  const newStart = addDays(parseISO(list.end_date), 1);
  return differenceInCalendarDays(newStart, parseISO(list.start_date));
}

export function buildCopiedTaskList(input: {
  sourceList: TaskList;
  sourceTasks: Task[];
  newListId: string;
  idForTask: (sourceTaskId: string) => string;
  organizationId: string;
  /** When true, slide list + task dates so the copy starts after source end. */
  alignAfterSource: boolean;
}): { list: TaskList; tasks: Task[] } {
  const {
    sourceList,
    sourceTasks,
    newListId,
    idForTask,
    organizationId,
    alignAfterSource,
  } = input;

  const listTasks = sourceTasks.filter((t) => t.list_id === sourceList.id);
  const shiftDays =
    alignAfterSource &&
    sourceList.start_date &&
    sourceList.end_date
      ? alignAfterSourceShiftDays(sourceList)
      : 0;

  const list: TaskList = {
    id: newListId,
    organization_id: organizationId,
    project_id: sourceList.project_id,
    milestone_id: sourceList.milestone_id,
    name: `Copy of - ${sourceList.name}`,
    color: sourceList.color,
    sort_order: sourceList.sort_order + 1,
    archived: false,
    hide_from_client: sourceList.hide_from_client,
    gantt_enabled: false,
    start_date: shiftDateKey(sourceList.start_date, shiftDays),
    end_date: shiftDateKey(sourceList.end_date, shiftDays),
  };

  const idMap = new Map<string, string>();
  for (const t of listTasks) {
    idMap.set(t.id, idForTask(t.id));
  }

  const audit = emptyTaskAuditFields();
  const remapped: Task[] = listTasks.map((t) => ({
    id: idMap.get(t.id)!,
    organization_id: organizationId,
    project_id: t.project_id,
    list_id: newListId,
    parent_id: t.parent_id ? (idMap.get(t.parent_id) ?? null) : null,
    assignee_person_id: t.assignee_person_id,
    title: t.title,
    is_divider: t.is_divider,
    is_client_review: t.is_client_review,
    status: "upcoming",
    start_date: shiftDateKey(t.start_date, shiftDays),
    due_date: shiftDateKey(t.due_date, shiftDays),
    notes: t.notes,
    sort_order: t.sort_order,
    ...audit,
  }));

  return {
    list,
    tasks: orderTasksParentsFirst(remapped),
  };
}
