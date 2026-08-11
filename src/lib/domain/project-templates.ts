import { differenceInCalendarDays, parseISO } from "date-fns";
import { shiftDateKey } from "@/lib/domain/copy-task-list";
import { emptyTaskAuditFields, orderTasksParentsFirst } from "@/lib/domain/tasks";
import { notesHasContent } from "@/lib/notes-html";
import type {
  Milestone,
  Project,
  ProjectTemplate,
  Task,
  TaskList,
  TemplateMilestone,
  TemplateTask,
  TemplateTaskList,
} from "@/lib/types";

export type TemplateSaveOptions = {
  includeDescriptions: boolean;
  includeDates: boolean;
  includeMilestones: boolean;
  includeAssignees: boolean;
};

export type TemplateApplyOptions = {
  includeDescriptions: boolean;
  includeDates: boolean;
  includeMilestones: boolean;
  includeAssignees: boolean;
  /** Project start date key when dates are applied. */
  projectStartDate: string;
};

export const DEFAULT_TEMPLATE_SAVE_OPTIONS: TemplateSaveOptions = {
  includeDescriptions: true,
  includeDates: true,
  includeMilestones: true,
  includeAssignees: true,
};

export type TemplateCapabilityFlags = {
  hasDescriptions: boolean;
  hasDates: boolean;
  hasMilestones: boolean;
  hasAssignees: boolean;
};

export function templateCapabilityFlags(input: {
  template: ProjectTemplate | undefined;
  milestones: TemplateMilestone[];
  lists: TemplateTaskList[];
  tasks: TemplateTask[];
}): TemplateCapabilityFlags {
  const { template, milestones, lists, tasks } = input;
  const hasDates = Boolean(
    template?.anchor_start_date ||
      lists.some((l) => l.start_date || l.end_date) ||
      tasks.some((t) => t.start_date || t.due_date) ||
      milestones.some((m) => m.start_date || m.due_date),
  );
  return {
    hasDescriptions: tasks.some((t) => notesHasContent(t.notes)),
    hasDates,
    hasMilestones: milestones.length > 0,
    hasAssignees: tasks.some((t) => Boolean(t.assignee_person_id)),
  };
}

/** Calendar-day delta from template anchor to the chosen project start. */
export function templateDateShiftDays(
  anchorStartDate: string | null | undefined,
  projectStartDate: string,
): number {
  if (!anchorStartDate) return 0;
  return differenceInCalendarDays(
    parseISO(projectStartDate),
    parseISO(anchorStartDate),
  );
}

export function resolveTemplateAnchorStartDate(input: {
  projectStartDate: string | null | undefined;
  lists: Pick<TaskList, "start_date" | "end_date">[];
  tasks: Pick<Task, "start_date" | "due_date">[];
  milestones: Pick<Milestone, "start_date" | "due_date">[];
}): string | null {
  if (input.projectStartDate) return input.projectStartDate;
  const keys: string[] = [];
  for (const l of input.lists) {
    if (l.start_date) keys.push(l.start_date);
    if (l.end_date) keys.push(l.end_date);
  }
  for (const t of input.tasks) {
    if (t.start_date) keys.push(t.start_date);
    if (t.due_date) keys.push(t.due_date);
  }
  for (const m of input.milestones) {
    if (m.start_date) keys.push(m.start_date);
    if (m.due_date) keys.push(m.due_date);
  }
  if (keys.length === 0) return null;
  keys.sort();
  return keys[0] ?? null;
}

export function buildExportedTemplate(input: {
  organizationId: string;
  templateId: string;
  name: string;
  project: Project;
  milestones: Milestone[];
  lists: TaskList[];
  tasks: Task[];
  options: TemplateSaveOptions;
  idFor: (prefix: string) => string;
}): {
  template: ProjectTemplate;
  milestones: TemplateMilestone[];
  lists: TemplateTaskList[];
  tasks: TemplateTask[];
} {
  const {
    organizationId,
    templateId,
    name,
    project,
    milestones,
    lists,
    tasks,
    options,
    idFor,
  } = input;

  const includeMs = options.includeMilestones;
  const includeDates = options.includeDates;
  const sourceMilestones = includeMs ? milestones : [];

  const anchor_start_date = includeDates
    ? resolveTemplateAnchorStartDate({
        projectStartDate: project.start_date,
        lists,
        tasks,
        milestones: sourceMilestones,
      })
    : null;

  const template: ProjectTemplate = {
    id: templateId,
    organization_id: organizationId,
    name,
    description: "",
    anchor_start_date,
  };

  const milestoneIdMap = new Map<string, string>();
  const newMilestones: TemplateMilestone[] = sourceMilestones.map((m, idx) => {
    const id = idFor("tms");
    milestoneIdMap.set(m.id, id);
    return {
      id,
      organization_id: organizationId,
      template_id: templateId,
      name: m.name,
      offset_days: 0,
      sort_order: m.sort_order ?? idx,
      start_date: includeDates ? m.start_date : null,
      due_date: includeDates ? m.due_date : null,
    };
  });

  const listIdMap = new Map<string, string>();
  const newLists: TemplateTaskList[] = lists.map((l) => {
    const id = idFor("tlist");
    listIdMap.set(l.id, id);
    return {
      id,
      organization_id: organizationId,
      template_id: templateId,
      template_milestone_id:
        includeMs && l.milestone_id
          ? (milestoneIdMap.get(l.milestone_id) ?? null)
          : null,
      name: l.name,
      sort_order: l.sort_order,
      gantt_enabled: l.gantt_enabled,
      start_date: includeDates ? l.start_date : null,
      end_date: includeDates ? l.end_date : null,
    };
  });

  const taskIdMap = new Map<string, string>();
  for (const t of tasks) taskIdMap.set(t.id, idFor("ttask"));
  const newTasks: TemplateTask[] = orderTasksParentsFirst(
    tasks.map((t) => ({
      id: taskIdMap.get(t.id)!,
      organization_id: organizationId,
      template_id: templateId,
      list_id: listIdMap.get(t.list_id) ?? "",
      parent_id: t.parent_id ? (taskIdMap.get(t.parent_id) ?? null) : null,
      title: t.title,
      notes: options.includeDescriptions ? t.notes : "",
      offset_days: null,
      sort_order: t.sort_order,
      start_date: includeDates ? t.start_date : null,
      due_date: includeDates ? t.due_date : null,
      assignee_person_id: options.includeAssignees
        ? t.assignee_person_id
        : null,
      is_client_review: t.is_client_review,
      is_divider: t.is_divider,
    })),
  );

  return {
    template,
    milestones: newMilestones,
    lists: newLists,
    tasks: newTasks,
  };
}

export function buildAppliedTemplate(input: {
  organizationId: string;
  projectId: string;
  profileId: string | null;
  template: ProjectTemplate;
  templateMilestones: TemplateMilestone[];
  templateLists: TemplateTaskList[];
  templateTasks: TemplateTask[];
  options: TemplateApplyOptions;
  listSortBase: number;
  milestoneSortBase: number;
  idFor: (prefix: string) => string;
}): {
  milestones: Milestone[];
  lists: TaskList[];
  tasks: Task[];
  projectStartDate: string | null;
  projectEndDeltaDays: number;
} {
  const {
    organizationId,
    projectId,
    profileId,
    template,
    templateMilestones,
    templateLists,
    templateTasks,
    options,
    listSortBase,
    milestoneSortBase,
    idFor,
  } = input;

  const includeMs = options.includeMilestones;
  const includeDates = options.includeDates;
  const shiftDays = includeDates
    ? templateDateShiftDays(template.anchor_start_date, options.projectStartDate)
    : 0;

  const sourceMilestones = includeMs ? templateMilestones : [];
  const milestoneIdMap = new Map<string, string>();
  const milestones: Milestone[] = sourceMilestones.map((m) => {
    const id = idFor("ms");
    milestoneIdMap.set(m.id, id);
    return {
      id,
      organization_id: organizationId,
      project_id: projectId,
      name: m.name,
      start_date: includeDates
        ? shiftDateKey(m.start_date, shiftDays)
        : null,
      due_date: includeDates ? shiftDateKey(m.due_date, shiftDays) : null,
      status: "upcoming",
      client_approved: false,
      sort_order: milestoneSortBase + m.sort_order + 1,
      approval_enabled: false,
      approval_name: "",
      approval_email: "",
      essential_kind: null,
      essential_label: "",
      essential_url: "",
      approved_by_name: null,
      approved_at: null,
      approved_by_client: false,
    };
  });

  const listIdMap = new Map<string, string>();
  const lists: TaskList[] = templateLists.map((l) => {
    const id = idFor("list");
    listIdMap.set(l.id, id);
    return {
      id,
      organization_id: organizationId,
      project_id: projectId,
      milestone_id:
        includeMs && l.template_milestone_id
          ? (milestoneIdMap.get(l.template_milestone_id) ?? null)
          : null,
      name: l.name,
      color: null,
      sort_order: listSortBase + l.sort_order + 1,
      archived: false,
      hide_from_client: false,
      gantt_enabled: false,
      start_date: includeDates
        ? shiftDateKey(l.start_date, shiftDays)
        : null,
      end_date: includeDates ? shiftDateKey(l.end_date, shiftDays) : null,
    };
  });

  const taskIdMap = new Map<string, string>();
  for (const t of templateTasks) taskIdMap.set(t.id, idFor("task"));
  const audit = emptyTaskAuditFields();
  const tasks: Task[] = orderTasksParentsFirst(
    templateTasks.map((t) => ({
      id: taskIdMap.get(t.id)!,
      organization_id: organizationId,
      project_id: projectId,
      list_id: listIdMap.get(t.list_id) ?? "",
      parent_id: t.parent_id ? (taskIdMap.get(t.parent_id) ?? null) : null,
      assignee_person_id: options.includeAssignees
        ? t.assignee_person_id
        : null,
      title: t.title,
      is_divider: t.is_divider,
      is_client_review: t.is_client_review,
      status: "upcoming" as const,
      start_date: includeDates
        ? shiftDateKey(t.start_date, shiftDays)
        : null,
      due_date: includeDates ? shiftDateKey(t.due_date, shiftDays) : null,
      notes: options.includeDescriptions ? t.notes : "",
      sort_order: t.sort_order,
      ...audit,
      created_by_profile_id: profileId,
    })),
  );

  return {
    milestones,
    lists,
    tasks,
    projectStartDate: includeDates ? options.projectStartDate : null,
    projectEndDeltaDays: includeDates ? shiftDays : 0,
  };
}

export function maxSortOrder(items: { sort_order: number }[]): number {
  if (items.length === 0) return -1;
  return Math.max(...items.map((i) => i.sort_order));
}

/** Distinct non-null assignee ids from applied/template tasks. */
export function uniqueAssigneePersonIds(
  tasks: { assignee_person_id?: string | null }[],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const t of tasks) {
    const id = t.assignee_person_id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
