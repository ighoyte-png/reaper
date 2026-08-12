"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDemoSeed,
  DEMO_SESSION_KEY,
  DEMO_STORAGE_KEY,
  ORG_ID,
} from "@/lib/demo/seed";
import {
  applyRealtimeTableEvent,
  isTrueLocalEcho,
  realtimeEchoId,
} from "@/lib/data/realtime-patch";
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { assignmentOverlapsDateRange } from "@/lib/domain/recurrence";
import { toDateKey } from "@/lib/domain/dates";
import { canEditProject } from "@/lib/domain/project-access";
import {
  assigneeSubmittedTaskForReview,
  buildTaskInReviewBulletin,
  emptyTaskAuditFields,
  isTaskInReviewTransition,
  orderTasksParentsFirst,
  taskAssignerPersonId,
  taskThreadMentionNotifyPersonIds,
  taskThreadNotifyPersonIds,
} from "@/lib/domain/tasks";
import { extractMentionPersonIds } from "@/lib/mentions";
import {
  dispatchTaskNoteMention,
  type TaskNoteMentionBroadcast,
} from "@/lib/desktop-notifications";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  bulletinUnreadRecipientProfileIds,
  clearLegacyDismissedBulletinIds,
  clearLegacyDismissedMentionIds,
  readLegacyDismissedMentionIds,
} from "@/lib/domain/bulletins";
import {
  applyProjectTemplateRows,
  bootstrapOrganization,
  deleteAssignmentRow,
  deleteBulletinRow,
  deleteClientRow,
  deleteHolidayCalendarDayRow,
  deleteHolidayCalendarRow,
  deleteLeaveRow,
  deleteMilestoneRow,
  deleteProjectAssetRow,
  deleteProjectFavoriteRow,
  deleteProjectRow,
  deleteProjectTemplateRow,
  deleteTaskCommentRow,
  deleteTaskListRow,
  deleteTaskRow,
  deleteTemplateMilestoneRow,
  deleteTemplateTaskListRow,
  deleteTemplateTaskRow,
  ensureProfileForUser,
  fetchWorkspace,
  loadAssignmentsForRange,
  loadLeaveForRange,
  loadMentionComments,
  loadOrgTasks,
  loadOrgMilestones,
  loadOrgBootstrap,
  loadProjectData,
  fetchMemberships,
  mapAssignment,
  createAdditionalOrganization,
  rpcOrgForecast,
  rpcOrgTaskStats,
  rpcPersonUtilizationWeeks,
  rpcProjectBudgetBurns,
  rpcMonthlyRetainerYearBars,
  seedDemoWorkspace,
  upsertAssignmentRow,
  upsertBulletinRow,
  deleteBulletinUnreadRow,
  upsertBulletinDismissalRow,
  deleteMentionUnreadRow,
  deleteMentionUnreadRows,
  markMentionReadRow,
  deleteTaskThreadUnreadRow,
  seedBulletinUnreadRows,
  upsertClientRow,
  upsertHolidayCalendarDayRow,
  upsertHolidayCalendarRow,
  upsertLeaveRow,
  upsertMilestoneRow,
  upsertPersonRow,
  updatePersonAvatarRow,
  updateOrganizationNameRow,
  updateOrganizationSlugRow,
  updateProfileRoleRow,
  switchOrganizationRpc,
  upsertPodRow,
  deletePodRow,
  setPodMembersRows,
  upsertProjectAssetRow,
  upsertProjectFavoriteRow,
  upsertProjectRow,
  clearProjectSandboxTrackedDataRows,
  reorderProjectFavoriteRows,
  setProjectMembersRows,
  upsertProjectTemplateRow,
  upsertTaskCommentRow,
  toggleTaskCommentReactionRow,
  upsertTaskListRow,
  upsertTaskRow,
  upsertTemplateMilestoneRow,
  upsertTemplateTaskListRow,
  upsertTemplateTaskRow,
} from "@/lib/supabase/api";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { usePathname, useRouter } from "next/navigation";
import { canManage, isAdmin, personForProfile } from "@/lib/auth/roles";
import { workspacePathAfterSwitch } from "@/lib/domain/workspace-memberships";
import { clearViewAsStorage } from "@/lib/view-as-storage";
import { applyFullDayLeaveOverride, applyFullDayLeaveOverrideForDates } from "@/lib/domain/leave-override";
import { isAlwaysFullDayKind, isFullDayLeave, normalizeLeaveKind } from "@/lib/domain/leave";
import { personAvatarColor } from "@/lib/domain/people";
import { workingDaysBetween } from "@/lib/domain/dates";
import {
  buildAppliedTemplate,
  buildExportedTemplate,
  maxSortOrder,
  uniqueAssigneePersonIds,
  type TemplateApplyOptions,
  type TemplateSaveOptions,
} from "@/lib/domain/project-templates";
import { shiftDateKey } from "@/lib/domain/copy-task-list";
import { uniqueSlug } from "@/lib/slug";
import { sanitizeExternalUrl } from "@/lib/safe-url";
import {
  generateShareToken,
  clientSiteOrigin,
  publicProjectShareUrl,
  publicShareUrl,
} from "@/lib/share/token";
import type {
  Assignment,
  Bulletin,
  Client,
  DemoState,
  HolidayCalendar,
  HolidayCalendarDay,
  LeaveDay,
  LeaveKind,
  Milestone,
  Person,
  Profile,
  Pod,
  PodMember,
  Project,
  ProjectAsset,
  ProjectFavorite,
  ProjectMember,
  ProjectTemplate,
  Role,
  Task,
  TaskComment,
  TaskList,
  TemplateMilestone,
  TemplateTask,
  TemplateTaskList,
} from "@/lib/types";

function uid(prefix: string): string {
  if (isSupabaseConfigured() && typeof crypto !== "undefined") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function stampAssignmentEdit(
  assignment: Assignment,
  actorId: string | null,
): Assignment {
  return {
    ...assignment,
    edited_at: new Date().toISOString(),
    edited_by_profile_id: actorId,
  };
}

function loadDemoState(): DemoState {
  if (typeof window === "undefined") return createDemoSeed();
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return createDemoSeed();
    const parsed = JSON.parse(raw) as DemoState;
    const session = localStorage.getItem(DEMO_SESSION_KEY);
    const seed = createDemoSeed();
    return {
      ...seed,
      ...parsed,
      holiday_calendars: parsed.holiday_calendars ?? seed.holiday_calendars,
      holiday_calendar_days:
        parsed.holiday_calendar_days ?? seed.holiday_calendar_days,
      people: (parsed.people ?? []).map((p) => ({
        ...p,
        holiday_calendar_id: p.holiday_calendar_id ?? null,
        avatar_url: p.avatar_url ?? null,
        avatar_attachment_id: p.avatar_attachment_id ?? null,
        hide_from_schedule: Boolean(p.hide_from_schedule),
        hide_from_utilization: Boolean(
          (p as Person).hide_from_utilization ?? p.hide_from_schedule,
        ),
        is_contractor: Boolean((p as Person).is_contractor),
        deleted_at: (p as Person).deleted_at ?? null,
      })),
      leave_days: (parsed.leave_days ?? seed.leave_days).map((l) => ({
        ...l,
        hours_per_day: l.hours_per_day ?? null,
        notes: l.notes ?? "",
      })),
      projects: (parsed.projects ?? seed.projects).map((p) => ({
        ...p,
        slug: p.slug || uniqueSlug(p.name, [], { preferred: p.slug }),
        budget_mode:
          p.budget_mode === "none" ||
          p.budget_mode === "hours" ||
          p.budget_mode === "amount"
            ? p.budget_mode
            : (p.budget_hours ?? 0) > 0
              ? "hours"
              : p.budget_amount != null
                ? "amount"
                : "hours",
        budget_monthly_reset: Boolean(p.budget_monthly_reset),
        budget_hours: p.budget_hours ?? null,
        budget_amount: p.budget_amount ?? null,
        manager_person_id: p.manager_person_id ?? null,
        share_enabled: Boolean(p.share_enabled),
        share_token: p.share_token ?? null,
        hide_from_public_share: Boolean(p.hide_from_public_share),
        sandbox_mode: Boolean(p.sandbox_mode),
      })),
      clients: (parsed.clients ?? seed.clients).map((c) => ({
        ...c,
        slug: c.slug || uniqueSlug(c.name, [], { preferred: c.slug }),
        color: c.color ?? "#64748B",
        status: c.status ?? "active",
        hide_from_public_share: Boolean(c.hide_from_public_share),
        contact_first_name: c.contact_first_name ?? "",
        contact_last_name: c.contact_last_name ?? "",
        contact_email: c.contact_email ?? "",
        contact_phone: c.contact_phone ?? "",
        company_website: c.company_website ?? "",
      })),
      milestones: (parsed.milestones ?? seed.milestones).map((m, idx) => ({
        ...m,
        start_date: m.start_date ?? null,
        due_date: m.due_date ?? null,
        client_approved: Boolean(m.client_approved),
        sort_order:
          typeof m.sort_order === "number" ? m.sort_order : idx,
        approval_enabled: Boolean(m.approval_enabled),
        approval_name: m.approval_name ?? "",
        approval_email: m.approval_email ?? "",
        essential_kind: m.essential_kind ?? null,
        essential_label: m.essential_label ?? "",
        essential_url: m.essential_url ?? "",
        approved_by_name: m.approved_by_name ?? null,
        approved_at: m.approved_at ?? null,
        approved_by_client: Boolean(m.approved_by_client),
      })),
      organization: {
        ...seed.organization,
        ...parsed.organization,
        slug:
          parsed.organization?.slug ||
          seed.organization.slug ||
          uniqueSlug(parsed.organization?.name || seed.organization.name, []),
        disabled_at: parsed.organization?.disabled_at ?? null,
        share_enabled: Boolean(parsed.organization?.share_enabled),
        share_token: parsed.organization?.share_token ?? null,
      },
      project_assets: (parsed.project_assets ?? seed.project_assets).map((a) => ({
        ...a,
        hide_from_client: Boolean(a.hide_from_client),
      })),
      project_members: Array.isArray(parsed.project_members)
        ? parsed.project_members.map((m) => ({
            project_id: m.project_id,
            person_id: m.person_id,
            organization_id: m.organization_id,
            contractor_mode:
              m.contractor_mode === "fixed_fee" ||
              m.contractor_mode === "hours" ||
              m.contractor_mode === "scheduled"
                ? m.contractor_mode
                : null,
            contractor_fixed_fee: m.contractor_fixed_fee ?? null,
            contractor_hours: m.contractor_hours ?? null,
          }))
        : seed.project_members,
      task_lists: (parsed.task_lists ?? seed.task_lists).map((l) => ({
        ...l,
        color: l.color ?? null,
        archived: Boolean(l.archived),
        hide_from_client: Boolean(l.hide_from_client),
        gantt_enabled: Boolean(l.gantt_enabled),
        start_date: l.start_date ?? null,
        end_date: l.end_date ?? null,
      })),
      tasks: (parsed.tasks ?? seed.tasks).map((t) => ({
        ...t,
        is_divider: Boolean(t.is_divider),
        is_client_review: Boolean(
          (t as Task).is_client_review,
        ),
      })),
      task_comments: (parsed.task_comments ?? seed.task_comments).map((c) => ({
        ...c,
        updated_at:
          typeof c.updated_at === "string" ? c.updated_at : null,
        mentioned_person_ids: Array.isArray(c.mentioned_person_ids)
          ? c.mentioned_person_ids
          : [],
        reactions: Array.isArray(c.reactions) ? c.reactions : [],
      })),
      bulletins: (parsed.bulletins ?? seed.bulletins).map((b) => ({
        ...b,
        task_id: b.task_id ?? null,
        milestone_id: b.milestone_id ?? null,
        audience: b.audience === "people" ? "people" : "all",
        audience_person_ids: Array.isArray(b.audience_person_ids)
          ? b.audience_person_ids
          : [],
        audience_pod_ids: Array.isArray(b.audience_pod_ids)
          ? b.audience_pod_ids
          : [],
        tone: b.tone === "success" ? "success" : "default",
      })),
      unread_bulletin_ids: Array.isArray(parsed.unread_bulletin_ids)
        ? parsed.unread_bulletin_ids.filter(
            (id): id is string => typeof id === "string",
          )
        : (seed.unread_bulletin_ids ?? []),
      dismissed_bulletin_ids: Array.isArray(parsed.dismissed_bulletin_ids)
        ? parsed.dismissed_bulletin_ids.filter(
            (id): id is string => typeof id === "string",
          )
        : (seed.dismissed_bulletin_ids ?? []),
      unread_mentions: Array.isArray(parsed.unread_mentions)
        ? parsed.unread_mentions
            .filter(
              (r): r is {
                comment_id: string;
                person_id: string;
                read_at?: string | null;
              } =>
                Boolean(r) &&
                typeof r === "object" &&
                typeof (r as { comment_id?: unknown }).comment_id ===
                  "string" &&
                typeof (r as { person_id?: unknown }).person_id === "string",
            )
            .map((r) => ({
              comment_id: r.comment_id,
              person_id: r.person_id,
              read_at:
                r.read_at != null && typeof r.read_at === "string"
                  ? r.read_at
                  : null,
            }))
        : (seed.unread_mentions ?? []),
      unread_task_threads: Array.isArray(parsed.unread_task_threads)
        ? parsed.unread_task_threads.filter(
            (r): r is { task_id: string; person_id: string } =>
              Boolean(r) &&
              typeof r === "object" &&
              typeof (r as { task_id?: unknown }).task_id === "string" &&
              typeof (r as { person_id?: unknown }).person_id === "string",
          )
        : (seed.unread_task_threads ?? []),
      project_favorites: Array.isArray(parsed.project_favorites)
        ? parsed.project_favorites.filter(
            (f): f is ProjectFavorite =>
              Boolean(f) &&
              typeof f === "object" &&
              typeof (f as ProjectFavorite).id === "string" &&
              typeof (f as ProjectFavorite).project_id === "string" &&
              typeof (f as ProjectFavorite).profile_id === "string",
          )
        : (seed.project_favorites ?? []),
      pods: Array.isArray(parsed.pods)
        ? (parsed.pods as Pod[])
        : (seed.pods ?? []),
      pod_members: Array.isArray(parsed.pod_members)
        ? (parsed.pod_members as PodMember[])
        : (seed.pod_members ?? []),
      project_templates: parsed.project_templates ?? seed.project_templates,
      template_milestones:
        parsed.template_milestones ?? seed.template_milestones,
      template_task_lists:
        parsed.template_task_lists ?? seed.template_task_lists,
      template_tasks: parsed.template_tasks ?? seed.template_tasks,
      sessionProfileId: session,
    };
  } catch {
    return createDemoSeed();
  }
}

function emptySupabaseState(): DemoState {
  return {
    organization: { id: "", name: "", slug: "" },
    memberships: [],
    profiles: [],
    clients: [],
    projects: [],
    milestones: [],
    people: [],
    assignments: [],
    project_members: [],
    leave_days: [],
    holiday_calendars: [],
    holiday_calendar_days: [],
    project_assets: [],
    task_lists: [],
    tasks: [],
    task_comments: [],
    bulletins: [],
    unread_bulletin_ids: [],
    dismissed_bulletin_ids: [],
    unread_mentions: [],
    unread_task_threads: [],
    project_favorites: [],
    pods: [],
    pod_members: [],
    project_templates: [],
    template_milestones: [],
    template_task_lists: [],
    template_tasks: [],
    sessionProfileId: null,
  };
}

interface DataContextValue {
  ready: boolean;
  mode: "demo" | "supabase";
  state: DemoState;
  profile: Profile | null;
  myPerson: Person | null;
  canManage: boolean;
  isAuthenticated: boolean;
  /**
   * Signed-in platform admin with no org profile (manage via /admin only).
   * False for normal workspace members, including platform admins who Entered a workspace.
   */
  isPlatformOnly: boolean;
  /** True when viewing /share/[token] (read-only public board). */
  isPublicShare: boolean;
  /** Prefix for in-app links when isPublicShare, e.g. /share/abc. */
  shareBasePath: string | null;
  authError: string | null;
  loginDemo: () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    fullName: string,
    orgName: string,
  ) => Promise<{ needsConfirmation: boolean }>;
  /** Create another workspace while signed in; switches into it. */
  createAdditionalWorkspace: (
    orgName: string,
  ) => Promise<{ slug: string; organizationId: string }>;
  /** Set password while already in an invite/recovery session. */
  updatePassword: (password: string) => Promise<void>;
  /** Change password (re-authenticates with the current password first). */
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  /** Send a password-reset email that lands on /set-password. */
  requestPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  resetDemo: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Demo-only: create a member profile and link it to a person. */
  inviteDemoMember: (
    personId: string,
    email: string,
  ) => { profileId: string };
  /** Demo-only: switch which local profile is signed in. */
  switchDemoProfile: (profileId: string) => void;
  /** Demo-only: enable/disable/rotate the public share link. */
  updateDemoShare: (
    action: "enable" | "disable" | "rotate",
  ) => { enabled: boolean; token: string | null; url: string | null };
  upsertClient: (
    client: Omit<Client, "organization_id"> & { organization_id?: string },
  ) => void;
  deleteClient: (id: string) => void;
  /** Admin-only: rename the current organization. */
  updateOrganizationName: (name: string) => Promise<void>;
  /** Admin-only: change the workspace URL slug (does not follow name renames). */
  updateOrganizationSlug: (slug: string) => Promise<void>;
  /** Admin-only: change a profile's role (member / manager / admin). */
  updateProfileRole: (profileId: string, role: Role) => Promise<void>;
  /** Switch active workspace by org id or slug; reloads bootstrap and navigates. */
  switchWorkspace: (slugOrId: string, options?: { preservePath?: boolean }) => Promise<void>;
  upsertProject: (
    project: Omit<Project, "organization_id"> & { organization_id?: string },
  ) => Promise<Project>;
  /**
   * When enabling sandbox: delete milestones for the project and return field
   * overrides (timeline/budget/manager cleared). Keeps schedule assignments and tasks.
   */
  clearProjectSandboxTrackedData: (projectId: string) => Promise<{
    start_date: null;
    end_date: null;
    budget_hours: null;
    budget_amount: null;
    budget_mode: "none";
    budget_monthly_reset: false;
    manager_person_id: null;
  }>;
  /** Replace explicit team members for a project (optional contractor terms). */
  setProjectMembers: (
    projectId: string,
    members:
      | string[]
      | Array<
          Pick<
            ProjectMember,
            | "person_id"
            | "contractor_mode"
            | "contractor_fixed_fee"
            | "contractor_hours"
          >
        >,
  ) => Promise<void>;
  deleteProject: (id: string) => void;
  /** Star / unstar a project for the current profile. */
  toggleProjectFavorite: (projectId: string) => void;
  /** Persist nav-tab order (array of project ids for current profile). */
  reorderProjectFavorites: (projectIds: string[]) => void;
  upsertPerson: (
    person: Omit<Person, "organization_id"> & { organization_id?: string },
  ) => Promise<void>;
  /** Avatar-only update (works for members via people_update_self RLS). */
  updatePersonAvatar: (
    personId: string,
    avatarUrl: string | null,
    avatarAttachmentId?: string | null,
  ) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  /** Create or update a pod (managers/admins). */
  upsertPod: (
    pod: Omit<Pod, "organization_id"> & { organization_id?: string },
  ) => Promise<void>;
  deletePod: (id: string) => Promise<void>;
  /** Replace pod membership; always includes manager when set. */
  setPodMembers: (podId: string, personIds: string[]) => Promise<void>;
  /** Sync which pods a person belongs to (from person form). */
  setPersonPods: (personId: string, podIds: string[]) => Promise<void>;
  upsertAssignment: (
    assignment: Omit<Assignment, "organization_id"> & {
      organization_id?: string;
    },
  ) => void;
  deleteAssignment: (id: string) => void;
  upsertMilestone: (
    milestone: Omit<Milestone, "organization_id"> & {
      organization_id?: string;
    },
  ) => void;
  deleteMilestone: (id: string) => void;
  upsertLeave: (
    leave: Omit<LeaveDay, "organization_id"> & { organization_id?: string },
  ) => void;
  /**
   * Atomically set a multi-day leave block (create/update days in range,
   * remove prior block days outside the range, punch assignments once).
   */
  setLeaveBlock: (args: {
    personId: string;
    startDate: string;
    endDate: string;
    kind: LeaveKind;
    hours_per_day: number | null;
    notes: string;
    /** Days that belonged to the block before this edit (may be shrunk). */
    previousDayIds?: string[];
  }) => {
    rows: LeaveDay[];
    asgUpserts: Assignment[];
    asgDeletes: string[];
  };
  deleteLeave: (id: string) => void;
  /** Undo a leave mutation without re-running full-day assignment punches. */
  applyLeaveUndo: (args: {
    restoreLeaves: LeaveDay[];
    removeLeaveIds: string[];
    removeLeaveKeys?: string[];
    restoreAssignments: Assignment[];
    removeAssignmentIds: string[];
  }) => void;
  upsertHolidayCalendar: (
    calendar: Omit<HolidayCalendar, "organization_id"> & {
      organization_id?: string;
    },
  ) => void;
  deleteHolidayCalendar: (id: string) => void;
  upsertHolidayCalendarDay: (
    day: Omit<HolidayCalendarDay, "organization_id"> & {
      organization_id?: string;
    },
  ) => void;
  deleteHolidayCalendarDay: (id: string) => void;
  /** Create statutory leave_days for people assigned to this calendar. */
  applyHolidayCalendar: (calendarId: string) => Promise<number>;
  upsertProjectAsset: (
    asset: Omit<ProjectAsset, "organization_id"> & {
      organization_id?: string;
    },
  ) => void;
  deleteProjectAsset: (id: string) => void;
  upsertTaskList: (
    list: Omit<TaskList, "organization_id"> & { organization_id?: string },
  ) => void;
  deleteTaskList: (id: string) => void;
  /**
   * Members can update status/notes on tasks assigned to them; managers can
   * edit any task. UI is expected to gate the editable fields per role.
   */
  upsertTask: (
    task: Omit<Task, "organization_id"> & { organization_id?: string },
  ) => void;
  deleteTask: (id: string) => void;
  upsertTaskComment: (
    comment: Omit<TaskComment, "organization_id"> & {
      organization_id?: string;
    },
  ) => void;
  deleteTaskComment: (id: string) => void;
  /** Toggle the current user's emoji reaction on a comment. */
  toggleTaskCommentReaction: (commentId: string, emoji: string) => void;
  upsertBulletin: (
    bulletin: Omit<Bulletin, "organization_id"> & {
      organization_id?: string;
    },
  ) => void;
  deleteBulletin: (id: string) => void;
  /** Mark a bulletin as seen for the current profile (removes from unread inbox). */
  dismissBulletin: (id: string) => void;
  /** Hide system bulletin from this user's board (also clears unread). */
  dismissBulletinFromBoard: (id: string) => void;
  /** Mark a tagged comment as seen for a person (removes from unread inbox). */
  dismissMention: (commentId: string, personId: string) => void;
  /** Clear orange unread on a mention; card stays until dismissMention. */
  markMentionRead: (commentId: string, personId: string) => void;
  /** Mark assigner ↔ assignee task thread as read (opening the task). */
  dismissTaskThreadUnread: (taskId: string, personId: string) => void;
  upsertProjectTemplate: (
    template: Omit<ProjectTemplate, "organization_id"> & {
      organization_id?: string;
    },
  ) => void;
  deleteProjectTemplate: (id: string) => void;
  upsertTemplateMilestone: (
    milestone: Omit<TemplateMilestone, "organization_id"> & {
      organization_id?: string;
    },
  ) => void;
  deleteTemplateMilestone: (id: string) => void;
  upsertTemplateTaskList: (
    list: Omit<TemplateTaskList, "organization_id"> & {
      organization_id?: string;
    },
  ) => void;
  deleteTemplateTaskList: (id: string) => void;
  upsertTemplateTask: (
    task: Omit<TemplateTask, "organization_id"> & {
      organization_id?: string;
    },
  ) => void;
  deleteTemplateTask: (id: string) => void;
  /** Instantiate a template's milestones/task lists/tasks onto a project. */
  applyProjectTemplate: (
    projectId: string,
    templateId: string,
    options: TemplateApplyOptions,
  ) => Promise<void>;
  /** Clone a project's milestones/task lists/tasks into a new reusable template. */
  exportProjectAsTemplate: (
    projectId: string,
    name: string,
    options: TemplateSaveOptions,
  ) => Promise<void>;
  /** Enable/disable/rotate a project's public client-portal share link. */
  updateProjectShare: (
    projectId: string,
    action: "enable" | "disable" | "rotate",
  ) => { enabled: boolean; token: string | null; url: string | null };
  newId: (prefix: string) => string;
  /** Page-scoped fetch status (supabase mode). Demo always ready. */
  dataStatus: {
    orgTasks: "idle" | "loading" | "ready" | "error";
    orgMilestones: "idle" | "loading" | "ready" | "error";
    mentionComments: "idle" | "loading" | "ready" | "error";
    projects: Record<string, "idle" | "loading" | "ready" | "error">;
    scheduleRange: { start: string; end: string } | null;
  };
  ensureOrgTasks: (options?: {
    assigneePersonId?: string | null;
    openOnly?: boolean;
  }) => Promise<void>;
  ensureOrgMilestones: () => Promise<void>;
  ensureMentionComments: (
    commentIds?: string[],
  ) => Promise<import("@/lib/supabase/api").MentionCommentsBundle>;
  ensureProjectData: (projectId: string) => Promise<void>;
  ensureScheduleRange: (
    startKey: string,
    endKey: string,
    projectId?: string | null,
  ) => Promise<{ leaveDays: LeaveDay[]; assignments: Assignment[] } | void>;
  /** Subscribe project task realtime while hub / schedule sidebar is active. */
  setActiveRealtimeProjectIds: (projectIds: string[]) => void;
  /** Soft-fail RPC helpers (demo / missing RPC → null; caller falls back to TS). */
  fetchProjectBudgetBurnsRpc: () => Promise<
    import("@/lib/supabase/api").ProjectBudgetBurnRow[] | null
  >;
  fetchMonthlyRetainerYearBarsRpc: (
    year?: number,
  ) => Promise<
    import("@/lib/supabase/api").MonthlyRetainerYearBarRow[] | null
  >;
  fetchPersonUtilizationWeeksRpc: (
    weekStart: string,
    weeks: number,
    personIds?: string[] | null,
  ) => Promise<
    import("@/lib/supabase/api").PersonUtilizationWeekRow[] | null
  >;
  fetchOrgForecastRpc: () => Promise<
    import("@/lib/supabase/api").OrgForecastRow[] | null
  >;
  fetchOrgTaskStatsRpc: (
    asOf?: string,
  ) => Promise<import("@/lib/supabase/api").OrgTaskStats | null>;
}

const DataContext = createContext<DataContextValue | null>(null);

export { DataContext };
export type { DataContextValue };

export function DataProvider({ children }: { children: ReactNode }) {
  const mode: "demo" | "supabase" = isSupabaseConfigured()
    ? "supabase"
    : "demo";
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<DemoState>(() =>
    mode === "demo" ? createDemoSeed() : emptySupabaseState(),
  );
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  /** Auth session is a platform admin with no workspace profile. */
  const [platformOnly, setPlatformOnly] = useState(false);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const orgChannelRef = useRef<RealtimeChannel | null>(null);
  const projectChannelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const orgId = state.organization.id || ORG_ID;
  /** Recently written row ids — ignore realtime echoes of our own optimistic writes. */
  const localWritesRef = useRef<Map<string, number>>(new Map());
  const LOCAL_WRITE_TTL_MS = 3000;
  /**
   * Bumped on every leave mutation so an in-flight create upsert cannot
   * resurrect rows after a newer undo/delete.
   */
  const leaveWriteEpochRef = useRef(0);

  type PendingRealtimeEvent = {
    table: string;
    eventType: string;
    newRecord: Record<string, unknown> | null;
    oldRecord: Record<string, unknown> | null;
  };
  const pendingRealtimeRef = useRef<PendingRealtimeEvent[]>([]);
  const realtimeFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const activeRealtimeProjectIdsRef = useRef<string[]>([]);

  const [orgTasksStatus, setOrgTasksStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [orgMilestonesStatus, setOrgMilestonesStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [mentionCommentsStatus, setMentionCommentsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [projectDataStatus, setProjectDataStatus] = useState<
    Record<string, "idle" | "loading" | "ready" | "error">
  >({});
  const [scheduleRangeLoaded, setScheduleRangeLoaded] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [activeRealtimeProjectIds, setActiveRealtimeProjectIdsState] =
    useState<string[]>([]);

  const orgTasksInflight = useRef<Promise<void> | null>(null);
  const orgMilestonesInflight = useRef<Promise<void> | null>(null);
  const orgMilestonesLoadedRef = useRef(false);
  const mentionCommentsInflight = useRef<Promise<{
    tasks: import("@/lib/types").Task[];
    task_comments: import("@/lib/types").TaskComment[];
  }> | null>(null);
  const projectInflight = useRef<Map<string, Promise<void>>>(new Map());
  const scheduleRangeInflight = useRef<Promise<{
    leaveDays: LeaveDay[];
    assignments: Assignment[];
  } | void> | null>(null);
  /** Tracks the broadest org-tasks scope already loaded this session. */
  const orgTasksScopeRef = useRef<{
    all: boolean;
    personIds: Set<string>;
  }>({ all: false, personIds: new Set() });
  const mentionCommentsLoadedRef = useRef<Set<string>>(new Set());
  const mentionCommentByIdRef = useRef<Map<string, TaskComment>>(new Map());
  const mentionTaskByIdRef = useRef<Map<string, Task>>(new Map());
  const projectReadyRef = useRef<Set<string>>(new Set());
  const scheduleRangeLoadedRef = useRef<{ start: string; end: string } | null>(
    null,
  );
  const SCHEDULE_EVICT_PAD_DAYS = 7;

  const noteLocalWrite = useCallback((table: string, id: string) => {
    if (!id) return;
    localWritesRef.current.set(
      `${table}:${id}`,
      Date.now() + LOCAL_WRITE_TTL_MS,
    );
  }, []);

  const shouldIgnoreLocalEcho = useCallback(
    (table: string, id: string | null) => {
      if (!id) return false;
      const key = `${table}:${id}`;
      const until = localWritesRef.current.get(key);
      if (until == null) return false;
      if (Date.now() > until) {
        localWritesRef.current.delete(key);
        return false;
      }
      return true;
    },
    [],
  );

  const refreshSupabase = useCallback(async (client: SupabaseClient) => {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      setPlatformOnly(false);
      setState(emptySupabaseState());
      return;
    }

    // Existing membership → normal workspace load (may also be a platform admin).
    const { data: existingMembership, error: membershipLookupError } =
      await client
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
    if (membershipLookupError) throw membershipLookupError;

    async function applyWorkspace(workspace: DemoState) {
      const personId =
        workspace.people.find((p) => p.profile_id === user!.id)?.id ?? null;
      let next = workspace;
      clearLegacyDismissedBulletinIds(personId, user!.id);

      const legacyMentionDismissed = readLegacyDismissedMentionIds(personId);
      if (personId && legacyMentionDismissed.length > 0) {
        try {
          const wrote = await deleteMentionUnreadRows(
            client,
            personId,
            legacyMentionDismissed,
          );
          if (wrote) {
            const drop = new Set(legacyMentionDismissed);
            next = {
              ...next,
              unread_mentions: next.unread_mentions.filter(
                (r) =>
                  !(r.person_id === personId && drop.has(r.comment_id)),
              ),
            };
            clearLegacyDismissedMentionIds(personId);
          }
        } catch {
          /* keep legacy until migration applied */
        }
      } else if (personId) {
        clearLegacyDismissedMentionIds(personId);
      }
      // Bootstrap is shell-only. Re-applying it (e.g. auth INITIAL_SESSION after
      // the schedule already fetched a date range) must not wipe page-scoped rows.
      setState((prev) => {
        const sameOrg =
          Boolean(prev.organization.id) &&
          prev.organization.id === next.organization.id;
        if (!sameOrg) {
          orgTasksScopeRef.current = { all: false, personIds: new Set() };
          orgMilestonesLoadedRef.current = false;
          mentionCommentsLoadedRef.current = new Set();
          mentionCommentByIdRef.current = new Map();
          mentionTaskByIdRef.current = new Map();
          projectReadyRef.current = new Set();
          scheduleRangeLoadedRef.current = null;
          setOrgTasksStatus("idle");
          setOrgMilestonesStatus("idle");
          setMentionCommentsStatus("idle");
          setProjectDataStatus({});
          setScheduleRangeLoaded(null);
          return next;
        }
        return {
          ...next,
          assignments: prev.assignments,
          leave_days: prev.leave_days,
          milestones: prev.milestones,
          task_lists: prev.task_lists,
          tasks: prev.tasks,
          task_comments: prev.task_comments,
          project_assets: prev.project_assets,
        };
      });
    }

    if (existingMembership) {
      setPlatformOnly(false);
      const workspace = await fetchWorkspace(client, user.id);
      await applyWorkspace(workspace);
      return;
    }

    // No membership: allowlisted platform admins stay workspace-free.
    let isPlatformAdmin = false;
    try {
      const meRes = await fetch("/api/platform/me");
      if (meRes.ok) {
        const body = (await meRes.json()) as { isPlatformAdmin?: boolean };
        isPlatformAdmin = Boolean(body.isPlatformAdmin);
      }
    } catch {
      /* treat as non-admin */
    }

    if (isPlatformAdmin) {
      setPlatformOnly(true);
      setState({ ...emptySupabaseState(), sessionProfileId: null });
      return;
    }

    // First login for a normal user — create their workspace.
    await ensureProfileForUser(client, user);
    setPlatformOnly(false);
    const workspace = await fetchWorkspace(client, user.id);
    await applyWorkspace(workspace);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function boot() {
      if (mode === "demo") {
        setState(loadDemoState());
        setReady(true);
        return;
      }

      try {
        const client = createClient();
        supabaseRef.current = client;

        const {
          data: { session },
        } = await client.auth.getSession();

        if (!cancelled) {
          if (session?.user) {
            await refreshSupabase(client);
          } else {
            setState(emptySupabaseState());
          }
          setReady(true);
        }

        const {
          data: { subscription },
        } = client.auth.onAuthStateChange(async (event, nextSession) => {
          if (cancelled) return;
          if (event === "SIGNED_OUT" || !nextSession?.user) {
            setPlatformOnly(false);
            setState(emptySupabaseState());
            return;
          }
          // Token refresh must not reload the whole workspace (periodic freezes).
          if (event === "TOKEN_REFRESHED") return;
          if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
            try {
              await refreshSupabase(client);
            } catch (err) {
              console.error(err);
              setAuthError(
                err instanceof Error
                  ? err.message
                  : "Failed to load workspace. Did you run 002_bootstrap.sql?",
              );
            }
          }
        });

        unsubscribe = () => subscription.unsubscribe();
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setAuthError(
            err instanceof Error ? err.message : "Failed to connect to Supabase",
          );
          setReady(true);
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [mode, refreshSupabase]);

  activeRealtimeProjectIdsRef.current = activeRealtimeProjectIds;

  const catchUpProjectRealtimeData = useCallback(
    async (projectId: string) => {
      if (mode !== "supabase" || !projectId) return;
      const client = supabaseRef.current;
      const organizationId = state.organization.id;
      if (!client || !organizationId) return;
      try {
        const bundle = await loadProjectData(
          client,
          organizationId,
          projectId,
        );
        setState((prev) => {
          const dropTasks = new Set(
            prev.tasks
              .filter((t) => t.project_id === projectId)
              .map((t) => t.id),
          );
          return {
            ...prev,
            milestones: [
              ...prev.milestones.filter((m) => m.project_id !== projectId),
              ...bundle.milestones,
            ],
            task_lists: [
              ...prev.task_lists.filter((l) => l.project_id !== projectId),
              ...bundle.task_lists,
            ],
            tasks: [
              ...prev.tasks.filter((t) => t.project_id !== projectId),
              ...bundle.tasks,
            ],
            task_comments: [
              ...prev.task_comments.filter((c) => !dropTasks.has(c.task_id)),
              ...bundle.task_comments,
            ],
            project_assets: [
              ...prev.project_assets.filter((a) => a.project_id !== projectId),
              ...bundle.project_assets,
            ],
            assignments: [
              ...prev.assignments.filter((a) => a.project_id !== projectId),
              ...bundle.assignments,
            ],
          };
        });
        projectReadyRef.current.add(projectId);
      } catch (err) {
        console.warn("project realtime catch-up failed", projectId, err);
      }
    },
    [mode, state.organization.id],
  );

  const flushPendingRealtime = useCallback(() => {
    realtimeFlushTimerRef.current = null;
    const batch = pendingRealtimeRef.current;
    pendingRealtimeRef.current = [];
    if (batch.length === 0) return;
    setState((prev) => {
      let next = prev;
      for (const ev of batch) {
        const echoId = realtimeEchoId(
          ev.table,
          ev.eventType,
          ev.newRecord,
          ev.oldRecord,
        );
        if (
          shouldIgnoreLocalEcho(ev.table, echoId) &&
          isTrueLocalEcho(
            next,
            ev.table,
            ev.eventType,
            ev.newRecord,
            ev.oldRecord,
          )
        ) {
          continue;
        }
        if (
          ev.table === "tasks" ||
          ev.table === "task_lists" ||
          ev.table === "project_assets" ||
          ev.table === "milestones" ||
          ev.table === "task_comments" ||
          ev.table === "task_comment_mentions" ||
          ev.table === "task_comment_reactions"
        ) {
          const active = new Set(activeRealtimeProjectIdsRef.current);
          if (active.size === 0 && projectReadyRef.current.size === 0) {
            continue;
          }
          if (
            ev.table === "tasks" ||
            ev.table === "task_lists" ||
            ev.table === "project_assets" ||
            ev.table === "milestones"
          ) {
            const pid = String(
              (ev.newRecord ?? ev.oldRecord)?.project_id ?? "",
            );
            if (
              pid &&
              !active.has(pid) &&
              !projectReadyRef.current.has(pid)
            ) {
              continue;
            }
          } else if (
            ev.table === "task_comment_reactions" ||
            ev.table === "task_comment_mentions"
          ) {
            const commentId = String(
              (ev.newRecord ?? ev.oldRecord)?.comment_id ?? "",
            );
            const comment = next.task_comments.find((c) => c.id === commentId);
            if (!comment) continue;
            const task = next.tasks.find((t) => t.id === comment.task_id);
            if (!task) continue;
            if (
              !active.has(task.project_id) &&
              !projectReadyRef.current.has(task.project_id)
            ) {
              continue;
            }
          } else {
            const taskId = String(
              (ev.newRecord ?? ev.oldRecord)?.task_id ?? "",
            );
            const task = next.tasks.find((t) => t.id === taskId);
            if (!task) continue;
            if (
              !active.has(task.project_id) &&
              !projectReadyRef.current.has(task.project_id)
            ) {
              continue;
            }
          }
        } else if (ev.table === "assignments" || ev.table === "leave_days") {
          if (ev.eventType !== "DELETE") {
            const loaded = scheduleRangeLoadedRef.current;
            const row = ev.newRecord;
            if (!row) continue;
            if (ev.table === "assignments") {
              const mapped = mapAssignment(row);
              if (!projectReadyRef.current.has(mapped.project_id)) {
                if (!loaded) continue;
                const padStart = toDateKey(
                  addDays(parseISO(loaded.start), -SCHEDULE_EVICT_PAD_DAYS),
                );
                const padEnd = toDateKey(
                  addDays(parseISO(loaded.end), SCHEDULE_EVICT_PAD_DAYS),
                );
                if (!assignmentOverlapsDateRange(mapped, padStart, padEnd)) {
                  continue;
                }
              }
            } else {
              if (!loaded) continue;
              const date = String(row.date ?? "").slice(0, 10);
              const padStart = toDateKey(
                addDays(parseISO(loaded.start), -SCHEDULE_EVICT_PAD_DAYS),
              );
              const padEnd = toDateKey(
                addDays(parseISO(loaded.end), SCHEDULE_EVICT_PAD_DAYS),
              );
              if (!date || date < padStart || date > padEnd) continue;
            }
          }
        }
        next = applyRealtimeTableEvent(
          next,
          ev.table,
          ev.eventType,
          ev.newRecord,
          ev.oldRecord,
        );
      }
      return next;
    });
  }, [shouldIgnoreLocalEcho]);

  const enqueueRealtimeChange = useCallback(
    (table: string) =>
      (payload: {
        eventType: string;
        new: Record<string, unknown>;
        old: Record<string, unknown>;
      }) => {
        pendingRealtimeRef.current.push({
          table,
          eventType: payload.eventType,
          newRecord: payload.new ?? null,
          oldRecord: payload.old ?? null,
        });
        if (realtimeFlushTimerRef.current == null) {
          realtimeFlushTimerRef.current = setTimeout(flushPendingRealtime, 16);
        }
      },
    [flushPendingRealtime],
  );

  // Live sync: org shell stays mounted for the org session.
  useEffect(() => {
    if (mode !== "supabase" || !ready) return;
    const client = supabaseRef.current;
    const organizationId = state.organization.id;
    if (!client || !organizationId) return;

    const orgChannel = client
      .channel(`org-live:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assignments",
          filter: `organization_id=eq.${organizationId}`,
        },
        enqueueRealtimeChange("assignments"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leave_days",
          filter: `organization_id=eq.${organizationId}`,
        },
        enqueueRealtimeChange("leave_days"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bulletins",
          filter: `organization_id=eq.${organizationId}`,
        },
        enqueueRealtimeChange("bulletins"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bulletin_unreads",
          filter: `organization_id=eq.${organizationId}`,
        },
        enqueueRealtimeChange("bulletin_unreads"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mention_unreads",
          filter: `organization_id=eq.${organizationId}`,
        },
        enqueueRealtimeChange("mention_unreads"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_thread_unreads",
          filter: `organization_id=eq.${organizationId}`,
        },
        enqueueRealtimeChange("task_thread_unreads"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_comments",
          filter: `organization_id=eq.${organizationId}`,
        },
        enqueueRealtimeChange("task_comments"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_comment_mentions",
          filter: `organization_id=eq.${organizationId}`,
        },
        enqueueRealtimeChange("task_comment_mentions"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_comment_reactions",
          filter: `organization_id=eq.${organizationId}`,
        },
        enqueueRealtimeChange("task_comment_reactions"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pods",
          filter: `organization_id=eq.${organizationId}`,
        },
        enqueueRealtimeChange("pods"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pod_members",
          filter: `organization_id=eq.${organizationId}`,
        },
        enqueueRealtimeChange("pod_members"),
      )
      .on(
        "broadcast",
        { event: "task-note-mention" },
        ({ payload }) => {
          const detail = payload as TaskNoteMentionBroadcast;
          if (!detail?.personIds?.length || !detail.taskId) return;
          dispatchTaskNoteMention(detail);
        },
      )
      .subscribe();

    orgChannelRef.current = orgChannel;

    return () => {
      if (realtimeFlushTimerRef.current) {
        clearTimeout(realtimeFlushTimerRef.current);
        realtimeFlushTimerRef.current = null;
      }
      orgChannelRef.current = null;
      void client.removeChannel(orgChannel);
    };
  }, [mode, ready, state.organization.id, enqueueRealtimeChange]);

  // Project task traffic: add/remove channels without tearing down the org channel.
  useEffect(() => {
    if (mode !== "supabase" || !ready) return;
    const client = supabaseRef.current;
    if (!client) return;

    const wanted = new Set(activeRealtimeProjectIds);
    const existing = projectChannelsRef.current;

    for (const [projectId, channel] of [...existing]) {
      if (!wanted.has(projectId)) {
        void client.removeChannel(channel);
        existing.delete(projectId);
      }
    }

    for (const projectId of wanted) {
      if (existing.has(projectId)) continue;
      const channel = client
        .channel(`project-live:${projectId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tasks",
            filter: `project_id=eq.${projectId}`,
          },
          enqueueRealtimeChange("tasks"),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "task_lists",
            filter: `project_id=eq.${projectId}`,
          },
          enqueueRealtimeChange("task_lists"),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_assets",
            filter: `project_id=eq.${projectId}`,
          },
          enqueueRealtimeChange("project_assets"),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "milestones",
            filter: `project_id=eq.${projectId}`,
          },
          enqueueRealtimeChange("milestones"),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            void catchUpProjectRealtimeData(projectId);
          }
        });
      existing.set(projectId, channel);
    }
  }, [
    mode,
    ready,
    activeRealtimeProjectIds,
    enqueueRealtimeChange,
    catchUpProjectRealtimeData,
  ]);

  // Drop project channels when leaving the live supabase session / switching org.
  useEffect(() => {
    return () => {
      const client = supabaseRef.current;
      for (const [, channel] of projectChannelsRef.current) {
        if (client) void client.removeChannel(channel);
      }
      projectChannelsRef.current.clear();
    };
  }, [mode, ready, state.organization.id]);

  // Heal gaps after sleep / background tab.
  useEffect(() => {
    if (mode !== "supabase" || !ready) return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      for (const projectId of activeRealtimeProjectIdsRef.current) {
        void catchUpProjectRealtimeData(projectId);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mode, ready, catchUpProjectRealtimeData]);

  useEffect(() => {
    if (!ready || mode !== "demo") return;
    const { sessionProfileId, ...rest } = state;
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(rest));
    if (sessionProfileId) localStorage.setItem(DEMO_SESSION_KEY, sessionProfileId);
    else localStorage.removeItem(DEMO_SESSION_KEY);
  }, [state, ready, mode]);

  const patch = useCallback((fn: (prev: DemoState) => DemoState) => {
    setState((prev) => fn(prev));
  }, []);

  const withOrg = useCallback(
    <T extends { organization_id?: string }>(
      row: T,
    ): T & { organization_id: string } => ({
      ...row,
      organization_id: row.organization_id ?? orgId,
    }),
    [orgId],
  );

  const runRemote = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      console.error(err);
      const raw =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : err instanceof Error
            ? err.message
            : "Save failed";
      const message = raw.includes("recurrence_exceptions")
        ? "Missing DB column `recurrence_exceptions`. In Supabase SQL Editor run supabase/migrations/032_recurrence_exceptions.sql, then try again."
        : raw.includes("recurrence")
        ? "Missing DB column `recurrence`. In Supabase SQL Editor run supabase/migrations/003_recurrence.sql, then try again."
        : /'email' column of 'people'|people\.email|email.*people/i.test(raw)
          ? "Missing DB column `email` on people. In Supabase SQL Editor run supabase/migrations/004_people_email.sql, then try again."
          : /budget_monthly_reset/i.test(raw)
            ? "Missing DB column `budget_monthly_reset`. In Supabase SQL Editor run supabase/migrations/010_budget_monthly_reset_fix.sql, then try again."
            : /Budget type \"None\"|budget_mode.*none|010_budget_monthly_reset/i.test(
                  raw,
                )
              ? 'Budget type "None" needs a DB update. In Supabase SQL Editor run supabase/migrations/010_budget_monthly_reset_fix.sql, then try again.'
              : raw;
      setAuthError(message);
      const client = supabaseRef.current;
      if (client) await refreshSupabase(client);
      throw new Error(message);
    }
  }, [refreshSupabase]);

  /** Fire-and-forget remote write (errors still surface via authError). */
  const runRemoteSoft = useCallback(
    (fn: () => Promise<void>) => {
      void runRemote(fn).catch(() => {
        /* authError already set */
      });
    },
    [runRemote],
  );

  const cleanupEntityAttachments = useCallback(
    (entityType: "comment" | "task_note", entityId: string) => {
      if (mode !== "supabase") return;
      void fetch("/api/storage/cleanup-entity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId }),
      }).catch((err) => {
        console.warn("Attachment cleanup failed", err);
      });
    },
    [mode],
  );


  const ensureOrgTasks = useCallback(
    async (options?: {
      assigneePersonId?: string | null;
      openOnly?: boolean;
    }) => {
      if (mode !== "supabase") {
        orgTasksScopeRef.current = { all: true, personIds: new Set() };
        setOrgTasksStatus("ready");
        return;
      }
      const assigneeId = options?.assigneePersonId ?? null;
      const openOnly = Boolean(options?.openOnly);
      const scope = orgTasksScopeRef.current;
      if (scope.all) {
        setOrgTasksStatus("ready");
        return;
      }
      if (assigneeId && scope.personIds.has(assigneeId) && !openOnly) {
        setOrgTasksStatus("ready");
        return;
      }
      if (orgTasksInflight.current) return orgTasksInflight.current;
      const client = supabaseRef.current ?? createClient();
      const organizationId = state.organization.id;
      if (!organizationId) return;

      const run = (async () => {
        setOrgTasksStatus("loading");
        try {
          const tasks = await loadOrgTasks(client, organizationId, {
            assigneePersonId: assigneeId,
            openOnly,
          });
          setState((prev) => {
            if (!assigneeId && !openOnly) {
              return { ...prev, tasks };
            }
            const byId = new Map(prev.tasks.map((t) => [t.id, t]));
            for (const t of tasks) byId.set(t.id, t);
            return { ...prev, tasks: [...byId.values()] };
          });
          if (!assigneeId && !openOnly) {
            orgTasksScopeRef.current = { all: true, personIds: new Set() };
          } else if (assigneeId) {
            orgTasksScopeRef.current.personIds.add(assigneeId);
          }
          setOrgTasksStatus("ready");
        } catch (err) {
          console.error(err);
          setOrgTasksStatus("error");
          throw err;
        } finally {
          orgTasksInflight.current = null;
        }
      })();
      orgTasksInflight.current = run;
      return run;
    },
    [mode, state.organization.id],
  );

  const ensureOrgMilestones = useCallback(async () => {
    if (mode !== "supabase") {
      orgMilestonesLoadedRef.current = true;
      setOrgMilestonesStatus("ready");
      return;
    }
    if (orgMilestonesLoadedRef.current) {
      setOrgMilestonesStatus("ready");
      return;
    }
    if (orgMilestonesInflight.current) return orgMilestonesInflight.current;
    const client = supabaseRef.current ?? createClient();
    const organizationId = state.organization.id;
    if (!organizationId) return;

    const run = (async () => {
      setOrgMilestonesStatus("loading");
      try {
        const milestones = await loadOrgMilestones(client, organizationId);
        setState((prev) => ({ ...prev, milestones }));
        orgMilestonesLoadedRef.current = true;
        setOrgMilestonesStatus("ready");
      } catch (err) {
        console.error(err);
        setOrgMilestonesStatus("error");
        throw err;
      } finally {
        orgMilestonesInflight.current = null;
      }
    })();
    orgMilestonesInflight.current = run;
    return run;
  }, [mode, state.organization.id]);

  const ensureMentionComments = useCallback(
    async (commentIds?: string[]) => {
      const empty = { tasks: [] as Task[], task_comments: [] as TaskComment[] };

      const remember = (bundle: {
        tasks: Task[];
        task_comments: TaskComment[];
      }) => {
        for (const c of bundle.task_comments) {
          mentionCommentByIdRef.current.set(c.id, c);
          mentionCommentsLoadedRef.current.add(c.id);
        }
        for (const t of bundle.tasks) {
          mentionTaskByIdRef.current.set(t.id, t);
        }
      };

      const collect = (ids: string[]) => {
        const task_comments: TaskComment[] = [];
        for (const id of ids) {
          const cached = mentionCommentByIdRef.current.get(id);
          if (cached) {
            task_comments.push(cached);
            continue;
          }
          const fromState = state.task_comments.find((c) => c.id === id);
          if (fromState) {
            mentionCommentByIdRef.current.set(id, fromState);
            task_comments.push(fromState);
          }
        }
        const taskIds = new Set(task_comments.map((c) => c.task_id));
        const tasks: Task[] = [];
        for (const taskId of taskIds) {
          const cached = mentionTaskByIdRef.current.get(taskId);
          if (cached) {
            tasks.push(cached);
            continue;
          }
          const fromState = state.tasks.find((t) => t.id === taskId);
          if (fromState) {
            mentionTaskByIdRef.current.set(taskId, fromState);
            tasks.push(fromState);
          }
        }
        return { tasks, task_comments };
      };

      if (mode !== "supabase") {
        setMentionCommentsStatus("ready");
        const ids = [
          ...new Set(
            (commentIds ?? state.unread_mentions.map((m) => m.comment_id)).filter(
              Boolean,
            ),
          ),
        ];
        const bundle = collect(ids);
        remember(bundle);
        return bundle;
      }

      const ids = [
        ...new Set(
          (commentIds ?? state.unread_mentions.map((m) => m.comment_id)).filter(
            Boolean,
          ),
        ),
      ];
      if (ids.length === 0) {
        setMentionCommentsStatus("ready");
        return empty;
      }

      const missing = ids.filter(
        (id) => !mentionCommentByIdRef.current.has(id),
      );
      if (missing.length === 0) {
        setMentionCommentsStatus("ready");
        return collect(ids);
      }

      if (mentionCommentsInflight.current) {
        await mentionCommentsInflight.current;
        const stillMissing = missing.filter(
          (id) => !mentionCommentByIdRef.current.has(id),
        );
        if (stillMissing.length === 0) {
          setMentionCommentsStatus("ready");
          return collect(ids);
        }
      }

      const client = supabaseRef.current ?? createClient();
      const organizationId = state.organization.id;
      if (!organizationId) return empty;

      const toFetch = ids.filter((id) => !mentionCommentByIdRef.current.has(id));
      const run = (async () => {
        setMentionCommentsStatus("loading");
        try {
          const fetched =
            toFetch.length > 0
              ? await loadMentionComments(client, organizationId, toFetch)
              : empty;
          remember(fetched);
          setState((prev) => {
            const tasksById = new Map(prev.tasks.map((t) => [t.id, t]));
            for (const t of fetched.tasks) tasksById.set(t.id, t);
            const commentsById = new Map(
              prev.task_comments.map((c) => [c.id, c]),
            );
            for (const c of fetched.task_comments) commentsById.set(c.id, c);
            return {
              ...prev,
              tasks: [...tasksById.values()],
              task_comments: [...commentsById.values()],
            };
          });
          setMentionCommentsStatus("ready");
          return collect(ids);
        } catch (err) {
          console.error(err);
          setMentionCommentsStatus("error");
          throw err;
        } finally {
          mentionCommentsInflight.current = null;
        }
      })();
      mentionCommentsInflight.current = run;
      return run;
    },
    [
      mode,
      state.organization.id,
      state.unread_mentions,
      state.task_comments,
      state.tasks,
    ],
  );

  const ensureProjectData = useCallback(
    async (projectId: string) => {
      if (!projectId) return;
      if (mode !== "supabase") {
        projectReadyRef.current.add(projectId);
        setProjectDataStatus((prev) => ({ ...prev, [projectId]: "ready" }));
        return;
      }
      if (projectReadyRef.current.has(projectId)) {
        setProjectDataStatus((prev) =>
          prev[projectId] === "ready"
            ? prev
            : { ...prev, [projectId]: "ready" },
        );
        return;
      }
      const existing = projectInflight.current.get(projectId);
      if (existing) return existing;
      const client = supabaseRef.current ?? createClient();
      const organizationId = state.organization.id;
      if (!organizationId) return;

      const run = (async () => {
        setProjectDataStatus((prev) => ({ ...prev, [projectId]: "loading" }));
        try {
          const bundle = await loadProjectData(
            client,
            organizationId,
            projectId,
          );
          setState((prev) => {
            const dropTasks = new Set(
              prev.tasks
                .filter((t) => t.project_id === projectId)
                .map((t) => t.id),
            );
            return {
              ...prev,
              milestones: [
                ...prev.milestones.filter((m) => m.project_id !== projectId),
                ...bundle.milestones,
              ],
              task_lists: [
                ...prev.task_lists.filter((l) => l.project_id !== projectId),
                ...bundle.task_lists,
              ],
              tasks: [
                ...prev.tasks.filter((t) => t.project_id !== projectId),
                ...bundle.tasks,
              ],
              task_comments: [
                ...prev.task_comments.filter((c) => !dropTasks.has(c.task_id)),
                ...bundle.task_comments,
              ],
              project_assets: [
                ...prev.project_assets.filter(
                  (a) => a.project_id !== projectId,
                ),
                ...bundle.project_assets,
              ],
              assignments: [
                ...prev.assignments.filter((a) => a.project_id !== projectId),
                ...bundle.assignments,
              ],
            };
          });
          projectReadyRef.current.add(projectId);
          setProjectDataStatus((prev) => ({ ...prev, [projectId]: "ready" }));
        } catch (err) {
          console.error(err);
          setProjectDataStatus((prev) => ({ ...prev, [projectId]: "error" }));
          throw err;
        } finally {
          projectInflight.current.delete(projectId);
        }
      })();
      projectInflight.current.set(projectId, run);
      return run;
    },
    [mode, state.organization.id],
  );

  const ensureScheduleRange = useCallback(
    async (
      startKey: string,
      endKey: string,
      projectId?: string | null,
    ): Promise<{ leaveDays: LeaveDay[]; assignments: Assignment[] } | void> => {
      const snapshotInRange = () => {
        const leaveDays = state.leave_days.filter(
          (l) => l.date >= startKey && l.date <= endKey,
        );
        const assignments = state.assignments.filter((a) => {
          const aEnd = a.recurrence_end_date ?? a.end_date;
          return a.start_date <= endKey && aEnd >= startKey;
        });
        return { leaveDays, assignments };
      };

      if (mode !== "supabase") {
        scheduleRangeLoadedRef.current = { start: startKey, end: endKey };
        setScheduleRangeLoaded({ start: startKey, end: endKey });
        return snapshotInRange();
      }

      const covers = (loaded: { start: string; end: string } | null) =>
        Boolean(
          loaded &&
            loaded.start <= startKey &&
            loaded.end >= endKey &&
            !projectId,
        );

      if (covers(scheduleRangeLoadedRef.current)) {
        return snapshotInRange();
      }
      if (scheduleRangeInflight.current) {
        await scheduleRangeInflight.current;
        if (covers(scheduleRangeLoadedRef.current)) {
          return snapshotInRange();
        }
      }

      const client = supabaseRef.current ?? createClient();
      const organizationId = state.organization.id;
      if (!organizationId) return snapshotInRange();

      const loadedBefore = scheduleRangeLoadedRef.current;
      const run = (async () => {
        try {
          const [assignments, leave_days] = await Promise.all([
            loadAssignmentsForRange(
              client,
              organizationId,
              startKey,
              endKey,
              projectId,
            ),
            loadLeaveForRange(client, organizationId, startKey, endKey),
          ]);
          const nextRange = !projectId
            ? { start: startKey, end: endKey }
            : loadedBefore;

          setState((prev) => {
            const asgById = new Map(prev.assignments.map((a) => [a.id, a]));
            for (const a of assignments) asgById.set(a.id, a);
            const leaveById = new Map(prev.leave_days.map((l) => [l.id, l]));
            for (const l of leave_days) leaveById.set(l.id, l);

            let nextAssignments = [...asgById.values()];
            let nextLeave = [...leaveById.values()];

            if (nextRange) {
              const padStart = toDateKey(
                addDays(parseISO(nextRange.start), -SCHEDULE_EVICT_PAD_DAYS),
              );
              const padEnd = toDateKey(
                addDays(parseISO(nextRange.end), SCHEDULE_EVICT_PAD_DAYS),
              );
              const readyProjects = projectReadyRef.current;
              nextAssignments = nextAssignments.filter(
                (a) =>
                  readyProjects.has(a.project_id) ||
                  assignmentOverlapsDateRange(a, padStart, padEnd),
              );
              nextLeave = nextLeave.filter(
                (l) => l.date >= padStart && l.date <= padEnd,
              );
            }

            return {
              ...prev,
              assignments: nextAssignments,
              leave_days: nextLeave,
            };
          });
          if (!projectId && nextRange) {
            scheduleRangeLoadedRef.current = nextRange;
            setScheduleRangeLoaded(nextRange);
          }
          // Merge freshly loaded rows with prior in-memory state for callers.
          const leaveById = new Map(
            state.leave_days.map((l) => [l.id, l] as const),
          );
          for (const l of leave_days) leaveById.set(l.id, l);
          const asgById = new Map(
            state.assignments.map((a) => [a.id, a] as const),
          );
          for (const a of assignments) asgById.set(a.id, a);
          return {
            leaveDays: [...leaveById.values()].filter(
              (l) => l.date >= startKey && l.date <= endKey,
            ),
            assignments: [...asgById.values()].filter((a) => {
              const aEnd = a.recurrence_end_date ?? a.end_date;
              return a.start_date <= endKey && aEnd >= startKey;
            }),
          };
        } finally {
          scheduleRangeInflight.current = null;
        }
      })();
      scheduleRangeInflight.current = run;
      return run;
    },
    [mode, state.organization.id, state.leave_days, state.assignments],
  );

  const setActiveRealtimeProjectIds = useCallback((projectIds: string[]) => {
    setActiveRealtimeProjectIdsState((prev) => {
      const next = [...new Set(projectIds.filter(Boolean))].sort();
      if (
        prev.length === next.length &&
        prev.every((id, i) => id === next[i])
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const fetchProjectBudgetBurnsRpc = useCallback(async () => {
    if (mode !== "supabase") return null;
    const client = supabaseRef.current ?? createClient();
    try {
      return await rpcProjectBudgetBurns(client);
    } catch (err) {
      console.warn("rpc_project_budget_burns failed", err);
      return null;
    }
  }, [mode]);

  const fetchMonthlyRetainerYearBarsRpc = useCallback(
    async (year?: number) => {
      if (mode !== "supabase") return null;
      const client = supabaseRef.current ?? createClient();
      try {
        return await rpcMonthlyRetainerYearBars(client, year);
      } catch (err) {
        console.warn("rpc_monthly_retainer_year_bars failed", err);
        return null;
      }
    },
    [mode],
  );

  const fetchPersonUtilizationWeeksRpc = useCallback(
    async (
      weekStartKey: string,
      weeks: number,
      personIds?: string[] | null,
    ) => {
      if (mode !== "supabase") return null;
      const client = supabaseRef.current ?? createClient();
      try {
        return await rpcPersonUtilizationWeeks(
          client,
          weekStartKey,
          weeks,
          personIds,
        );
      } catch (err) {
        console.warn("rpc_person_utilization_weeks failed", err);
        return null;
      }
    },
    [mode],
  );

  const fetchOrgForecastRpc = useCallback(async () => {
    if (mode !== "supabase") return null;
    const client = supabaseRef.current ?? createClient();
    try {
      return await rpcOrgForecast(client);
    } catch (err) {
      console.warn("rpc_org_forecast failed", err);
      return null;
    }
  }, [mode]);

  const fetchOrgTaskStatsRpc = useCallback(
    async (asOf?: string) => {
      if (mode !== "supabase") return null;
      const client = supabaseRef.current ?? createClient();
      try {
        return await rpcOrgTaskStats(client, asOf);
      } catch (err) {
        console.warn("rpc_org_task_stats failed", err);
        return null;
      }
    },
    [mode],
  );


  const profile =
    state.profiles.find((p) => p.id === state.sessionProfileId) ?? null;
  const myPerson = personForProfile(state.people, profile);
  const manage = canManage(profile?.role);
  const admin = isAdmin(profile?.role);

  const value = useMemo<DataContextValue>(
    () => ({
      ready,
      mode,
      state,
      profile,
      myPerson,
      canManage: manage,
      isAuthenticated: Boolean(profile) || platformOnly,
      isPlatformOnly: platformOnly,
      isPublicShare: false,
      shareBasePath: null,
      authError,
      loginDemo: () => {
        if (mode !== "demo") return;
        setAuthError(null);
        patch((prev) => ({ ...prev, sessionProfileId: "profile-admin" }));
      },
      refresh: async () => {
        if (mode !== "supabase") return;
        const client = supabaseRef.current ?? createClient();
        await refreshSupabase(client);
      },
      inviteDemoMember: (personId, email) => {
        const profileId = uid("profile");
        patch((prev) => {
          const person = prev.people.find((p) => p.id === personId);
          const member: Profile = {
            id: profileId,
            organization_id: prev.organization.id,
            email,
            full_name: person?.name ?? email,
            role: "member",
          };
          return {
            ...prev,
            profiles: [...prev.profiles, member],
            people: prev.people.map((p) =>
              p.id === personId ? { ...p, profile_id: profileId } : p,
            ),
          };
        });
        return { profileId };
      },
      switchDemoProfile: (profileId) => {
        if (mode !== "demo") return;
        clearViewAsStorage();
        patch((prev) => ({ ...prev, sessionProfileId: profileId }));
      },
      updateDemoShare: (action) => {
        if (mode !== "demo") {
          return { enabled: false, token: null, url: null };
        }
        let result = { enabled: false, token: null as string | null, url: null as string | null };
        patch((prev) => {
          let share_enabled = Boolean(prev.organization.share_enabled);
          let share_token = prev.organization.share_token ?? null;
          if (action === "disable") {
            share_enabled = false;
          } else if (action === "enable") {
            share_enabled = true;
            if (!share_token) share_token = generateShareToken();
          } else {
            share_enabled = true;
            share_token = generateShareToken();
          }
          const origin = clientSiteOrigin();
          result = {
            enabled: share_enabled,
            token: share_enabled ? share_token : null,
            url:
              share_enabled && share_token
                ? publicShareUrl(origin, share_token)
                : null,
          };
          return {
            ...prev,
            organization: {
              ...prev.organization,
              share_enabled,
              share_token,
            },
          };
        });
        return result;
      },
      login: async (email, password) => {
        setAuthError(null);
        if (mode !== "supabase") {
          throw new Error("Supabase is not configured");
        }
        const client = supabaseRef.current ?? createClient();
        supabaseRef.current = client;
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setAuthError(error.message);
          throw error;
        }
        await refreshSupabase(client);
        const {
          data: { user },
        } = await client.auth.getUser();
        if (!user) {
          throw new Error("Signed in, but no user session was returned.");
        }
        const workspace = await fetchWorkspace(client, user.id);
        if (!workspace.sessionProfileId) {
          const message =
            workspace.memberships.length === 0
              ? "Signed in, but this account has no workspace membership. Ask an admin to invite you, or create a workspace."
              : "Signed in, but workspace setup failed. Apply supabase/migrations/087_profiles_org_set_null.sql, then try again.";
          setAuthError(message);
          throw new Error(message);
        }
      },
      signup: async (email, password, fullName, orgName) => {
        setAuthError(null);
        if (mode !== "supabase") {
          throw new Error("Supabase is not configured");
        }
        const client = supabaseRef.current ?? createClient();
        supabaseRef.current = client;
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, org_name: orgName },
          },
        });
        if (error) {
          const already =
            /already registered|already been registered|user already/i.test(
              error.message,
            );
          const message = already
            ? "This email already has an account. Sign in, then create another workspace from Settings."
            : error.message;
          setAuthError(message);
          throw new Error(message);
        }
        // With email confirmation on, existing emails return a fake user and no mail.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          const message =
            "This email already has an account. Sign in, then create another workspace from Settings.";
          setAuthError(message);
          throw new Error(message);
        }
        if (!data.session) {
          const message =
            "Check your email to confirm, then sign in. Your workspace will be created on first login.";
          setAuthError(message);
          return { needsConfirmation: true };
        }
        await bootstrapOrganization(client, orgName, fullName);
        await refreshSupabase(client);
        return { needsConfirmation: false };
      },
      createAdditionalWorkspace: async (orgName) => {
        if (mode !== "supabase") {
          throw new Error("Supabase is not configured");
        }
        const client = supabaseRef.current ?? createClient();
        supabaseRef.current = client;
        const name = orgName.trim() || "My workspace";
        const orgId = await createAdditionalOrganization(
          client,
          name,
          profile?.full_name ?? "",
        );
        const {
          data: { user },
        } = await client.auth.getUser();
        if (!user) throw new Error("Not signed in");
        const workspace = await fetchWorkspace(client, user.id, {
          organizationId: orgId,
        });
        orgTasksScopeRef.current = { all: false, personIds: new Set() };
        orgMilestonesLoadedRef.current = false;
        mentionCommentsLoadedRef.current = new Set();
        mentionCommentByIdRef.current = new Map();
        mentionTaskByIdRef.current = new Map();
        projectReadyRef.current = new Set();
        scheduleRangeLoadedRef.current = null;
        setOrgTasksStatus("idle");
        setOrgMilestonesStatus("idle");
        setMentionCommentsStatus("idle");
        setProjectDataStatus({});
        setScheduleRangeLoaded(null);
        setPlatformOnly(false);
        setState(workspace);
        const slug = workspace.organization.slug;
        if (slug) {
          router.replace(`/${slug}/dashboard`);
        }
        return { slug, organizationId: orgId };
      },
      updatePassword: async (password) => {
        setAuthError(null);
        if (mode !== "supabase") {
          throw new Error("Supabase is not configured");
        }
        const client = supabaseRef.current ?? createClient();
        supabaseRef.current = client;
        const { error } = await client.auth.updateUser({ password });
        if (error) {
          setAuthError(error.message);
          throw error;
        }
      },
      changePassword: async (currentPassword, newPassword) => {
        setAuthError(null);
        if (mode !== "supabase") {
          throw new Error("Supabase is not configured");
        }
        const client = supabaseRef.current ?? createClient();
        supabaseRef.current = client;
        const {
          data: { user },
        } = await client.auth.getUser();
        if (!user?.email) {
          throw new Error("Not signed in");
        }
        const { error: reauthError } = await client.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (reauthError) {
          const message = "Current password is incorrect.";
          setAuthError(message);
          throw new Error(message);
        }
        const { error } = await client.auth.updateUser({
          password: newPassword,
        });
        if (error) {
          setAuthError(error.message);
          throw error;
        }
      },
      requestPasswordReset: async (email) => {
        setAuthError(null);
        if (mode !== "supabase") {
          throw new Error("Supabase is not configured");
        }
        const client = supabaseRef.current ?? createClient();
        supabaseRef.current = client;
        const origin =
          typeof window !== "undefined"
            ? window.location.origin
            : (() => {
                const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
                if (raw) {
                  try {
                    const o = new URL(raw).origin;
                    if (
                      !o.includes("localhost") &&
                      !o.includes("127.0.0.1")
                    ) {
                      return o;
                    }
                  } catch {
                    /* fall through */
                  }
                }
                return "https://app.reaperpm.com";
              })();
        // Land on /set-password so the browser that requested the reset can
        // exchange the PKCE code (the verifier lives in that browser's cookies).
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/set-password`,
        });
        if (error) {
          setAuthError(error.message);
          throw error;
        }
      },
      logout: async () => {
        setAuthError(null);
        clearViewAsStorage();
        if (mode === "demo") {
          patch((prev) => ({ ...prev, sessionProfileId: null }));
          return;
        }
        const client = supabaseRef.current ?? createClient();
        await client.auth.signOut();
        setPlatformOnly(false);
        setState(emptySupabaseState());
      },
      resetDemo: async () => {
        if (mode === "demo") {
          const seed = createDemoSeed();
          seed.sessionProfileId = state.sessionProfileId;
          setState(seed);
          return;
        }
        const client = supabaseRef.current ?? createClient();
        if (!state.organization.id) return;
        await seedDemoWorkspace(client, state.organization.id);
        await refreshSupabase(client);
      },
      newId: uid,
      dataStatus: {
        orgTasks: orgTasksStatus,
        orgMilestones: orgMilestonesStatus,
        mentionComments: mentionCommentsStatus,
        projects: projectDataStatus,
        scheduleRange: scheduleRangeLoaded,
      },
      ensureOrgTasks,
      ensureOrgMilestones,
      ensureMentionComments,
      ensureProjectData,
      ensureScheduleRange,
      setActiveRealtimeProjectIds,
      fetchProjectBudgetBurnsRpc,
      fetchMonthlyRetainerYearBarsRpc,
      fetchPersonUtilizationWeeksRpc,
      fetchOrgForecastRpc,
      fetchOrgTaskStatsRpc,
      updateOrganizationName: async (name) => {
        const trimmed = name.trim();
        if (!admin || !trimmed) return;
        patch((prev) => ({
          ...prev,
          organization: { ...prev.organization, name: trimmed },
        }));
        if (mode === "supabase" && supabaseRef.current && state.organization.id) {
          await runRemote(() =>
            updateOrganizationNameRow(
              supabaseRef.current!,
              state.organization.id,
              trimmed,
            ),
          );
        }
      },
      updateOrganizationSlug: async (slug) => {
        const trimmed = slug.trim().toLowerCase();
        if (!admin || !trimmed) return;
        const next = uniqueSlug(trimmed, [], { preferred: trimmed });
        patch((prev) => ({
          ...prev,
          organization: { ...prev.organization, slug: next },
        }));
        if (mode === "supabase" && supabaseRef.current && state.organization.id) {
          await runRemote(() =>
            updateOrganizationSlugRow(
              supabaseRef.current!,
              state.organization.id,
              next,
            ),
          );
        }
      },
      updateProfileRole: async (profileId, role) => {
        if (!manage) return;
        const target = state.profiles.find((p) => p.id === profileId);
        if (!target) return;
        // Managers may only toggle member ↔ manager (not touch admins / grant admin).
        if (!admin) {
          if (target.role === "admin" || role === "admin") {
            throw new Error("Only admins can change admin access");
          }
          if (role !== "member" && role !== "manager") return;
        }
        if (target.role === "admin" && role !== "admin") {
          const adminCount = state.profiles.filter((p) => p.role === "admin").length;
          if (adminCount <= 1) {
            throw new Error("Keep at least one admin on the organization");
          }
        }
        patch((prev) => ({
          ...prev,
          profiles: prev.profiles.map((p) =>
            p.id === profileId ? { ...p, role } : p,
          ),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          await runRemote(() =>
            updateProfileRoleRow(
              supabaseRef.current!,
              profileId,
              role,
              state.organization.id,
            ),
          );
        }
      },
      switchWorkspace: async (slugOrId, options) => {
        if (mode !== "supabase") return;
        const target =
          state.memberships.find(
            (m) =>
              m.organization_id === slugOrId || m.org.slug === slugOrId,
          ) ?? null;
        if (!target) {
          throw new Error("You are not a member of that workspace");
        }
        const client = supabaseRef.current ?? createClient();
        supabaseRef.current = client;

        if (target.organization_id !== state.organization.id) {
          await switchOrganizationRpc(client, target.organization_id);
          const {
            data: { user },
          } = await client.auth.getUser();
          const userId = user?.id ?? state.sessionProfileId;
          if (!userId) {
            throw new Error("Not signed in");
          }
          const [workspace, memberships] = await Promise.all([
            loadOrgBootstrap(client, target.organization_id, userId),
            fetchMemberships(client, userId),
          ]);
          orgTasksScopeRef.current = { all: false, personIds: new Set() };
          orgMilestonesLoadedRef.current = false;
          mentionCommentsLoadedRef.current = new Set();
          mentionCommentByIdRef.current = new Map();
          mentionTaskByIdRef.current = new Map();
          projectReadyRef.current = new Set();
          scheduleRangeLoadedRef.current = null;
          setOrgTasksStatus("idle");
          setOrgMilestonesStatus("idle");
          setMentionCommentsStatus("idle");
          setProjectDataStatus({});
          setScheduleRangeLoaded(null);
          setState({ ...workspace, memberships });
        }

        const currentSlug = state.organization.slug;
        const nextSlug = target.org.slug;
        let dest = `/${nextSlug}/dashboard`;
        if (options?.preservePath && pathname && currentSlug) {
          dest = workspacePathAfterSwitch(pathname, currentSlug, nextSlug);
        }
        if (pathname !== dest) {
          router.replace(dest);
        }
      },
      upsertClient: (client) => {
        let row = withOrg(client) as Client;
        let projectsToSync: Project[] = [];
        patch((prev) => {
          const existing = prev.clients.find((c) => c.id === row.id);
          const nameChanged = Boolean(
            existing && existing.name !== row.name,
          );
          const siblingSlugs = prev.clients
            .filter((c) => c.id !== row.id)
            .map((c) => c.slug)
            .filter(Boolean);
          const slug = uniqueSlug(row.name || "client", siblingSlugs, {
            preferred:
              existing && !nameChanged
                ? row.slug || existing.slug
                : null,
            exclude: existing?.slug,
          });
          row = { ...row, slug };
          const projects = prev.projects.map((p) => {
            if (p.client_id !== row.id || p.color === row.color) return p;
            return { ...p, color: row.color };
          });
          projectsToSync = projects.filter(
            (p) =>
              p.client_id === row.id &&
              prev.projects.find((x) => x.id === p.id)?.color !== p.color,
          );
          return {
            ...prev,
            clients: existing
              ? prev.clients.map((c) => (c.id === row.id ? row : c))
              : [...prev.clients, row],
            projects,
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          const clientDb = supabaseRef.current;
          runRemoteSoft(async () => {
            await upsertClientRow(clientDb, row);
            for (const p of projectsToSync) {
              await upsertProjectRow(clientDb, p);
            }
          });
        }
      },
      deleteClient: (id) => {
        patch((prev) => ({
          ...prev,
          clients: prev.clients.filter((c) => c.id !== id),
          projects: prev.projects.map((p) =>
            p.client_id === id ? { ...p, client_id: null } : p,
          ),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() => deleteClientRow(supabaseRef.current!, id));
        }
      },
      upsertProject: async (project) => {
        const inherited = (() => {
          if (!project.client_id) return project.color;
          const client = state.clients.find((c) => c.id === project.client_id);
          return client?.color ?? project.color;
        })();
        const existing = state.projects.find((p) => p.id === project.id);
        const nameChanged = Boolean(
          existing && existing.name !== project.name,
        );
        const clientChanged = Boolean(
          existing &&
            (existing.client_id ?? null) !== (project.client_id ?? null),
        );
        const siblingSlugs = state.projects
          .filter(
            (p) =>
              p.id !== project.id &&
              (p.client_id ?? null) === (project.client_id ?? null),
          )
          .map((p) => p.slug)
          .filter(Boolean);
        const slug = uniqueSlug(project.name || "project", siblingSlugs, {
          preferred:
            existing && !nameChanged && !clientChanged
              ? project.slug || existing.slug
              : null,
          exclude: existing?.slug,
        });
        const row = withOrg({
          ...project,
          color: inherited,
          slug,
        }) as Project;
        // Persist remotely first so a failed "none" budget type does not
        // briefly show as saved then snap back after refresh.
        if (mode === "supabase" && supabaseRef.current) {
          await runRemote(() =>
            upsertProjectRow(supabaseRef.current!, row),
          );
        }
        patch((prev) => {
          const exists = prev.projects.some((p) => p.id === row.id);
          return {
            ...prev,
            projects: exists
              ? prev.projects.map((p) => (p.id === row.id ? row : p))
              : [...prev.projects, row],
          };
        });
        // Seed Existing Website essential from the client's company website.
        if (!existing && row.client_id) {
          const client = state.clients.find((c) => c.id === row.client_id);
          const raw = client?.company_website?.trim() ?? "";
          if (raw) {
            const href =
              sanitizeExternalUrl(raw) ??
              (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
            if (href) {
              const asset = {
                id: uid("asset"),
                organization_id: orgId,
                project_id: row.id,
                kind: "website",
                label: "Existing Website",
                url: href,
                body: "",
                sort_order: 0,
                hide_from_client: false,
              } satisfies ProjectAsset;
              noteLocalWrite("project_assets", asset.id);
              patch((prev) => ({
                ...prev,
                project_assets: [...prev.project_assets, asset],
              }));
              if (mode === "supabase" && supabaseRef.current) {
                runRemoteSoft(() =>
                  upsertProjectAssetRow(supabaseRef.current!, asset),
                );
              }
            }
          }
        }
        return row;
      },
      clearProjectSandboxTrackedData: async (projectId) => {
        if (mode === "supabase" && supabaseRef.current) {
          await runRemote(() =>
            clearProjectSandboxTrackedDataRows(
              supabaseRef.current!,
              projectId,
            ),
          );
        }
        patch((prev) => ({
          ...prev,
          milestones: prev.milestones.filter((m) => m.project_id !== projectId),
        }));
        return {
          start_date: null,
          end_date: null,
          budget_hours: null,
          budget_amount: null,
          budget_mode: "none" as const,
          budget_monthly_reset: false as const,
          manager_person_id: null,
        };
      },
      setProjectMembers: async (projectId, members) => {
        const orgId = state.organization.id;
        const normalized = members.map((m) =>
          typeof m === "string"
            ? {
                person_id: m,
                contractor_mode: null as ProjectMember["contractor_mode"],
                contractor_fixed_fee: null as number | null,
                contractor_hours: null as number | null,
              }
            : {
                person_id: m.person_id,
                contractor_mode: m.contractor_mode ?? null,
                contractor_fixed_fee: m.contractor_fixed_fee ?? null,
                contractor_hours: m.contractor_hours ?? null,
              },
        );
        const seen = new Set<string>();
        const unique = normalized.filter((m) => {
          if (seen.has(m.person_id)) return false;
          seen.add(m.person_id);
          return true;
        });
        const rows = unique.map((m) => ({
          project_id: projectId,
          person_id: m.person_id,
          organization_id: orgId,
          contractor_mode: m.contractor_mode,
          contractor_fixed_fee: m.contractor_fixed_fee,
          contractor_hours: m.contractor_hours,
        }));
        if (mode === "supabase" && supabaseRef.current) {
          await runRemote(() =>
            setProjectMembersRows(
              supabaseRef.current!,
              projectId,
              orgId,
              unique,
            ),
          );
        }
        patch((prev) => ({
          ...prev,
          project_members: [
            ...prev.project_members.filter((m) => m.project_id !== projectId),
            ...rows,
          ],
        }));
      },
      deleteProject: (id) => {
        patch((prev) => ({
          ...prev,
          projects: prev.projects.filter((p) => p.id !== id),
          assignments: prev.assignments.filter((a) => a.project_id !== id),
          project_members: prev.project_members.filter(
            (m) => m.project_id !== id,
          ),
          milestones: prev.milestones.filter((m) => m.project_id !== id),
          project_favorites: prev.project_favorites.filter(
            (f) => f.project_id !== id,
          ),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() => deleteProjectRow(supabaseRef.current!, id));
        }
      },
      toggleProjectFavorite: (projectId) => {
        const profileId = state.sessionProfileId;
        if (!profileId || !state.organization.id) return;
        const existing = state.project_favorites.find(
          (f) => f.profile_id === profileId && f.project_id === projectId,
        );
        if (existing) {
          patch((prev) => ({
            ...prev,
            project_favorites: prev.project_favorites.filter(
              (f) => f.id !== existing.id,
            ),
          }));
          if (mode === "supabase" && supabaseRef.current) {
            runRemoteSoft(() =>
              deleteProjectFavoriteRow(supabaseRef.current!, existing.id),
            );
          }
          return;
        }
        const maxOrder = state.project_favorites
          .filter((f) => f.profile_id === profileId)
          .reduce((max, f) => Math.max(max, f.sort_order), -1);
        const row: ProjectFavorite = {
          id: uid("pfav"),
          organization_id: state.organization.id,
          profile_id: profileId,
          project_id: projectId,
          sort_order: maxOrder + 1,
          created_at: new Date().toISOString(),
        };
        patch((prev) => ({
          ...prev,
          project_favorites: [...prev.project_favorites, row],
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            upsertProjectFavoriteRow(supabaseRef.current!, row),
          );
        }
      },
      reorderProjectFavorites: (projectIds) => {
        const profileId = state.sessionProfileId;
        if (!profileId) return;
        const byProject = new Map(
          state.project_favorites
            .filter((f) => f.profile_id === profileId)
            .map((f) => [f.project_id, f]),
        );
        const nextRows: ProjectFavorite[] = [];
        projectIds.forEach((projectId, index) => {
          const existing = byProject.get(projectId);
          if (!existing) return;
          nextRows.push({ ...existing, sort_order: index });
          byProject.delete(projectId);
        });
        // Keep any leftovers at the end (shouldn't happen in normal UI).
        for (const leftover of byProject.values()) {
          nextRows.push({ ...leftover, sort_order: nextRows.length });
        }
        patch((prev) => ({
          ...prev,
          project_favorites: [
            ...prev.project_favorites.filter((f) => f.profile_id !== profileId),
            ...nextRows,
          ],
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            reorderProjectFavoriteRows(supabaseRef.current!, nextRows),
          );
        }
      },
      upsertPerson: async (person) => {
        const row = withOrg(person) as Person;
        patch((prev) => {
          const exists = prev.people.some((p) => p.id === row.id);
          return {
            ...prev,
            people: exists
              ? prev.people.map((p) => (p.id === row.id ? row : p))
              : [...prev.people, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          // Strip ephemeral signed URLs in the API layer when attachment id is set.
          await runRemote(() => upsertPersonRow(supabaseRef.current!, row));
        }
      },
      updatePersonAvatar: async (personId, avatarUrl, avatarAttachmentId) => {
        let existingAttachmentId: string | null = null;
        patch((prev) => {
          const person = prev.people.find((p) => p.id === personId);
          existingAttachmentId = person?.avatar_attachment_id ?? null;
          const nextAttachmentId =
            avatarAttachmentId !== undefined
              ? avatarAttachmentId
              : avatarUrl
                ? person?.avatar_attachment_id ?? null
                : null;
          return {
            ...prev,
            people: prev.people.map((p) =>
              p.id === personId
                ? {
                    ...p,
                    // Keep a display URL in memory; DB stores attachment id (+ null url for R2).
                    avatar_url: avatarUrl,
                    avatar_attachment_id: nextAttachmentId,
                  }
                : p,
            ),
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          if (avatarUrl === null && !avatarAttachmentId) {
            if (existingAttachmentId) {
              await runRemote(async () => {
                const res = await fetch(
                  `/api/storage/${existingAttachmentId}`,
                  { method: "DELETE" },
                );
                if (!res.ok) {
                  const body = (await res.json().catch(() => ({}))) as {
                    error?: string;
                  };
                  throw new Error(body.error || "Could not remove photo");
                }
              });
            } else {
              await runRemote(() =>
                updatePersonAvatarRow(
                  supabaseRef.current!,
                  personId,
                  null,
                  null,
                ),
              );
            }
          } else {
            await runRemote(() =>
              updatePersonAvatarRow(
                supabaseRef.current!,
                personId,
                avatarAttachmentId ? null : avatarUrl,
                avatarAttachmentId !== undefined
                  ? avatarAttachmentId
                  : undefined,
              ),
            );
          }
        }
      },
      deletePerson: async (id) => {
        if (mode === "supabase") {
          const existing = state.people.find((p) => p.id === id);
          const profileId = existing?.profile_id ?? null;
          const res = await fetch(`/api/people/${encodeURIComponent(id)}`, {
            method: "DELETE",
            credentials: "same-origin",
          });
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            personDeleted?: boolean;
            authUserId?: string | null;
          };
          if (!res.ok) {
            if (body.personDeleted) {
              const client = supabaseRef.current ?? createClient();
              await refreshSupabase(client);
            }
            throw new Error(body.error || "Could not delete person");
          }
          const removedProfileId = body.authUserId ?? profileId;
          patch((prev) => ({
            ...prev,
            people: prev.people.filter((p) => p.id !== id),
            profiles: removedProfileId
              ? prev.profiles.filter((p) => p.id !== removedProfileId)
              : prev.profiles,
            tasks: prev.tasks.map((t) =>
              t.assignee_person_id === id
                ? { ...t, assignee_person_id: null }
                : t,
            ),
            task_comments: removedProfileId
              ? prev.task_comments.map((c) =>
                  c.author_profile_id === removedProfileId
                    ? { ...c, author_profile_id: null }
                    : c,
                )
              : prev.task_comments,
            assignments: prev.assignments.filter((a) => a.person_id !== id),
            leave_days: prev.leave_days.filter((l) => l.person_id !== id),
            project_members: prev.project_members.filter(
              (m) => m.person_id !== id,
            ),
            projects: prev.projects.map((p) =>
              p.manager_person_id === id
                ? { ...p, manager_person_id: null }
                : p,
            ),
            pods: prev.pods.map((pod) =>
              pod.manager_person_id === id
                ? { ...pod, manager_person_id: null }
                : pod,
            ),
            pod_members: prev.pod_members.filter((m) => m.person_id !== id),
          }));
          return;
        }
        patch((prev) => {
          const profileId =
            prev.people.find((p) => p.id === id)?.profile_id ?? null;
          return {
            ...prev,
            people: prev.people.filter((p) => p.id !== id),
            profiles: profileId
              ? prev.profiles.filter((p) => p.id !== profileId)
              : prev.profiles,
            tasks: prev.tasks.map((t) =>
              t.assignee_person_id === id
                ? { ...t, assignee_person_id: null }
                : t,
            ),
            task_comments: profileId
              ? prev.task_comments.map((c) =>
                  c.author_profile_id === profileId
                    ? { ...c, author_profile_id: null }
                    : c,
                )
              : prev.task_comments,
            assignments: prev.assignments.filter((a) => a.person_id !== id),
            leave_days: prev.leave_days.filter((l) => l.person_id !== id),
            project_members: prev.project_members.filter(
              (m) => m.person_id !== id,
            ),
            projects: prev.projects.map((p) =>
              p.manager_person_id === id
                ? { ...p, manager_person_id: null }
                : p,
            ),
            pods: prev.pods.map((pod) =>
              pod.manager_person_id === id
                ? { ...pod, manager_person_id: null }
                : pod,
            ),
            pod_members: prev.pod_members.filter((m) => m.person_id !== id),
          };
        });
      },
      upsertPod: async (pod) => {
        const row: Pod = {
          id: pod.id,
          organization_id: pod.organization_id ?? orgId,
          name: pod.name,
          manager_person_id: pod.manager_person_id ?? null,
          sort_order: pod.sort_order ?? 0,
        };
        noteLocalWrite("pods", row.id);
        if (row.manager_person_id) {
          noteLocalWrite(
            "pod_members",
            `${row.id}:${row.manager_person_id}`,
          );
        }
        patch((prev) => {
          const exists = prev.pods.some((p) => p.id === row.id);
          let members = prev.pod_members;
          if (row.manager_person_id) {
            const hasManager = members.some(
              (m) =>
                m.pod_id === row.id && m.person_id === row.manager_person_id,
            );
            if (!hasManager) {
              members = [
                ...members,
                {
                  pod_id: row.id,
                  person_id: row.manager_person_id,
                  organization_id: row.organization_id,
                },
              ];
            }
          }
          return {
            ...prev,
            pods: exists
              ? prev.pods.map((p) => (p.id === row.id ? row : p))
              : [...prev.pods, row],
            pod_members: members,
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          await runRemote(() => upsertPodRow(supabaseRef.current!, row));
          if (row.manager_person_id) {
            const currentIds = state.pod_members
              .filter((m) => m.pod_id === row.id)
              .map((m) => m.person_id);
            const nextIds = [
              ...new Set([...currentIds, row.manager_person_id]),
            ];
            await runRemote(() =>
              setPodMembersRows(
                supabaseRef.current!,
                row.id,
                row.organization_id,
                nextIds,
              ),
            );
          }
        }
      },
      deletePod: async (id) => {
        noteLocalWrite("pods", id);
        for (const m of state.pod_members.filter((x) => x.pod_id === id)) {
          noteLocalWrite("pod_members", `${m.pod_id}:${m.person_id}`);
        }
        patch((prev) => ({
          ...prev,
          pods: prev.pods.filter((p) => p.id !== id),
          pod_members: prev.pod_members.filter((m) => m.pod_id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          await runRemote(() => deletePodRow(supabaseRef.current!, id));
        }
      },
      setPodMembers: async (podId, personIds) => {
        const orgId = state.organization.id;
        if (!orgId) return;
        const pod = state.pods.find((p) => p.id === podId);
        const unique = [
          ...new Set([
            ...personIds.filter(Boolean),
            ...(pod?.manager_person_id ? [pod.manager_person_id] : []),
          ]),
        ];
        const rows: PodMember[] = unique.map((person_id) => ({
          pod_id: podId,
          person_id,
          organization_id: orgId,
        }));
        const prevMembers = state.pod_members.filter((m) => m.pod_id === podId);
        for (const m of prevMembers) {
          noteLocalWrite("pod_members", `${m.pod_id}:${m.person_id}`);
        }
        for (const person_id of unique) {
          noteLocalWrite("pod_members", `${podId}:${person_id}`);
        }
        patch((prev) => ({
          ...prev,
          pod_members: [
            ...prev.pod_members.filter((m) => m.pod_id !== podId),
            ...rows,
          ],
        }));
        if (mode === "supabase" && supabaseRef.current) {
          await runRemote(() =>
            setPodMembersRows(supabaseRef.current!, podId, orgId, unique),
          );
        }
      },
      setPersonPods: async (personId, podIds) => {
        const orgId = state.organization.id;
        if (!orgId) return;
        const wanted = new Set(podIds);
        // Always keep membership for pods this person manages.
        for (const pod of state.pods) {
          if (pod.manager_person_id === personId) wanted.add(pod.id);
        }
        const previous = state.pod_members.filter(
          (m) => m.person_id === personId,
        );
        for (const m of previous) {
          noteLocalWrite("pod_members", `${m.pod_id}:${m.person_id}`);
        }
        for (const podId of wanted) {
          noteLocalWrite("pod_members", `${podId}:${personId}`);
        }
        patch((prev) => {
          const kept = prev.pod_members.filter((m) => m.person_id !== personId);
          const added: PodMember[] = [...wanted].map((pod_id) => ({
            pod_id,
            person_id: personId,
            organization_id: orgId,
          }));
          return { ...prev, pod_members: [...kept, ...added] };
        });
        if (mode === "supabase" && supabaseRef.current) {
          // Sync each affected pod's full membership remotely.
          const allPodIds = new Set([
            ...state.pod_members
              .filter((m) => m.person_id === personId)
              .map((m) => m.pod_id),
            ...wanted,
          ]);
          for (const podId of allPodIds) {
            const pod = state.pods.find((p) => p.id === podId);
            const others = state.pod_members
              .filter((m) => m.pod_id === podId && m.person_id !== personId)
              .map((m) => m.person_id);
            const next = [
              ...new Set([
                ...others,
                ...(wanted.has(podId) ? [personId] : []),
                ...(pod?.manager_person_id ? [pod.manager_person_id] : []),
              ]),
            ];
            await runRemote(() =>
              setPodMembersRows(supabaseRef.current!, podId, orgId, next),
            );
          }
        }
      },
      upsertAssignment: (assignment) => {
        const now = new Date().toISOString();
        patch((prev) => {
          const existing = prev.assignments.find((a) => a.id === assignment.id);
          const row = {
            ...withOrg(assignment),
            recurrence: assignment.recurrence ?? "none",
            recurrence_exceptions: assignment.recurrence_exceptions ?? [],
            created_at:
              assignment.created_at || existing?.created_at || now,
            edited_at: now,
            edited_by_profile_id: profile?.id ?? null,
          } as Assignment;
          return {
            ...prev,
            assignments: existing
              ? prev.assignments.map((a) => (a.id === row.id ? row : a))
              : [...prev.assignments, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("assignments", assignment.id);
          const existing = state.assignments.find((a) => a.id === assignment.id);
          const row = {
            ...withOrg(assignment),
            recurrence: assignment.recurrence ?? "none",
            recurrence_exceptions: assignment.recurrence_exceptions ?? [],
            created_at:
              assignment.created_at || existing?.created_at || now,
            edited_at: now,
            edited_by_profile_id: profile?.id ?? null,
          } as Assignment;
          runRemoteSoft(() => upsertAssignmentRow(supabaseRef.current!, row));
        }
      },
      deleteAssignment: (id) => {
        patch((prev) => ({
          ...prev,
          assignments: prev.assignments.filter((a) => a.id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("assignments", id);
          runRemoteSoft(() => deleteAssignmentRow(supabaseRef.current!, id));
        }
      },
      upsertMilestone: (milestone) => {
        const row = {
          ...withOrg(milestone),
          approval_enabled: Boolean(milestone.approval_enabled),
          approval_name: milestone.approval_name ?? "",
          approval_email: milestone.approval_email ?? "",
          essential_kind: milestone.essential_kind ?? null,
          essential_label: milestone.essential_label ?? "",
          essential_url: milestone.essential_url ?? "",
          approved_by_name: milestone.approved_by_name ?? null,
          approved_at: milestone.approved_at ?? null,
          approved_by_client: Boolean(milestone.approved_by_client),
        } as Milestone;
        noteLocalWrite("milestones", row.id);
        patch((prev) => {
          const exists = prev.milestones.some((m) => m.id === row.id);
          return {
            ...prev,
            milestones: exists
              ? prev.milestones.map((m) => (m.id === row.id ? row : m))
              : [...prev.milestones, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() => upsertMilestoneRow(supabaseRef.current!, row));
        }
      },
      deleteMilestone: (id) => {
        noteLocalWrite("milestones", id);
        patch((prev) => ({
          ...prev,
          milestones: prev.milestones.filter((m) => m.id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() => deleteMilestoneRow(supabaseRef.current!, id));
        }
      },
      upsertLeave: (leave) => {
        const kindNorm = normalizeLeaveKind(leave.kind);
        const row = {
          ...withOrg(leave),
          kind: kindNorm,
          hours_per_day: isAlwaysFullDayKind(kindNorm)
            ? null
            : leave.hours_per_day,
        } as LeaveDay;

        let remoteLeaves: LeaveDay[] = [];
        let remoteUpserts: Assignment[] = [];
        let remoteDeletes: string[] = [];

        patch((prev) => {
          const byPersonDate = prev.leave_days.find(
            (l) =>
              l.person_id === row.person_id &&
              l.date === row.date &&
              l.id !== row.id,
          );
          const leaveRow = byPersonDate
            ? { ...row, id: byPersonDate.id }
            : row;
          remoteLeaves = [leaveRow];

          let leave_days = prev.leave_days.some((l) => l.id === leaveRow.id)
            ? prev.leave_days.map((l) => (l.id === leaveRow.id ? leaveRow : l))
            : [...prev.leave_days, leaveRow];
          leave_days = leave_days.filter(
            (l) =>
              l.id === leaveRow.id ||
              !(l.person_id === leaveRow.person_id && l.date === leaveRow.date),
          );

          let assignments = prev.assignments;
          if (leaveRow.status === "approved" && isFullDayLeave(leaveRow)) {
            const ov = applyFullDayLeaveOverride(
              prev.assignments,
              leaveRow.person_id,
              leaveRow.date,
              uid,
            );
            const actorId = profile?.id ?? null;
            remoteUpserts = ov.upserts.map((a) =>
              stampAssignmentEdit(a, actorId),
            );
            remoteDeletes = ov.deletes;
            assignments = prev.assignments.filter(
              (a) => !ov.deletes.includes(a.id),
            );
            for (const a of remoteUpserts) {
              const idx = assignments.findIndex((x) => x.id === a.id);
              if (idx >= 0) assignments[idx] = a;
              else assignments.push(a);
            }
          }

          return { ...prev, leave_days, assignments };
        });

        if (mode === "supabase" && supabaseRef.current) {
          const client = supabaseRef.current;
          // Capture payloads now — do not close over vars mutated by later patches.
          const leavesToWrite = [...remoteLeaves];
          const asgDeletes = [...remoteDeletes];
          const asgUpserts = [...remoteUpserts];
          for (const l of leavesToWrite) noteLocalWrite("leave_days", l.id);
          for (const id of asgDeletes) noteLocalWrite("assignments", id);
          for (const a of asgUpserts) noteLocalWrite("assignments", a.id);
          runRemoteSoft(async () => {
            for (const l of leavesToWrite) {
              await upsertLeaveRow(client, l);
            }
            for (const id of asgDeletes) {
              await deleteAssignmentRow(client, id);
            }
            for (const a of asgUpserts) {
              if (!asgDeletes.includes(a.id)) {
                await upsertAssignmentRow(client, withOrg(a) as Assignment);
              }
            }
          });
        }
      },
      setLeaveBlock: ({
        personId,
        startDate,
        endDate,
        kind,
        hours_per_day,
        notes,
        previousDayIds = [],
      }) => {
        const rangeStart = startDate <= endDate ? startDate : endDate;
        const rangeEnd = startDate <= endDate ? endDate : startDate;
        const dates = workingDaysBetween(rangeStart, rangeEnd);
        const kindNorm = normalizeLeaveKind(kind);
        const notesNorm = notes ?? "";

        const payload: {
          rows: LeaveDay[];
          leaveDeleteIds: string[];
          asgUpserts: Assignment[];
          asgDeletes: string[];
        } = {
          rows: [],
          leaveDeleteIds: [],
          asgUpserts: [],
          asgDeletes: [],
        };

        patch((prev) => {
          const prevIdSet = new Set(previousDayIds);
          const dateSet = new Set(dates);
          const reuseIdByDate = new Map<string, string>();
          for (const l of prev.leave_days) {
            if (l.person_id !== personId) continue;
            if (prevIdSet.has(l.id) || dateSet.has(l.date)) {
              if (!reuseIdByDate.has(l.date)) {
                reuseIdByDate.set(l.date, l.id);
              }
            }
          }

          const removeIds = new Set<string>();
          for (const l of prev.leave_days) {
            if (l.person_id !== personId) continue;
            if (prevIdSet.has(l.id) || dateSet.has(l.date)) {
              removeIds.add(l.id);
            }
          }

          const hoursNorm = isAlwaysFullDayKind(kindNorm)
            ? null
            : hours_per_day;
          const newRows: LeaveDay[] = dates.map((date) => ({
            id: reuseIdByDate.get(date) ?? uid("leave"),
            organization_id: prev.organization.id || orgId,
            person_id: personId,
            date,
            kind: kindNorm,
            status: "approved" as const,
            hours_per_day: hoursNorm,
            notes: notesNorm,
          }));
          const leaveDeleteIds = [...removeIds].filter(
            (id) => !newRows.some((r) => r.id === id),
          );

          let leave_days = prev.leave_days.filter((l) => !removeIds.has(l.id));
          leave_days = [...leave_days, ...newRows];

          let assignments = prev.assignments;
          let asgUpserts: Assignment[] = [];
          let asgDeletes: string[] = [];
          // Full Day / Statutory / Sick / Training clear overlapping work;
          // Partial Day leaves assignments alone.
          if (newRows.some((r) => isFullDayLeave(r))) {
            const ov = applyFullDayLeaveOverrideForDates(
              prev.assignments,
              personId,
              dates,
              uid,
            );
            const actorId = profile?.id ?? null;
            asgUpserts = ov.upserts.map((a) => stampAssignmentEdit(a, actorId));
            asgDeletes = ov.deletes;
            assignments = prev.assignments.filter(
              (a) => !ov.deletes.includes(a.id),
            );
            for (const a of asgUpserts) {
              const idx = assignments.findIndex((x) => x.id === a.id);
              if (idx >= 0) assignments[idx] = a;
              else assignments.push(a);
            }
          }

          payload.rows = newRows;
          payload.leaveDeleteIds = leaveDeleteIds;
          payload.asgUpserts = asgUpserts;
          payload.asgDeletes = asgDeletes;

          return { ...prev, leave_days, assignments };
        });

        if (mode === "supabase" && supabaseRef.current) {
          const client = supabaseRef.current;
          const leavesToWrite = [...payload.rows];
          const leaveDeleteIds = [...payload.leaveDeleteIds];
          const asgDeletes = [...payload.asgDeletes];
          const asgUpserts = [...payload.asgUpserts];
          const epoch = ++leaveWriteEpochRef.current;
          for (const id of leaveDeleteIds) noteLocalWrite("leave_days", id);
          for (const l of leavesToWrite) noteLocalWrite("leave_days", l.id);
          for (const id of asgDeletes) noteLocalWrite("assignments", id);
          for (const a of asgUpserts) noteLocalWrite("assignments", a.id);
          runRemoteSoft(async () => {
            for (const id of leaveDeleteIds) {
              await deleteLeaveRow(client, id);
            }
            for (const l of leavesToWrite) {
              if (leaveWriteEpochRef.current !== epoch) break;
              await upsertLeaveRow(client, l);
            }
            // Create/edit was superseded (e.g. undo) — remove what we upserted.
            if (leaveWriteEpochRef.current !== epoch) {
              for (const l of leavesToWrite) {
                noteLocalWrite("leave_days", l.id);
                await deleteLeaveRow(client, l.id);
              }
              return;
            }
            for (const id of asgDeletes) {
              await deleteAssignmentRow(client, id);
            }
            for (const a of asgUpserts) {
              if (!asgDeletes.includes(a.id)) {
                await upsertAssignmentRow(client, withOrg(a) as Assignment);
              }
            }
          });
        }

        return {
          rows: payload.rows,
          asgUpserts: payload.asgUpserts,
          asgDeletes: payload.asgDeletes,
        };
      },
      deleteLeave: (id) => {
        leaveWriteEpochRef.current += 1;
        patch((prev) => ({
          ...prev,
          leave_days: prev.leave_days.filter((l) => l.id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("leave_days", id);
          runRemoteSoft(() => deleteLeaveRow(supabaseRef.current!, id));
        }
      },
      applyLeaveUndo: ({
        restoreLeaves,
        removeLeaveIds,
        removeLeaveKeys = [],
        restoreAssignments,
        removeAssignmentIds,
      }) => {
        const removeLeaveSet = new Set(removeLeaveIds);
        const removeKeySet = new Set(removeLeaveKeys);
        const removeAsgSet = new Set(removeAssignmentIds);
        const epoch = ++leaveWriteEpochRef.current;
        patch((prev) => {
          let leave_days = prev.leave_days.filter(
            (l) =>
              !removeLeaveSet.has(l.id) &&
              !removeKeySet.has(`${l.person_id}:${l.date}`),
          );
          for (const leave of restoreLeaves) {
            const row = { ...leave };
            const idx = leave_days.findIndex((l) => l.id === row.id);
            if (idx >= 0) leave_days[idx] = row;
            else leave_days.push(row);
            leave_days = leave_days.filter(
              (l) =>
                l.id === row.id ||
                !(l.person_id === row.person_id && l.date === row.date),
            );
          }

          let assignments = prev.assignments.filter(
            (a) => !removeAsgSet.has(a.id),
          );
          for (const assignment of restoreAssignments) {
            const idx = assignments.findIndex((a) => a.id === assignment.id);
            if (idx >= 0) assignments[idx] = assignment;
            else assignments.push(assignment);
          }

          return { ...prev, leave_days, assignments };
        });

        if (mode === "supabase" && supabaseRef.current) {
          const client = supabaseRef.current;
          // Resolve current ids for person+date keys in case realtime remapped them.
          const idsToDelete = new Set(removeLeaveIds);
          for (const key of removeLeaveKeys) {
            const [personId, date] = key.split(":");
            for (const l of state.leave_days) {
              if (l.person_id === personId && l.date === date) {
                idsToDelete.add(l.id);
              }
            }
          }
          for (const id of idsToDelete) noteLocalWrite("leave_days", id);
          for (const l of restoreLeaves) noteLocalWrite("leave_days", l.id);
          for (const id of removeAssignmentIds)
            noteLocalWrite("assignments", id);
          for (const a of restoreAssignments)
            noteLocalWrite("assignments", a.id);
          runRemoteSoft(async () => {
            for (const id of idsToDelete) {
              await deleteLeaveRow(client, id);
            }
            if (leaveWriteEpochRef.current !== epoch) return;
            for (const l of restoreLeaves) {
              if (leaveWriteEpochRef.current !== epoch) return;
              await upsertLeaveRow(client, l);
            }
            for (const id of removeAssignmentIds) {
              await deleteAssignmentRow(client, id);
            }
            for (const a of restoreAssignments) {
              if (!removeAssignmentIds.includes(a.id)) {
                await upsertAssignmentRow(client, withOrg(a) as Assignment);
              }
            }
          });
        }
      },
      upsertHolidayCalendar: (calendar) => {
        const row = withOrg(calendar) as HolidayCalendar;
        patch((prev) => {
          const exists = prev.holiday_calendars.some((c) => c.id === row.id);
          return {
            ...prev,
            holiday_calendars: exists
              ? prev.holiday_calendars.map((c) => (c.id === row.id ? row : c))
              : [...prev.holiday_calendars, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            upsertHolidayCalendarRow(supabaseRef.current!, row),
          );
        }
      },
      deleteHolidayCalendar: (id) => {
        patch((prev) => ({
          ...prev,
          holiday_calendars: prev.holiday_calendars.filter((c) => c.id !== id),
          holiday_calendar_days: prev.holiday_calendar_days.filter(
            (d) => d.calendar_id !== id,
          ),
          people: prev.people.map((p) =>
            p.holiday_calendar_id === id
              ? { ...p, holiday_calendar_id: null }
              : p,
          ),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            deleteHolidayCalendarRow(supabaseRef.current!, id),
          );
        }
      },
      upsertHolidayCalendarDay: (day) => {
        const row = withOrg(day) as HolidayCalendarDay;
        patch((prev) => {
          const exists = prev.holiday_calendar_days.some((d) => d.id === row.id);
          return {
            ...prev,
            holiday_calendar_days: exists
              ? prev.holiday_calendar_days.map((d) =>
                  d.id === row.id ? row : d,
                )
              : [...prev.holiday_calendar_days, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            upsertHolidayCalendarDayRow(supabaseRef.current!, row),
          );
        }
      },
      deleteHolidayCalendarDay: (id) => {
        patch((prev) => ({
          ...prev,
          holiday_calendar_days: prev.holiday_calendar_days.filter(
            (d) => d.id !== id,
          ),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            deleteHolidayCalendarDayRow(supabaseRef.current!, id),
          );
        }
      },
      applyHolidayCalendar: async (calendarId) => {
        const days = state.holiday_calendar_days
          .filter((d) => d.calendar_id === calendarId)
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date));
        const people = state.people.filter(
          (p) => p.holiday_calendar_id === calendarId,
        );
        if (days.length === 0 || people.length === 0) return 0;

        const rangeStart = days[0].date;
        const rangeEnd = days[days.length - 1].date;
        const organizationId = state.organization.id;
        const personIds = new Set(people.map((p) => p.id));

        // Prefetch leave + assignments for the holiday window so we reuse
        // existing leave ids and can trim bookings even when Settings is open
        // (schedule viewport may not have those weeks loaded).
        let fetchedAssignments: Assignment[] = [];
        let fetchedLeave: LeaveDay[] = [];
        if (mode === "supabase" && supabaseRef.current && organizationId) {
          const client = supabaseRef.current;
          try {
            const [assignments, leave_days] = await Promise.all([
              loadAssignmentsForRange(
                client,
                organizationId,
                rangeStart,
                rangeEnd,
              ),
              loadLeaveForRange(client, organizationId, rangeStart, rangeEnd),
            ]);
            fetchedAssignments = assignments.filter((a) =>
              personIds.has(a.person_id),
            );
            fetchedLeave = leave_days.filter((l) => personIds.has(l.person_id));
          } catch (err) {
            console.error("applyHolidayCalendar: failed to load range", err);
            throw err instanceof Error
              ? err
              : new Error("Failed to load schedule data for holiday apply");
          }
        }

        let created: LeaveDay[] = [];
        let remoteUpserts: Assignment[] = [];
        let remoteDeletes: string[] = [];

        patch((prev) => {
          const asgById = new Map(prev.assignments.map((a) => [a.id, a]));
          for (const a of fetchedAssignments) asgById.set(a.id, a);
          let assignments = [...asgById.values()];

          const leaveById = new Map(prev.leave_days.map((l) => [l.id, l]));
          for (const l of fetchedLeave) leaveById.set(l.id, l);
          let leave_days = [...leaveById.values()];

          const newLeaves: LeaveDay[] = [];
          const upsertMap = new Map<string, Assignment>();
          const deleteSet = new Set<string>();
          const leaveByPersonDate = new Map<string, LeaveDay>(
            leave_days.map((l) => [`${l.person_id}|${l.date}`, l]),
          );

          function applyTrim(personId: string, date: string) {
            const ov = applyFullDayLeaveOverride(
              assignments,
              personId,
              date,
              uid,
            );
            const actorId = profile?.id ?? null;
            for (const id of ov.deletes) {
              deleteSet.add(id);
              upsertMap.delete(id);
            }
            assignments = assignments.filter((a) => !ov.deletes.includes(a.id));
            for (const a of ov.upserts) {
              const stamped = stampAssignmentEdit(a, actorId);
              upsertMap.set(stamped.id, stamped);
              const idx = assignments.findIndex((x) => x.id === stamped.id);
              if (idx >= 0) assignments[idx] = stamped;
              else assignments.push(stamped);
            }
          }

          for (const person of people) {
            for (const day of days) {
              const key = `${person.id}|${day.date}`;
              const existing = leaveByPersonDate.get(key);

              if (existing) {
                // Slot already occupied — never stack a second leave row.
                if (existing.kind === "holiday") {
                  const leaveRow: LeaveDay = {
                    ...existing,
                    status: "approved",
                    hours_per_day: null,
                    notes: day.name?.trim() || existing.notes || "",
                  };
                  leave_days = leave_days.map((l) =>
                    l.id === existing.id ? leaveRow : l,
                  );
                  leaveByPersonDate.set(key, leaveRow);
                  newLeaves.push(leaveRow);
                  applyTrim(person.id, day.date);
                }
                // Other leave kinds keep the day; skip holiday booking.
                continue;
              }

              const leaveRow: LeaveDay = {
                id: uid("leave"),
                organization_id: prev.organization.id,
                person_id: person.id,
                date: day.date,
                kind: "holiday",
                status: "approved",
                hours_per_day: null,
                notes: day.name ?? "",
              };
              newLeaves.push(leaveRow);
              leave_days.push(leaveRow);
              leaveByPersonDate.set(key, leaveRow);
              applyTrim(person.id, day.date);
            }
          }

          created = newLeaves;
          remoteUpserts = [...upsertMap.values()];
          remoteDeletes = [...deleteSet];
          return { ...prev, leave_days, assignments };
        });

        if (mode === "supabase" && supabaseRef.current) {
          const client = supabaseRef.current;
          for (const leave of created) noteLocalWrite("leave_days", leave.id);
          for (const id of remoteDeletes) noteLocalWrite("assignments", id);
          for (const a of remoteUpserts) noteLocalWrite("assignments", a.id);
          await runRemote(async () => {
            for (const leave of created) {
              await upsertLeaveRow(client, leave);
            }
            for (const id of remoteDeletes) {
              await deleteAssignmentRow(client, id);
            }
            for (const a of remoteUpserts) {
              if (!remoteDeletes.includes(a.id)) {
                await upsertAssignmentRow(client, withOrg(a) as Assignment);
              }
            }
          });
        }
        return created.length;
      },
      upsertProjectAsset: (asset) => {
        const row = {
          ...withOrg(asset),
          hide_from_client: Boolean(asset.hide_from_client),
        } as ProjectAsset;
        noteLocalWrite("project_assets", row.id);
        patch((prev) => {
          const exists = prev.project_assets.some((a) => a.id === row.id);
          return {
            ...prev,
            project_assets: exists
              ? prev.project_assets.map((a) => (a.id === row.id ? row : a))
              : [...prev.project_assets, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            upsertProjectAssetRow(supabaseRef.current!, row),
          );
        }
      },
      deleteProjectAsset: (id) => {
        noteLocalWrite("project_assets", id);
        patch((prev) => ({
          ...prev,
          project_assets: prev.project_assets.filter((a) => a.id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            deleteProjectAssetRow(supabaseRef.current!, id),
          );
        }
      },
      upsertTaskList: (list) => {
        const row = {
          ...withOrg(list),
          hide_from_client: Boolean(list.hide_from_client),
        } as TaskList;
        patch((prev) => {
          const exists = prev.task_lists.some((l) => l.id === row.id);
          return {
            ...prev,
            task_lists: exists
              ? prev.task_lists.map((l) => (l.id === row.id ? row : l))
              : [...prev.task_lists, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("task_lists", row.id);
          runRemoteSoft(() => upsertTaskListRow(supabaseRef.current!, row));
        }
      },
      deleteTaskList: (id) => {
        noteLocalWrite("task_lists", id);
        patch((prev) => ({
          ...prev,
          task_lists: prev.task_lists.filter((l) => l.id !== id),
          tasks: prev.tasks.filter((t) => t.list_id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() => deleteTaskListRow(supabaseRef.current!, id));
        }
      },
      upsertTask: (task) => {
        // Managers/PMs edit details. Members may only change status (RLS+trigger enforce).
        const existing = state.tasks.find((t) => t.id === task.id);
        const project =
          state.projects.find((p) => p.id === task.project_id) ?? null;
        const mayEditDetails = canEditProject(project, {
          canManage: manage,
          myPersonId: myPerson?.id,
          projectMembers: state.project_members,
        });
        if (!mayEditDetails) {
          if (!existing) return;
          const statusOnly =
            task.status !== existing.status &&
            task.title === existing.title &&
            task.project_id === existing.project_id &&
            task.list_id === existing.list_id &&
            task.parent_id === existing.parent_id &&
            task.assignee_person_id === existing.assignee_person_id &&
            task.start_date === existing.start_date &&
            task.due_date === existing.due_date &&
            task.notes === existing.notes &&
            task.sort_order === existing.sort_order &&
            Boolean(task.is_divider) === Boolean(existing.is_divider);
          if (!statusOnly) return;
        }
        const now = new Date().toISOString();
        const actorId = profile?.id ?? null;
        let row = withOrg(task) as Task;
        if (!existing) {
          row = {
            ...row,
            created_at: row.created_at || now,
            created_by_profile_id: row.created_by_profile_id ?? actorId,
            edited_at: null,
            edited_by_profile_id: null,
            status_changed_at: row.status_changed_at ?? null,
            status_changed_by_profile_id:
              row.status_changed_by_profile_id ?? null,
          };
        } else {
          const statusChanged = existing.status !== row.status;
          row = {
            ...row,
            created_at: existing.created_at || row.created_at || now,
            created_by_profile_id:
              existing.created_by_profile_id ??
              row.created_by_profile_id ??
              null,
            edited_at: now,
            edited_by_profile_id: actorId,
            status_changed_at: statusChanged
              ? now
              : (existing.status_changed_at ?? row.status_changed_at ?? null),
            status_changed_by_profile_id: statusChanged
              ? actorId
              : (existing.status_changed_by_profile_id ??
                row.status_changed_by_profile_id ??
                null),
          };
        }
        patch((prev) => {
          const exists = prev.tasks.some((t) => t.id === row.id);
          return {
            ...prev,
            tasks: exists
              ? prev.tasks.map((t) => (t.id === row.id ? row : t))
              : [...prev.tasks, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("tasks", row.id);
          runRemoteSoft(() => upsertTaskRow(supabaseRef.current!, row));
        }
        // Demo: notify assigner when assignee moves Active → In Review (supabase uses DB trigger).
        if (
          mode === "demo" &&
          existing &&
          isTaskInReviewTransition(existing, row) &&
          assigneeSubmittedTaskForReview(row, state.people, actorId)
        ) {
          const project =
            state.projects.find((p) => p.id === row.project_id) ?? null;
          const assignerPersonId = taskAssignerPersonId(
            row,
            state.people,
            project,
          );
          if (
            assignerPersonId &&
            assignerPersonId !== row.assignee_person_id
          ) {
            const assignee = state.people.find(
              (p) => p.id === row.assignee_person_id,
            );
            const client = project?.client_id
              ? state.clients.find((c) => c.id === project.client_id)
              : null;
            const bulletin = buildTaskInReviewBulletin({
              id: uid("bulletin"),
              organizationId: row.organization_id,
              projectId: row.project_id,
              taskId: row.id,
              assignerPersonId,
              taskTitle: row.title,
              assigneeName: assignee?.name ?? null,
              clientName: client?.name ?? null,
              projectName: project?.name ?? "Project",
              createdAt: now,
            });
            patch((prev) => ({
              ...prev,
              bulletins: [bulletin, ...prev.bulletins],
            }));
            const recipients = bulletinUnreadRecipientProfileIds(
              bulletin,
              state.people,
              state.profiles,
              { pods: state.pods, podMembers: state.pod_members },
            );
            const myId = profile?.id;
            if (myId && recipients.includes(myId)) {
              patch((prev) =>
                prev.unread_bulletin_ids.includes(bulletin.id)
                  ? prev
                  : {
                      ...prev,
                      unread_bulletin_ids: [
                        ...prev.unread_bulletin_ids,
                        bulletin.id,
                      ],
                    },
              );
            }
          }
        }
        // Desktop notify newly @mentioned people in task notes (org broadcast).
        const prevMentionIds = new Set(
          extractMentionPersonIds(existing?.notes ?? ""),
        );
        const nextMentionIds = extractMentionPersonIds(row.notes ?? "");
        const newlyMentioned = [...nextMentionIds].filter(
          (id) => !prevMentionIds.has(id) && id !== myPerson?.id,
        );
        if (newlyMentioned.length > 0) {
          const payload: TaskNoteMentionBroadcast = {
            personIds: newlyMentioned,
            taskId: row.id,
            projectId: row.project_id,
            taskTitle: row.title,
            authorName:
              myPerson?.name?.trim() ||
              profile?.full_name?.trim() ||
              profile?.email?.trim() ||
              "Someone",
            authorAvatarUrl: myPerson?.avatar_url ?? null,
            authorColor: myPerson ? personAvatarColor(myPerson) : null,
          };
          if (orgChannelRef.current) {
            void orgChannelRef.current.send({
              type: "broadcast",
              event: "task-note-mention",
              payload,
            });
          }
        }
      },
      deleteTask: (id) => {
        patch((prev) => {
          const nextTasks = prev.tasks.filter(
            (t) => t.id !== id && t.parent_id !== id,
          );
          const remainingTaskIds = new Set(nextTasks.map((t) => t.id));
          return {
            ...prev,
            tasks: nextTasks,
            task_comments: prev.task_comments.filter((c) =>
              remainingTaskIds.has(c.task_id),
            ),
            unread_task_threads: prev.unread_task_threads.filter((r) =>
              remainingTaskIds.has(r.task_id),
            ),
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("tasks", id);
          // Await attachment sweep before DB delete so child comments/tasks
          // still exist for the tree query (attachments have no FK cascade).
          runRemoteSoft(async () => {
            try {
              const res = await fetch("/api/storage/cleanup-task", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId: id }),
              });
              if (!res.ok) {
                console.warn(
                  "Task attachment cleanup failed",
                  await res.text().catch(() => res.statusText),
                );
              }
            } catch (err) {
              console.warn("Task attachment cleanup failed", err);
            }
            await deleteTaskRow(supabaseRef.current!, id);
          });
        }
      },
      upsertTaskComment: (comment) => {
        const row = {
          ...withOrg(comment),
          mentioned_person_ids: Array.isArray(comment.mentioned_person_ids)
            ? comment.mentioned_person_ids
            : [],
          reactions: Array.isArray(comment.reactions) ? comment.reactions : [],
        } as TaskComment;
        const task =
          state.tasks.find((t) => t.id === row.task_id) ?? null;
        const project = task
          ? (state.projects.find((p) => p.id === task.project_id) ?? null)
          : null;
        const authorPerson = row.author_profile_id
          ? (state.people.find((p) => p.profile_id === row.author_profile_id) ??
            null)
          : null;
        patch((prev) => {
          const existing = prev.task_comments.find((c) => c.id === row.id);
          const next: TaskComment = {
            ...row,
            reactions: Array.isArray(comment.reactions)
              ? comment.reactions
              : (existing?.reactions ?? []),
          };
          const exists = Boolean(existing);
          const prevMentioned = new Set(existing?.mentioned_person_ids ?? []);
          const nextMentioned = new Set(next.mentioned_person_ids);
          let unread_mentions = prev.unread_mentions.filter(
            (r) =>
              r.comment_id !== next.id || nextMentioned.has(r.person_id),
          );
          for (const person_id of nextMentioned) {
            if (prevMentioned.has(person_id)) continue;
            if (
              unread_mentions.some(
                (r) =>
                  r.comment_id === next.id && r.person_id === person_id,
              )
            ) {
              continue;
            }
            unread_mentions = [
              ...unread_mentions,
              { comment_id: next.id, person_id, read_at: null },
            ];
          }
          let unread_task_threads = prev.unread_task_threads;
          if (mode === "demo") {
            const addThreadUnread = (person_id: string) => {
              if (
                unread_task_threads.some(
                  (r) =>
                    r.task_id === row.task_id && r.person_id === person_id,
                )
              ) {
                return;
              }
              unread_task_threads = [
                ...unread_task_threads,
                { task_id: row.task_id, person_id },
              ];
            };
            if (!exists && task && authorPerson) {
              const commentsForNotify = [
                ...prev.task_comments.filter(
                  (c) => c.task_id === row.task_id && c.id !== next.id,
                ),
                next,
              ];
              for (const person_id of taskThreadNotifyPersonIds(
                task,
                authorPerson.id,
                state.people,
                project,
                commentsForNotify,
              )) {
                addThreadUnread(person_id);
              }
            } else {
              for (const person_id of taskThreadMentionNotifyPersonIds(
                next.mentioned_person_ids,
                authorPerson?.id ?? null,
              )) {
                if (prevMentioned.has(person_id)) continue;
                addThreadUnread(person_id);
              }
            }
          }
          return {
            ...prev,
            task_comments: exists
              ? prev.task_comments.map((c) => (c.id === next.id ? next : c))
              : [...prev.task_comments, next],
            unread_mentions,
            unread_task_threads,
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("task_comments", row.id);
          noteLocalWrite("task_comment_mentions", row.id);
          noteLocalWrite("mention_unreads", row.id);
          runRemoteSoft(() =>
            upsertTaskCommentRow(supabaseRef.current!, row),
          );
        }
      },
      deleteTaskComment: (id) => {
        patch((prev) => ({
          ...prev,
          task_comments: prev.task_comments.filter((c) => c.id !== id),
          unread_mentions: prev.unread_mentions.filter(
            (r) => r.comment_id !== id,
          ),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          cleanupEntityAttachments("comment", id);
          noteLocalWrite("task_comments", id);
          noteLocalWrite("task_comment_mentions", id);
          noteLocalWrite("mention_unreads", id);
          runRemoteSoft(() =>
            deleteTaskCommentRow(supabaseRef.current!, id),
          );
        }
      },
      toggleTaskCommentReaction: (commentId, emoji) => {
        const profileId = profile?.id;
        if (!profileId) return;
        const trimmed = emoji.trim();
        if (!trimmed) return;
        let nextActive = false;
        let organizationId = "";
        patch((prev) => {
          const comment = prev.task_comments.find((c) => c.id === commentId);
          if (!comment) return prev;
          organizationId = comment.organization_id;
          const hasMine = comment.reactions.some(
            (r) => r.profile_id === profileId && r.emoji === trimmed,
          );
          nextActive = !hasMine;
          const reactions = hasMine
            ? comment.reactions.filter(
                (r) =>
                  !(r.profile_id === profileId && r.emoji === trimmed),
              )
            : [...comment.reactions, { emoji: trimmed, profile_id: profileId }];
          return {
            ...prev,
            task_comments: prev.task_comments.map((c) =>
              c.id === commentId ? { ...c, reactions } : c,
            ),
          };
        });
        if (!organizationId) return;
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("task_comment_reactions", `${commentId}:${trimmed}`);
          runRemoteSoft(() =>
            toggleTaskCommentReactionRow(supabaseRef.current!, {
              comment_id: commentId,
              organization_id: organizationId,
              profile_id: profileId,
              emoji: trimmed,
              active: nextActive,
            }),
          );
        }
      },
      upsertBulletin: (bulletin) => {
        if (!manage) return;
        const row = {
          ...withOrg(bulletin),
          task_id: bulletin.task_id ?? null,
          milestone_id: bulletin.milestone_id ?? null,
          tone: bulletin.tone === "success" ? "success" : "default",
        } as Bulletin;
        let isNew = false;
        patch((prev) => {
          const exists = prev.bulletins.some((b) => b.id === row.id);
          isNew = !exists;
          return {
            ...prev,
            bulletins: exists
              ? prev.bulletins.map((b) => (b.id === row.id ? row : b))
              : [...prev.bulletins, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("bulletins", row.id);
          const client = supabaseRef.current;
          runRemoteSoft(async () => {
            await upsertBulletinRow(client, row);
            if (!isNew) return;
            const audienceCtx = {
              pods: state.pods,
              podMembers: state.pod_members,
            };
            const recipients = bulletinUnreadRecipientProfileIds(
              row,
              state.people,
              state.profiles,
              audienceCtx,
            );
            const unreadRows = recipients.map((profile_id) => ({
              bulletin_id: row.id,
              profile_id,
              organization_id: row.organization_id,
            }));
            await seedBulletinUnreadRows(client, unreadRows);
          });
          if (isNew) {
            const myId = profile?.id;
            const recipients = bulletinUnreadRecipientProfileIds(
              row,
              state.people,
              state.profiles,
              { pods: state.pods, podMembers: state.pod_members },
            );
            if (myId && recipients.includes(myId)) {
              patch((prev) =>
                prev.unread_bulletin_ids.includes(row.id)
                  ? prev
                  : {
                      ...prev,
                      unread_bulletin_ids: [
                        ...prev.unread_bulletin_ids,
                        row.id,
                      ],
                    },
              );
            }
          }
        } else if (isNew && mode === "demo") {
          const recipients = bulletinUnreadRecipientProfileIds(
            row,
            state.people,
            state.profiles,
            { pods: state.pods, podMembers: state.pod_members },
          );
          const myId = state.sessionProfileId;
          if (myId && recipients.includes(myId)) {
            patch((prev) =>
              prev.unread_bulletin_ids.includes(row.id)
                ? prev
                : {
                    ...prev,
                    unread_bulletin_ids: [...prev.unread_bulletin_ids, row.id],
                  },
            );
          }
        }
      },
      deleteBulletin: (id) => {
        if (!manage) return;
        patch((prev) => ({
          ...prev,
          bulletins: prev.bulletins.filter((b) => b.id !== id),
          unread_bulletin_ids: prev.unread_bulletin_ids.filter((x) => x !== id),
          dismissed_bulletin_ids: prev.dismissed_bulletin_ids.filter(
            (x) => x !== id,
          ),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("bulletins", id);
          runRemoteSoft(() => deleteBulletinRow(supabaseRef.current!, id));
        }
      },
      dismissBulletin: (id) => {
        const profileId = profile?.id;
        if (!profileId || !id) return;
        patch((prev) => {
          if (!prev.unread_bulletin_ids.includes(id)) return prev;
          return {
            ...prev,
            unread_bulletin_ids: prev.unread_bulletin_ids.filter(
              (x) => x !== id,
            ),
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("bulletin_unreads", id);
          runRemoteSoft(async () => {
            await deleteBulletinUnreadRow(supabaseRef.current!, {
              bulletin_id: id,
              profile_id: profileId,
            });
          });
        }
      },
      dismissBulletinFromBoard: (id) => {
        const profileId = profile?.id;
        const orgId = state.organization.id;
        if (!profileId || !id || !orgId) return;
        patch((prev) => {
          const nextDismissed = prev.dismissed_bulletin_ids.includes(id)
            ? prev.dismissed_bulletin_ids
            : [...prev.dismissed_bulletin_ids, id];
          return {
            ...prev,
            dismissed_bulletin_ids: nextDismissed,
            unread_bulletin_ids: prev.unread_bulletin_ids.filter(
              (x) => x !== id,
            ),
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("bulletin_dismissals", id);
          noteLocalWrite("bulletin_unreads", id);
          runRemoteSoft(async () => {
            await upsertBulletinDismissalRow(supabaseRef.current!, {
              bulletin_id: id,
              profile_id: profileId,
              organization_id: orgId,
            });
            await deleteBulletinUnreadRow(supabaseRef.current!, {
              bulletin_id: id,
              profile_id: profileId,
            });
          });
        }
      },
      dismissMention: (commentId, personId) => {
        if (!commentId || !personId) return;
        patch((prev) => {
          const next = prev.unread_mentions.filter(
            (r) =>
              !(r.comment_id === commentId && r.person_id === personId),
          );
          if (next.length === prev.unread_mentions.length) return prev;
          return { ...prev, unread_mentions: next };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("mention_unreads", `${commentId}:${personId}`);
          runRemoteSoft(async () => {
            await deleteMentionUnreadRow(supabaseRef.current!, {
              comment_id: commentId,
              person_id: personId,
            });
          });
        }
      },
      markMentionRead: (commentId, personId) => {
        if (!commentId || !personId) return;
        const readAt = new Date().toISOString();
        patch((prev) => {
          let changed = false;
          const next = prev.unread_mentions.map((r) => {
            if (r.comment_id !== commentId || r.person_id !== personId) {
              return r;
            }
            if (r.read_at) return r;
            changed = true;
            return { ...r, read_at: readAt };
          });
          if (!changed) return prev;
          return { ...prev, unread_mentions: next };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("mention_unreads", `${commentId}:${personId}`);
          runRemoteSoft(async () => {
            await markMentionReadRow(supabaseRef.current!, {
              comment_id: commentId,
              person_id: personId,
            });
          });
        }
      },
      dismissTaskThreadUnread: (taskId, personId) => {
        if (!taskId || !personId) return;
        patch((prev) => {
          const next = prev.unread_task_threads.filter(
            (r) => !(r.task_id === taskId && r.person_id === personId),
          );
          if (next.length === prev.unread_task_threads.length) return prev;
          return { ...prev, unread_task_threads: next };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("task_thread_unreads", taskId);
          runRemoteSoft(async () => {
            await deleteTaskThreadUnreadRow(supabaseRef.current!, {
              task_id: taskId,
              person_id: personId,
            });
          });
        }
      },
      upsertProjectTemplate: (template) => {
        const row = withOrg(template) as ProjectTemplate;
        patch((prev) => {
          const exists = prev.project_templates.some((t) => t.id === row.id);
          return {
            ...prev,
            project_templates: exists
              ? prev.project_templates.map((t) =>
                  t.id === row.id ? row : t,
                )
              : [...prev.project_templates, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            upsertProjectTemplateRow(supabaseRef.current!, row),
          );
        }
      },
      deleteProjectTemplate: (id) => {
        patch((prev) => ({
          ...prev,
          project_templates: prev.project_templates.filter(
            (t) => t.id !== id,
          ),
          template_milestones: prev.template_milestones.filter(
            (m) => m.template_id !== id,
          ),
          template_task_lists: prev.template_task_lists.filter(
            (l) => l.template_id !== id,
          ),
          template_tasks: prev.template_tasks.filter(
            (t) => t.template_id !== id,
          ),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            deleteProjectTemplateRow(supabaseRef.current!, id),
          );
        }
      },
      upsertTemplateMilestone: (milestone) => {
        const row = withOrg(milestone) as TemplateMilestone;
        patch((prev) => {
          const exists = prev.template_milestones.some(
            (m) => m.id === row.id,
          );
          return {
            ...prev,
            template_milestones: exists
              ? prev.template_milestones.map((m) =>
                  m.id === row.id ? row : m,
                )
              : [...prev.template_milestones, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            upsertTemplateMilestoneRow(supabaseRef.current!, row),
          );
        }
      },
      deleteTemplateMilestone: (id) => {
        patch((prev) => ({
          ...prev,
          template_milestones: prev.template_milestones.filter(
            (m) => m.id !== id,
          ),
          template_task_lists: prev.template_task_lists.map((l) =>
            l.template_milestone_id === id
              ? { ...l, template_milestone_id: null }
              : l,
          ),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            deleteTemplateMilestoneRow(supabaseRef.current!, id),
          );
        }
      },
      upsertTemplateTaskList: (list) => {
        const row = withOrg(list) as TemplateTaskList;
        patch((prev) => {
          const exists = prev.template_task_lists.some(
            (l) => l.id === row.id,
          );
          return {
            ...prev,
            template_task_lists: exists
              ? prev.template_task_lists.map((l) =>
                  l.id === row.id ? row : l,
                )
              : [...prev.template_task_lists, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            upsertTemplateTaskListRow(supabaseRef.current!, row),
          );
        }
      },
      deleteTemplateTaskList: (id) => {
        patch((prev) => ({
          ...prev,
          template_task_lists: prev.template_task_lists.filter(
            (l) => l.id !== id,
          ),
          template_tasks: prev.template_tasks.filter((t) => t.list_id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            deleteTemplateTaskListRow(supabaseRef.current!, id),
          );
        }
      },
      upsertTemplateTask: (task) => {
        const row = withOrg(task) as TemplateTask;
        patch((prev) => {
          const exists = prev.template_tasks.some((t) => t.id === row.id);
          return {
            ...prev,
            template_tasks: exists
              ? prev.template_tasks.map((t) => (t.id === row.id ? row : t))
              : [...prev.template_tasks, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            upsertTemplateTaskRow(supabaseRef.current!, row),
          );
        }
      },
      deleteTemplateTask: (id) => {
        patch((prev) => {
          const childIds = new Set(
            prev.template_tasks
              .filter((t) => t.parent_id === id)
              .map((t) => t.id),
          );
          return {
            ...prev,
            template_tasks: prev.template_tasks.filter(
              (t) => t.id !== id && !childIds.has(t.id),
            ),
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() =>
            deleteTemplateTaskRow(supabaseRef.current!, id),
          );
        }
      },
      applyProjectTemplate: async (projectId, templateId, options) => {
        const template = state.project_templates.find((t) => t.id === templateId);
        if (!template) return;
        const tMilestones = state.template_milestones.filter(
          (m) => m.template_id === templateId,
        );
        const tLists = state.template_task_lists.filter(
          (l) => l.template_id === templateId,
        );
        const tTasks = state.template_tasks.filter(
          (t) => t.template_id === templateId,
        );

        const organizationId = state.organization.id || orgId;
        const existingLists = state.task_lists.filter(
          (l) => l.project_id === projectId,
        );
        const existingMilestones = state.milestones.filter(
          (m) => m.project_id === projectId,
        );

        const applied = buildAppliedTemplate({
          organizationId,
          projectId,
          profileId: profile?.id ?? null,
          template,
          templateMilestones: tMilestones,
          templateLists: tLists,
          templateTasks: tTasks,
          options,
          listSortBase: maxSortOrder(existingLists),
          milestoneSortBase: maxSortOrder(existingMilestones),
          idFor: uid,
        });

        const project = state.projects.find((p) => p.id === projectId);
        let updatedProject: Project | null = null;
        if (project && applied.projectStartDate) {
          const chosenStart = applied.projectStartDate;
          let nextEnd = project.end_date;
          if (project.start_date && project.end_date) {
            const spanDays = differenceInCalendarDays(
              parseISO(project.end_date),
              parseISO(project.start_date),
            );
            nextEnd = shiftDateKey(chosenStart, spanDays);
          }
          updatedProject = {
            ...project,
            start_date: chosenStart,
            end_date: nextEnd,
          };
        }

        // Include template assignees on the project team so Task List avatars
        // (roster-scoped) resolve the same way as Gantt (org-scoped).
        let nextProjectMembers: ProjectMember[] | null = null;
        if (options.includeAssignees) {
          const knownPeople = new Set(state.people.map((p) => p.id));
          const existing = state.project_members.filter(
            (m) => m.project_id === projectId,
          );
          const byPerson = new Map(existing.map((m) => [m.person_id, m]));
          let added = false;
          for (const personId of uniqueAssigneePersonIds(applied.tasks)) {
            if (!knownPeople.has(personId) || byPerson.has(personId)) continue;
            byPerson.set(personId, {
              project_id: projectId,
              person_id: personId,
              organization_id: organizationId,
              contractor_mode: null,
              contractor_fixed_fee: null,
              contractor_hours: null,
            });
            added = true;
          }
          if (added) nextProjectMembers = [...byPerson.values()];
        }

        patch((prev) => ({
          ...prev,
          projects: updatedProject
            ? prev.projects.map((p) =>
                p.id === updatedProject!.id ? updatedProject! : p,
              )
            : prev.projects,
          milestones: [...prev.milestones, ...applied.milestones],
          task_lists: [...prev.task_lists, ...applied.lists],
          tasks: [...prev.tasks, ...applied.tasks],
          project_members: nextProjectMembers
            ? [
                ...prev.project_members.filter(
                  (m) => m.project_id !== projectId,
                ),
                ...nextProjectMembers,
              ]
            : prev.project_members,
        }));

        if (mode === "supabase" && supabaseRef.current) {
          await runRemote(async () => {
            if (updatedProject) {
              await upsertProjectRow(supabaseRef.current!, updatedProject);
            }
            await applyProjectTemplateRows(supabaseRef.current!, {
              organizationId,
              projectId,
              milestones: applied.milestones.map((m) => ({
                id: m.id,
                name: m.name,
                due_date: m.due_date,
                start_date: m.start_date,
                status: "upcoming" as const,
                sort_order: m.sort_order,
              })),
              taskLists: applied.lists.map((l) => ({
                id: l.id,
                milestone_id: l.milestone_id,
                name: l.name,
                color: l.color,
                sort_order: l.sort_order,
                gantt_enabled: l.gantt_enabled,
                start_date: l.start_date,
                end_date: l.end_date,
              })),
              tasks: applied.tasks.map((t) => ({
                id: t.id,
                list_id: t.list_id,
                parent_id: t.parent_id,
                title: t.title,
                notes: t.notes,
                start_date: t.start_date,
                due_date: t.due_date,
                sort_order: t.sort_order,
                assignee_person_id: t.assignee_person_id,
                is_client_review: t.is_client_review,
                is_divider: t.is_divider,
                created_by_profile_id: t.created_by_profile_id,
              })),
            });
            if (nextProjectMembers) {
              await setProjectMembersRows(
                supabaseRef.current!,
                projectId,
                organizationId,
                nextProjectMembers.map((m) => ({
                  person_id: m.person_id,
                  contractor_mode: m.contractor_mode,
                  contractor_fixed_fee: m.contractor_fixed_fee,
                  contractor_hours: m.contractor_hours,
                })),
              );
            }
          });
        }
      },
      exportProjectAsTemplate: async (projectId, name, options) => {
        const organizationId = state.organization.id || orgId;
        const project = state.projects.find((p) => p.id === projectId);
        if (!project) return;

        const projectMilestones = state.milestones
          .filter((m) => m.project_id === projectId)
          .sort(
            (a, b) =>
              a.sort_order - b.sort_order ||
              (a.due_date ?? "").localeCompare(b.due_date ?? ""),
          );
        const projectLists = state.task_lists.filter(
          (l) => l.project_id === projectId && !l.archived,
        );
        const listIds = new Set(projectLists.map((l) => l.id));
        const projectTasks = state.tasks.filter(
          (t) => t.project_id === projectId && listIds.has(t.list_id),
        );

        const exported = buildExportedTemplate({
          organizationId,
          templateId: uid("tmpl"),
          name,
          project,
          milestones: projectMilestones,
          lists: projectLists,
          tasks: projectTasks,
          options,
          idFor: uid,
        });

        patch((prev) => ({
          ...prev,
          project_templates: [...prev.project_templates, exported.template],
          template_milestones: [
            ...prev.template_milestones,
            ...exported.milestones,
          ],
          template_task_lists: [
            ...prev.template_task_lists,
            ...exported.lists,
          ],
          template_tasks: [...prev.template_tasks, ...exported.tasks],
        }));

        if (mode === "supabase" && supabaseRef.current) {
          const client = supabaseRef.current;
          await runRemote(async () => {
            await upsertProjectTemplateRow(client, exported.template);
            for (const m of exported.milestones) {
              await upsertTemplateMilestoneRow(client, m);
            }
            for (const l of exported.lists) {
              await upsertTemplateTaskListRow(client, l);
            }
            for (const t of exported.tasks) {
              await upsertTemplateTaskRow(client, t);
            }
          });
        }
      },
      updateProjectShare: (projectId, action) => {
        let result = {
          enabled: false,
          token: null as string | null,
          url: null as string | null,
        };
        let updatedProject: Project | null = null;
        patch((prev) => {
          const project = prev.projects.find((p) => p.id === projectId);
          if (!project) return prev;
          let share_enabled = Boolean(project.share_enabled);
          let share_token = project.share_token ?? null;
          if (action === "disable") {
            share_enabled = false;
          } else if (action === "enable") {
            share_enabled = true;
            if (!share_token) share_token = generateShareToken();
          } else {
            share_enabled = true;
            share_token = generateShareToken();
          }
          const row: Project = { ...project, share_enabled, share_token };
          updatedProject = row;
          const origin = clientSiteOrigin();
          result = {
            enabled: share_enabled,
            token: share_enabled ? share_token : null,
            url:
              share_enabled && share_token
                ? publicProjectShareUrl(origin, share_token)
                : null,
          };
          return {
            ...prev,
            projects: prev.projects.map((p) =>
              p.id === projectId ? row : p,
            ),
          };
        });
        if (mode === "supabase" && supabaseRef.current && updatedProject) {
          runRemoteSoft(() =>
            upsertProjectRow(supabaseRef.current!, updatedProject!),
          );
        }
        return result;
      },
    }),
    [
      ready,
      mode,
      state,
      profile,
      myPerson,
      manage,
      admin,
      platformOnly,
      authError,
      patch,
      withOrg,
      runRemote,
      runRemoteSoft,
      refreshSupabase,
      noteLocalWrite,
      orgTasksStatus,
      orgMilestonesStatus,
      mentionCommentsStatus,
      projectDataStatus,
      scheduleRangeLoaded,
      ensureOrgTasks,
      ensureOrgMilestones,
      ensureMentionComments,
      ensureProjectData,
      ensureScheduleRange,
      setActiveRealtimeProjectIds,
      fetchProjectBudgetBurnsRpc,
      fetchMonthlyRetainerYearBarsRpc,
      fetchPersonUtilizationWeeksRpc,
      fetchOrgForecastRpc,
      fetchOrgTaskStatsRpc,
      router,
      pathname,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
