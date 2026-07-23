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
  realtimeEchoId,
} from "@/lib/data/realtime-patch";
import { orderTasksParentsFirst } from "@/lib/domain/tasks";
import {
  clearLegacyDismissedBulletinIds,
  readLegacyDismissedBulletinIds,
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
  deletePersonRow,
  deleteProjectAssetRow,
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
  seedDemoWorkspace,
  upsertAssignmentRow,
  upsertBulletinRow,
  upsertBulletinDismissalRow,
  upsertBulletinDismissalRows,
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
  upsertProjectAssetRow,
  upsertProjectRow,
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
import { canManage, isAdmin, personForProfile } from "@/lib/auth/roles";
import { clearViewAsStorage } from "@/lib/view-as-storage";
import { applyFullDayLeaveOverride, applyFullDayLeaveOverrideForDates } from "@/lib/domain/leave-override";
import { isAlwaysFullDayKind, isFullDayLeave, normalizeLeaveKind } from "@/lib/domain/leave";
import { workingDaysBetween } from "@/lib/domain/dates";
import { uniqueSlug } from "@/lib/slug";
import {
  generateShareToken,
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
  Project,
  ProjectAsset,
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
      })),
      clients: (parsed.clients ?? seed.clients).map((c) => ({
        ...c,
        slug: c.slug || uniqueSlug(c.name, [], { preferred: c.slug }),
        color: c.color ?? "#64748B",
        status: c.status ?? "active",
        hide_from_public_share: Boolean(c.hide_from_public_share),
      })),
      milestones: (parsed.milestones ?? seed.milestones).map((m, idx) => ({
        ...m,
        start_date: m.start_date ?? null,
        due_date: m.due_date ?? null,
        client_approved: Boolean(m.client_approved),
        sort_order:
          typeof m.sort_order === "number" ? m.sort_order : idx,
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
        ? parsed.project_members
        : seed.project_members,
      task_lists: (parsed.task_lists ?? seed.task_lists).map((l) => ({
        ...l,
        color: l.color ?? null,
        archived: Boolean(l.archived),
      })),
      tasks: parsed.tasks ?? seed.tasks,
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
        audience: b.audience === "people" ? "people" : "all",
        audience_person_ids: Array.isArray(b.audience_person_ids)
          ? b.audience_person_ids
          : [],
      })),
      dismissed_bulletin_ids: Array.isArray(parsed.dismissed_bulletin_ids)
        ? parsed.dismissed_bulletin_ids.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
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
    dismissed_bulletin_ids: [],
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
  upsertProject: (
    project: Omit<Project, "organization_id"> & { organization_id?: string },
  ) => Promise<Project>;
  /** Replace explicit team members for a project. */
  setProjectMembers: (
    projectId: string,
    personIds: string[],
  ) => Promise<void>;
  deleteProject: (id: string) => void;
  upsertPerson: (
    person: Omit<Person, "organization_id"> & { organization_id?: string },
  ) => Promise<void>;
  /** Avatar-only update (works for members via people_update_self RLS). */
  updatePersonAvatar: (
    personId: string,
    avatarUrl: string | null,
  ) => Promise<void>;
  deletePerson: (id: string) => void;
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
  /** Mark a bulletin as seen/dismissed for the current profile (persisted). */
  dismissBulletin: (id: string) => void;
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
  ) => Promise<void>;
  /** Clone a project's milestones/task lists/tasks into a new reusable template (no assignees). */
  exportProjectAsTemplate: (
    projectId: string,
    name: string,
  ) => Promise<void>;
  /** Enable/disable/rotate a project's public client-portal share link. */
  updateProjectShare: (
    projectId: string,
    action: "enable" | "disable" | "rotate",
  ) => { enabled: boolean; token: string | null; url: string | null };
  newId: (prefix: string) => string;
}

const DataContext = createContext<DataContextValue | null>(null);

export { DataContext };
export type { DataContextValue };

export function DataProvider({ children }: { children: ReactNode }) {
  const mode: "demo" | "supabase" = isSupabaseConfigured()
    ? "supabase"
    : "demo";
  const [state, setState] = useState<DemoState>(() =>
    mode === "demo" ? createDemoSeed() : emptySupabaseState(),
  );
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  /** Auth session is a platform admin with no workspace profile. */
  const [platformOnly, setPlatformOnly] = useState(false);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const orgId = state.organization.id || ORG_ID;
  /** Recently written row ids — ignore realtime echoes of our own optimistic writes. */
  const localWritesRef = useRef<Map<string, number>>(new Map());
  const LOCAL_WRITE_TTL_MS = 3000;
  /**
   * Bumped on every leave mutation so an in-flight create upsert cannot
   * resurrect rows after a newer undo/delete.
   */
  const leaveWriteEpochRef = useRef(0);

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

    // Existing profile → normal workspace load (may also be a platform admin).
    const { data: existingProfile, error: profileLookupError } = await client
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileLookupError) throw profileLookupError;

    async function applyWorkspace(workspace: DemoState) {
      const personId =
        workspace.people.find((p) => p.profile_id === user!.id)?.id ?? null;
      const legacyIds = readLegacyDismissedBulletinIds(personId, user!.id);
      const knownBulletinIds = new Set(workspace.bulletins.map((b) => b.id));
      const toMigrate = legacyIds.filter(
        (id) =>
          knownBulletinIds.has(id) &&
          !workspace.dismissed_bulletin_ids.includes(id),
      );
      let next = workspace;
      if (toMigrate.length > 0 && workspace.organization.id) {
        try {
          const wrote = await upsertBulletinDismissalRows(
            client,
            toMigrate.map((bulletin_id) => ({
              bulletin_id,
              profile_id: user!.id,
              organization_id: workspace.organization.id,
            })),
          );
          if (wrote) {
            next = {
              ...workspace,
              dismissed_bulletin_ids: [
                ...new Set([...workspace.dismissed_bulletin_ids, ...toMigrate]),
              ],
            };
            clearLegacyDismissedBulletinIds(personId, user!.id);
          }
        } catch {
          /* keep legacy localStorage until migration is applied */
        }
      } else if (legacyIds.length > 0) {
        // Already mirrored in DB (or bulletins deleted) — drop stale browser keys.
        clearLegacyDismissedBulletinIds(personId, user!.id);
      }
      setState(next);
    }

    if (existingProfile) {
      setPlatformOnly(false);
      const workspace = await fetchWorkspace(client, user.id);
      await applyWorkspace(workspace);
      return;
    }

    // No profile: allowlisted platform admins stay workspace-free.
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

  // Live sync: patch only changed rows (assignments/tasks/leave/comments/bulletins).
  useEffect(() => {
    if (mode !== "supabase" || !ready) return;
    const client = supabaseRef.current;
    const organizationId = state.organization.id;
    if (!client || !organizationId) return;

    type PendingEvent = {
      table: string;
      eventType: string;
      newRecord: Record<string, unknown> | null;
      oldRecord: Record<string, unknown> | null;
    };
    let pending: PendingEvent[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      flushTimer = null;
      const batch = pending;
      pending = [];
      if (batch.length === 0) return;
      setState((prev) => {
        let next = prev;
        for (const ev of batch) {
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
    };

    const onChange =
      (table: string) =>
      (payload: {
        eventType: string;
        new: Record<string, unknown>;
        old: Record<string, unknown>;
      }) => {
        const id = realtimeEchoId(
          table,
          payload.eventType,
          payload.new,
          payload.old,
        );
        if (shouldIgnoreLocalEcho(table, id)) return;
        pending.push({
          table,
          eventType: payload.eventType,
          newRecord: payload.new ?? null,
          oldRecord: payload.old ?? null,
        });
        if (flushTimer == null) {
          // Coalesce burst writes (e.g. leave + assignment cascades) into one paint.
          flushTimer = setTimeout(flush, 16);
        }
      };

    const channel = client
      .channel(`org-live:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assignments",
          filter: `organization_id=eq.${organizationId}`,
        },
        onChange("assignments"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leave_days",
          filter: `organization_id=eq.${organizationId}`,
        },
        onChange("leave_days"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_comments",
          filter: `organization_id=eq.${organizationId}`,
        },
        onChange("task_comments"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_comment_mentions",
          filter: `organization_id=eq.${organizationId}`,
        },
        onChange("task_comment_mentions"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_comment_reactions",
          filter: `organization_id=eq.${organizationId}`,
        },
        onChange("task_comment_reactions"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bulletins",
          filter: `organization_id=eq.${organizationId}`,
        },
        onChange("bulletins"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bulletin_dismissals",
          filter: `organization_id=eq.${organizationId}`,
        },
        onChange("bulletin_dismissals"),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `organization_id=eq.${organizationId}`,
        },
        onChange("tasks"),
      )
      .subscribe();

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      void client.removeChannel(channel);
    };
  }, [mode, ready, state.organization.id, shouldIgnoreLocalEcho]);

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
          const origin =
            typeof window !== "undefined" ? window.location.origin : "";
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
            "Signed in, but workspace setup failed. In Supabase SQL Editor, run supabase/migrations/002_bootstrap.sql, then try again.";
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
          setAuthError(error.message);
          throw error;
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
            : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
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
        if (!admin) return;
        const target = state.profiles.find((p) => p.id === profileId);
        if (!target) return;
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
            updateProfileRoleRow(supabaseRef.current!, profileId, role),
          );
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
        return row;
      },
      setProjectMembers: async (projectId, personIds) => {
        const orgId = state.organization.id;
        const unique = [...new Set(personIds)];
        const rows = unique.map((person_id) => ({
          project_id: projectId,
          person_id,
          organization_id: orgId,
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
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() => deleteProjectRow(supabaseRef.current!, id));
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
          await runRemote(() => upsertPersonRow(supabaseRef.current!, row));
        }
      },
      updatePersonAvatar: async (personId, avatarUrl) => {
        patch((prev) => ({
          ...prev,
          people: prev.people.map((p) =>
            p.id === personId ? { ...p, avatar_url: avatarUrl } : p,
          ),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          await runRemote(() =>
            updatePersonAvatarRow(supabaseRef.current!, personId, avatarUrl),
          );
        }
      },
      deletePerson: (id) => {
        patch((prev) => ({
          ...prev,
          people: prev.people.filter((p) => p.id !== id),
          assignments: prev.assignments.filter((a) => a.person_id !== id),
          leave_days: prev.leave_days.filter((l) => l.person_id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() => deletePersonRow(supabaseRef.current!, id));
        }
      },
      upsertAssignment: (assignment) => {
        const row = {
          ...withOrg(assignment),
          recurrence: assignment.recurrence ?? "none",
          recurrence_exceptions: assignment.recurrence_exceptions ?? [],
        } as Assignment;
        patch((prev) => {
          const exists = prev.assignments.some((a) => a.id === row.id);
          return {
            ...prev,
            assignments: exists
              ? prev.assignments.map((a) => (a.id === row.id ? row : a))
              : [...prev.assignments, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("assignments", row.id);
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
        const row = withOrg(milestone) as Milestone;
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
            remoteUpserts = ov.upserts;
            remoteDeletes = ov.deletes;
            assignments = prev.assignments.filter(
              (a) => !ov.deletes.includes(a.id),
            );
            for (const a of ov.upserts) {
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
            asgUpserts = ov.upserts;
            asgDeletes = ov.deletes;
            assignments = prev.assignments.filter(
              (a) => !ov.deletes.includes(a.id),
            );
            for (const a of ov.upserts) {
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
        const days = state.holiday_calendar_days.filter(
          (d) => d.calendar_id === calendarId,
        );
        const people = state.people.filter(
          (p) => p.holiday_calendar_id === calendarId,
        );
        if (days.length === 0 || people.length === 0) return 0;

        let created: LeaveDay[] = [];
        let remoteUpserts: Assignment[] = [];
        let remoteDeletes: string[] = [];

        patch((prev) => {
          let leave_days = [...prev.leave_days];
          let assignments = [...prev.assignments];
          const newLeaves: LeaveDay[] = [];
          const upsertMap = new Map<string, Assignment>();
          const deleteSet = new Set<string>();

          for (const person of people) {
            for (const day of days) {
              const existing = leave_days.find(
                (l) => l.person_id === person.id && l.date === day.date,
              );
              const leaveRow: LeaveDay = {
                id: existing?.id ?? uid("leave"),
                organization_id: prev.organization.id,
                person_id: person.id,
                date: day.date,
                kind: "holiday",
                status: "approved",
                hours_per_day: null,
                notes: existing?.notes ?? day.name ?? "",
              };
              newLeaves.push(leaveRow);
              if (existing) {
                leave_days = leave_days.map((l) =>
                  l.id === existing.id ? leaveRow : l,
                );
              } else {
                leave_days.push(leaveRow);
              }
              const ov = applyFullDayLeaveOverride(
                assignments,
                person.id,
                day.date,
                uid,
              );
              for (const id of ov.deletes) {
                deleteSet.add(id);
                upsertMap.delete(id);
              }
              assignments = assignments.filter((a) => !ov.deletes.includes(a.id));
              for (const a of ov.upserts) {
                upsertMap.set(a.id, a);
                const idx = assignments.findIndex((x) => x.id === a.id);
                if (idx >= 0) assignments[idx] = a;
                else assignments.push(a);
              }
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
        const row = withOrg(list) as TaskList;
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
          runRemoteSoft(() => upsertTaskListRow(supabaseRef.current!, row));
        }
      },
      deleteTaskList: (id) => {
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
        // Members may only touch tasks assigned to them; managers can edit any.
        // The UI is expected to gate non-status fields for members, but the
        // store still allows the write here since role checks already ran.
        if (
          !manage &&
          myPerson &&
          task.assignee_person_id !== myPerson.id
        ) {
          return;
        }
        const row = withOrg(task) as Task;
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
      },
      deleteTask: (id) => {
        patch((prev) => ({
          ...prev,
          tasks: prev.tasks.filter((t) => t.id !== id && t.parent_id !== id),
          task_comments: prev.task_comments.filter((c) => c.task_id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("tasks", id);
          runRemoteSoft(() => deleteTaskRow(supabaseRef.current!, id));
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
        patch((prev) => {
          const existing = prev.task_comments.find((c) => c.id === row.id);
          const next: TaskComment = {
            ...row,
            reactions: Array.isArray(comment.reactions)
              ? comment.reactions
              : (existing?.reactions ?? []),
          };
          const exists = Boolean(existing);
          return {
            ...prev,
            task_comments: exists
              ? prev.task_comments.map((c) => (c.id === next.id ? next : c))
              : [...prev.task_comments, next],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("task_comments", row.id);
          noteLocalWrite("task_comment_mentions", row.id);
          runRemoteSoft(() =>
            upsertTaskCommentRow(supabaseRef.current!, row),
          );
        }
      },
      deleteTaskComment: (id) => {
        patch((prev) => ({
          ...prev,
          task_comments: prev.task_comments.filter((c) => c.id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("task_comments", id);
          noteLocalWrite("task_comment_mentions", id);
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
        const row = withOrg(bulletin) as Bulletin;
        patch((prev) => {
          const exists = prev.bulletins.some((b) => b.id === row.id);
          return {
            ...prev,
            bulletins: exists
              ? prev.bulletins.map((b) => (b.id === row.id ? row : b))
              : [...prev.bulletins, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("bulletins", row.id);
          runRemoteSoft(() => upsertBulletinRow(supabaseRef.current!, row));
        }
      },
      deleteBulletin: (id) => {
        if (!manage) return;
        patch((prev) => ({
          ...prev,
          bulletins: prev.bulletins.filter((b) => b.id !== id),
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
        let organizationId = "";
        patch((prev) => {
          organizationId = prev.organization.id;
          if (prev.dismissed_bulletin_ids.includes(id)) return prev;
          return {
            ...prev,
            dismissed_bulletin_ids: [...prev.dismissed_bulletin_ids, id],
          };
        });
        if (!organizationId) return;
        if (mode === "supabase" && supabaseRef.current) {
          noteLocalWrite("bulletin_dismissals", id);
          runRemoteSoft(async () => {
            await upsertBulletinDismissalRow(supabaseRef.current!, {
              bulletin_id: id,
              profile_id: profileId,
              organization_id: organizationId,
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
      applyProjectTemplate: async (projectId, templateId) => {
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

        const milestoneIdMap = new Map<string, string>();
        const newMilestones: Milestone[] = tMilestones.map((m) => {
          const id = uid("ms");
          milestoneIdMap.set(m.id, id);
          return {
            id,
            organization_id: organizationId,
            project_id: projectId,
            name: m.name,
            start_date: null,
            due_date: null,
            status: "upcoming",
            client_approved: false,
            sort_order: m.sort_order,
          };
        });

        const listIdMap = new Map<string, string>();
        const newLists: TaskList[] = tLists.map((l) => {
          const id = uid("list");
          listIdMap.set(l.id, id);
          return {
            id,
            organization_id: organizationId,
            project_id: projectId,
            milestone_id: l.template_milestone_id
              ? milestoneIdMap.get(l.template_milestone_id) ?? null
              : null,
            name: l.name,
            color: null,
            sort_order: l.sort_order,
            archived: false,
          };
        });

        const taskIdMap = new Map<string, string>();
        for (const t of tTasks) taskIdMap.set(t.id, uid("task"));
        const newTasks: Task[] = orderTasksParentsFirst(
          tTasks.map((t) => ({
            id: taskIdMap.get(t.id)!,
            organization_id: organizationId,
            project_id: projectId,
            list_id: listIdMap.get(t.list_id) ?? "",
            parent_id: t.parent_id ? taskIdMap.get(t.parent_id) ?? null : null,
            assignee_person_id: null,
            title: t.title,
            status: "upcoming" as const,
            start_date: null,
            due_date: null,
            notes: t.notes,
            sort_order: t.sort_order,
          })),
        );

        patch((prev) => ({
          ...prev,
          milestones: [...prev.milestones, ...newMilestones],
          task_lists: [...prev.task_lists, ...newLists],
          tasks: [...prev.tasks, ...newTasks],
        }));

        if (mode === "supabase" && supabaseRef.current) {
          await runRemote(() =>
            applyProjectTemplateRows(supabaseRef.current!, {
              organizationId,
              projectId,
              milestones: newMilestones.map((m) => ({
                id: m.id,
                name: m.name,
                due_date: m.due_date,
                start_date: m.start_date,
                status: "upcoming" as const,
                sort_order: m.sort_order,
              })),
              taskLists: newLists.map((l) => ({
                id: l.id,
                milestone_id: l.milestone_id,
                name: l.name,
                color: l.color,
                sort_order: l.sort_order,
              })),
              tasks: newTasks.map((t) => ({
                id: t.id,
                list_id: t.list_id,
                parent_id: t.parent_id,
                title: t.title,
                notes: t.notes,
                due_date: t.due_date,
                sort_order: t.sort_order,
              })),
            }),
          );
        }
      },
      exportProjectAsTemplate: async (projectId, name) => {
        const organizationId = state.organization.id || orgId;
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

        const templateId = uid("tmpl");
        const newTemplate: ProjectTemplate = {
          id: templateId,
          organization_id: organizationId,
          name,
          description: "",
        };

        const milestoneIdMap = new Map<string, string>();
        const newTemplateMilestones: TemplateMilestone[] = projectMilestones.map(
          (m, idx) => {
            const id = uid("tms");
            milestoneIdMap.set(m.id, id);
            return {
              id,
              organization_id: organizationId,
              template_id: templateId,
              name: m.name,
              offset_days: 0,
              sort_order: m.sort_order ?? idx,
            };
          },
        );

        const listIdMap = new Map<string, string>();
        const newTemplateLists: TemplateTaskList[] = projectLists.map((l) => {
          const id = uid("tlist");
          listIdMap.set(l.id, id);
          return {
            id,
            organization_id: organizationId,
            template_id: templateId,
            template_milestone_id: l.milestone_id
              ? milestoneIdMap.get(l.milestone_id) ?? null
              : null,
            name: l.name,
            sort_order: l.sort_order,
          };
        });

        const taskIdMap = new Map<string, string>();
        for (const t of projectTasks) taskIdMap.set(t.id, uid("ttask"));
        const newTemplateTasks: TemplateTask[] = orderTasksParentsFirst(
          projectTasks.map((t) => ({
            id: taskIdMap.get(t.id)!,
            organization_id: organizationId,
            template_id: templateId,
            list_id: listIdMap.get(t.list_id) ?? "",
            parent_id: t.parent_id ? taskIdMap.get(t.parent_id) ?? null : null,
            title: t.title,
            notes: t.notes,
            offset_days: null,
            sort_order: t.sort_order,
          })),
        );

        patch((prev) => ({
          ...prev,
          project_templates: [...prev.project_templates, newTemplate],
          template_milestones: [
            ...prev.template_milestones,
            ...newTemplateMilestones,
          ],
          template_task_lists: [
            ...prev.template_task_lists,
            ...newTemplateLists,
          ],
          template_tasks: [...prev.template_tasks, ...newTemplateTasks],
        }));

        if (mode === "supabase" && supabaseRef.current) {
          const client = supabaseRef.current;
          await runRemote(async () => {
            await upsertProjectTemplateRow(client, newTemplate);
            for (const m of newTemplateMilestones) {
              await upsertTemplateMilestoneRow(client, m);
            }
            for (const l of newTemplateLists) {
              await upsertTemplateTaskListRow(client, l);
            }
            for (const t of newTemplateTasks) {
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
          const origin =
            typeof window !== "undefined" ? window.location.origin : "";
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
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
