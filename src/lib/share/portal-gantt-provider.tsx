"use client";

import { useMemo, type ReactNode } from "react";
import { createDemoSeed } from "@/lib/demo/seed";
import { DataContext, type DataContextValue } from "@/lib/data/store";
import type { ProjectPortalPayload } from "@/lib/share/sanitize";
import type {
  DemoState,
  HolidayCalendarDay,
  Milestone,
  Person,
  Profile,
  ProjectMember,
  Task,
  TaskList,
} from "@/lib/types";

function noopAsync(): Promise<void> {
  return Promise.resolve();
}

function portalViewerProfile(orgId: string): Profile {
  return {
    id: "portal-viewer",
    organization_id: orgId,
    email: "",
    full_name: "Client",
    role: "member",
  };
}

const PORTAL_HOLIDAY_PERSON_ID = "portal-holiday-person";
const PORTAL_HOLIDAY_CALENDAR_ID = "portal-holidays";

/** Minimal read-only workspace slice for portal Gantt rendering. */
export function portalPayloadToDemoState(
  portal: ProjectPortalPayload,
): DemoState {
  const seed = createDemoSeed();
  const orgId = "portal";
  const projectId = portal.project.id;

  const taskLists: TaskList[] = portal.taskLists.map((l) => ({
    id: l.id,
    organization_id: orgId,
    project_id: projectId,
    milestone_id: l.milestone_id,
    name: l.name,
    color: null,
    sort_order: l.sort_order,
    archived: false,
    hide_from_client: false,
    gantt_enabled: Boolean(l.gantt_enabled),
    start_date: l.start_date ?? null,
    end_date: l.end_date ?? null,
  }));

  const tasks: Task[] = portal.tasks.map((t) => ({
    id: t.id,
    organization_id: orgId,
    project_id: projectId,
    list_id: t.list_id,
    parent_id: t.parent_id,
    assignee_person_id: null,
    title: t.title,
    is_divider: false,
    is_client_review: Boolean(t.is_client_review),
    status: t.status as Task["status"],
    start_date: t.start_date ?? null,
    due_date: t.due_date ?? null,
    notes: "",
    sort_order: t.sort_order,
    created_at: new Date().toISOString(),
    created_by_profile_id: null,
    edited_at: null,
    edited_by_profile_id: null,
    status_changed_at: null,
    status_changed_by_profile_id: null,
  }));

  const milestones: Milestone[] = portal.milestones.map((m) => ({
    id: m.id,
    organization_id: orgId,
    project_id: projectId,
    name: m.name,
    start_date: null,
    due_date: m.due_date,
    status: m.status as Milestone["status"],
    client_approved: m.client_approved,
    sort_order: m.sort_order,
    approval_enabled: m.approval_enabled,
    approval_name: "",
    approval_email: "",
    essential_kind: null,
    essential_label: m.essential_label,
    essential_url: m.essential_url,
    approved_by_name: m.approved_by_name,
    approved_at: m.approved_at,
    approved_by_client: m.approved_by_client,
  }));

  const holidayDays = portal.holidayCalendarDays ?? [];
  const holiday_calendar_days: HolidayCalendarDay[] = holidayDays.map((d) => ({
    id: d.id,
    organization_id: orgId,
    calendar_id: PORTAL_HOLIDAY_CALENDAR_ID,
    date: d.date,
    name: d.name,
  }));

  /** Stub person so Gantt holidayByDate resolves calendar days for the project. */
  const people: Person[] =
    holiday_calendar_days.length > 0
      ? [
          {
            id: PORTAL_HOLIDAY_PERSON_ID,
            organization_id: orgId,
            profile_id: null,
            name: "",
            email: "",
            role_title: "",
            department: "",
            office: "",
            capacity_hours_week: 0,
            cost_rate: 0,
            bill_rate: 0,
            timezone: "UTC",
            holiday_calendar_id: PORTAL_HOLIDAY_CALENDAR_ID,
            avatar_url: null,
            avatar_attachment_id: null,
            hide_from_schedule: true,
            hide_from_utilization: true,
            is_contractor: false,
            avatar_color: null,
            deleted_at: null,
          },
        ]
      : [];
  const project_members: ProjectMember[] =
    people.length > 0
      ? [
          {
            project_id: projectId,
            person_id: PORTAL_HOLIDAY_PERSON_ID,
            organization_id: orgId,
            contractor_mode: null,
            contractor_fixed_fee: null,
            contractor_hours: null,
          },
        ]
      : [];

  return {
    ...seed,
    organization: {
      id: orgId,
      name: portal.organizationName,
      slug: "portal",
      share_enabled: false,
    },
    memberships: [],
    sessionProfileId: null,
    profiles: [],
    people,
    clients: [],
    projects: [
      {
        id: projectId,
        organization_id: orgId,
        client_id: null,
        name: portal.project.name,
        slug: "portal",
        status: portal.project.status as DemoState["projects"][0]["status"],
        priority: 0,
        color: "",
        start_date: portal.project.start_date,
        end_date: portal.project.end_date,
        budget_hours: null,
        budget_amount: null,
        budget_mode: "none",
        budget_monthly_reset: false,
        notes: "",
        manager_person_id: null,
        hide_from_public_share: false,
        sandbox_mode: false,
      },
    ],
    milestones,
    task_lists: taskLists,
    tasks,
    project_assets: [],
    assignments: [],
    project_members,
    task_comments: [],
    leave_days: [],
    holiday_calendars:
      holiday_calendar_days.length > 0
        ? [
            {
              id: PORTAL_HOLIDAY_CALENDAR_ID,
              organization_id: orgId,
              name: "Holidays",
              region: "",
            },
          ]
        : [],
    holiday_calendar_days,
    pods: [],
    pod_members: [],
    project_templates: [],
    template_milestones: [],
    template_task_lists: [],
    template_tasks: [],
    bulletins: [],
    unread_bulletin_ids: [],
    dismissed_bulletin_ids: [],
    unread_mentions: [],
    unread_task_threads: [],
    project_favorites: [],
  };
}

function buildPortalGanttContext(
  portal: ProjectPortalPayload,
): DataContextValue {
  const state = portalPayloadToDemoState(portal);
  const profile = portalViewerProfile(state.organization.id);

  return {
    ready: true,
    mode: "demo",
    state: { ...state, sessionProfileId: profile.id, profiles: [profile] },
    profile,
    myPerson: null,
    canManage: false,
    isAuthenticated: true,
    isPlatformOnly: false,
    isPublicShare: true,
    shareBasePath: null,
    authError: null,
    loginDemo: () => {},
    login: async () => {},
    signup: async () => ({ needsConfirmation: false }),
    createAdditionalWorkspace: async () => ({ slug: "", organizationId: "" }),
    updatePassword: noopAsync,
    changePassword: noopAsync,
    requestPasswordReset: noopAsync,
    logout: noopAsync,
    resetDemo: noopAsync,
    refresh: noopAsync,
    inviteDemoMember: () => ({ profileId: "" }),
    switchDemoProfile: () => {},
    updateDemoShare: () => ({ enabled: false, token: null, url: null }),
    upsertClient: () => {},
    deleteClient: () => {},
    updateOrganizationName: async () => {},
    updateOrganizationSlug: async () => {},
    updateProfileRole: async () => {},
    switchWorkspace: async () => {},
    upsertProject: async () => state.projects[0]!,
    setProjectMembers: async () => {},
    upsertProjectContractorExpense: async () => {},
    deleteProjectContractorExpense: async () => {},
    clearProjectSandboxTrackedData: async () => ({
      start_date: null,
      end_date: null,
      budget_hours: null,
      budget_amount: null,
      budget_mode: "none" as const,
      budget_monthly_reset: false as const,
      manager_person_id: null,
    }),
    deleteProject: () => {},
    upsertPerson: async () => {},
    updatePersonAvatar: async () => {},
    deletePerson: async () => {},
    upsertPod: async () => {},
    deletePod: async () => {},
    setPodMembers: async () => {},
    setPersonPods: async () => {},
    upsertAssignment: () => {},
    deleteAssignment: () => {},
    upsertMilestone: () => {},
    deleteMilestone: () => {},
    upsertLeave: () => {},
    setLeaveBlock: () => ({ rows: [], asgUpserts: [], asgDeletes: [] }),
    deleteLeave: () => {},
    applyLeaveUndo: () => {},
    upsertHolidayCalendar: () => {},
    deleteHolidayCalendar: () => {},
    upsertHolidayCalendarDay: () => {},
    deleteHolidayCalendarDay: () => {},
    applyHolidayCalendar: async () => 0,
    upsertProjectAsset: () => {},
    deleteProjectAsset: () => {},
    upsertTaskList: () => {},
    deleteTaskList: () => {},
    upsertTask: () => {},
    deleteTask: () => {},
    upsertTaskComment: () => {},
    deleteTaskComment: () => {},
    toggleTaskCommentReaction: () => {},
    upsertBulletin: () => {},
    deleteBulletin: () => {},
    dismissBulletin: () => {},
    dismissBulletinFromBoard: () => {},
    dismissMention: () => {},
    markMentionRead: () => {},
    dismissTaskThreadUnread: () => {},
    toggleProjectFavorite: () => {},
    reorderProjectFavorites: () => {},
    upsertProjectTemplate: () => {},
    deleteProjectTemplate: () => {},
    upsertTemplateMilestone: () => {},
    deleteTemplateMilestone: () => {},
    upsertTemplateTaskList: () => {},
    deleteTemplateTaskList: () => {},
    upsertTemplateTask: () => {},
    deleteTemplateTask: () => {},
    applyProjectTemplate: async () => {},
    exportProjectAsTemplate: async () => {},
    updateProjectShare: () => ({ enabled: false, token: null, url: null }),
    newId: (prefix) => `${prefix}-portal`,
    dataStatus: {
      orgTasks: "ready",
      orgMilestones: "ready",
      mentionComments: "ready",
      projects: { [portal.project.id]: "ready" },
      scheduleRange: null,
    },
    ensureOrgTasks: async () => {},
    ensureOrgMilestones: async () => {},
    ensureMentionComments: async () => ({
      tasks: [],
      task_comments: [],
    }),
    ensureProjectData: async () => {},
    ensureScheduleRange: async () => {},
    setActiveRealtimeProjectIds: () => {},
    fetchProjectBudgetBurnsRpc: async () => null,
    fetchMonthlyRetainerYearBarsRpc: async () => null,
    fetchPersonUtilizationWeeksRpc: async () => null,
    fetchOrgForecastRpc: async () => null,
    fetchOrgTaskStatsRpc: async () => null,
  };
}

export function PortalGanttProvider({
  portal,
  children,
}: {
  portal: ProjectPortalPayload;
  children: ReactNode;
}) {
  const value = useMemo(
    () => buildPortalGanttContext(portal),
    [portal],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
