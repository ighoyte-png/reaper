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
  bootstrapOrganization,
  deleteAssignmentRow,
  deleteClientRow,
  deleteHolidayCalendarDayRow,
  deleteHolidayCalendarRow,
  deleteLeaveRow,
  deleteMilestoneRow,
  deletePersonRow,
  deleteProjectRow,
  ensureProfileForUser,
  fetchWorkspace,
  seedDemoWorkspace,
  upsertAssignmentRow,
  upsertClientRow,
  upsertHolidayCalendarDayRow,
  upsertHolidayCalendarRow,
  upsertLeaveRow,
  upsertMilestoneRow,
  upsertPersonRow,
  upsertProjectRow,
} from "@/lib/supabase/api";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { canManage, personForProfile } from "@/lib/auth/roles";
import { applyFullDayLeaveOverride } from "@/lib/domain/leave-override";
import { normalizeLeaveKind } from "@/lib/domain/leave";
import type {
  Assignment,
  Client,
  DemoState,
  HolidayCalendar,
  HolidayCalendarDay,
  LeaveDay,
  Milestone,
  Person,
  Profile,
  Project,
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
      })),
      projects: (parsed.projects ?? seed.projects).map((p) => ({
        ...p,
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
      })),
      clients: (parsed.clients ?? seed.clients).map((c) => ({
        ...c,
        color: c.color ?? "#64748B",
      })),
      sessionProfileId: session,
    };
  } catch {
    return createDemoSeed();
  }
}

function emptySupabaseState(): DemoState {
  return {
    organization: { id: "", name: "" },
    profiles: [],
    clients: [],
    projects: [],
    milestones: [],
    people: [],
    assignments: [],
    leave_days: [],
    holiday_calendars: [],
    holiday_calendar_days: [],
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
  upsertClient: (
    client: Omit<Client, "organization_id"> & { organization_id?: string },
  ) => void;
  deleteClient: (id: string) => void;
  upsertProject: (
    project: Omit<Project, "organization_id"> & { organization_id?: string },
  ) => Promise<void>;
  deleteProject: (id: string) => void;
  upsertPerson: (
    person: Omit<Person, "organization_id"> & { organization_id?: string },
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
  deleteLeave: (id: string) => void;
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
  newId: (prefix: string) => string;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const mode: "demo" | "supabase" = isSupabaseConfigured()
    ? "supabase"
    : "demo";
  const [state, setState] = useState<DemoState>(() =>
    mode === "demo" ? createDemoSeed() : emptySupabaseState(),
  );
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const orgId = state.organization.id || ORG_ID;

  const refreshSupabase = useCallback(async (client: SupabaseClient) => {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      setState(emptySupabaseState());
      return;
    }
    // Signup with email confirmation never bootstraps until first login.
    await ensureProfileForUser(client, user);
    const workspace = await fetchWorkspace(client, user.id);
    setState(workspace);
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
            setState(emptySupabaseState());
            return;
          }
          if (
            event === "SIGNED_IN" ||
            event === "TOKEN_REFRESHED" ||
            event === "INITIAL_SESSION"
          ) {
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

  // Live schedule sync: other users' assignment / leave edits refresh this workspace.
  useEffect(() => {
    if (mode !== "supabase" || !ready) return;
    const client = supabaseRef.current;
    const organizationId = state.organization.id;
    if (!client || !organizationId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void refreshSupabase(client).catch((err) => {
          console.error("Realtime workspace refresh failed", err);
        });
      }, 250);
    };

    const channel = client
      .channel(`org-schedule:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "assignments",
          filter: `organization_id=eq.${organizationId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leave_days",
          filter: `organization_id=eq.${organizationId}`,
        },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void client.removeChannel(channel);
    };
  }, [mode, ready, state.organization.id, refreshSupabase]);

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
      const message = raw.includes("recurrence")
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

  const value = useMemo<DataContextValue>(
    () => ({
      ready,
      mode,
      state,
      profile,
      myPerson,
      canManage: manage,
      isAuthenticated: Boolean(profile),
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
        patch((prev) => ({ ...prev, sessionProfileId: profileId }));
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
        if (mode === "demo") {
          patch((prev) => ({ ...prev, sessionProfileId: null }));
          return;
        }
        const client = supabaseRef.current ?? createClient();
        await client.auth.signOut();
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
      upsertClient: (client) => {
        const row = withOrg(client) as Client;
        patch((prev) => {
          const exists = prev.clients.some((c) => c.id === row.id);
          return {
            ...prev,
            clients: exists
              ? prev.clients.map((c) => (c.id === row.id ? row : c))
              : [...prev.clients, row],
          };
        });
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() => upsertClientRow(supabaseRef.current!, row));
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
        const row = withOrg(project) as Project;
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
      },
      deleteProject: (id) => {
        patch((prev) => ({
          ...prev,
          projects: prev.projects.filter((p) => p.id !== id),
          assignments: prev.assignments.filter((a) => a.project_id !== id),
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
          runRemoteSoft(() => upsertAssignmentRow(supabaseRef.current!, row));
        }
      },
      deleteAssignment: (id) => {
        patch((prev) => ({
          ...prev,
          assignments: prev.assignments.filter((a) => a.id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
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
        const row = {
          ...withOrg(leave),
          kind: normalizeLeaveKind(leave.kind),
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
          if (leaveRow.status === "approved") {
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
          runRemoteSoft(async () => {
            for (const l of remoteLeaves) {
              await upsertLeaveRow(client, l);
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
      },
      deleteLeave: (id) => {
        patch((prev) => ({
          ...prev,
          leave_days: prev.leave_days.filter((l) => l.id !== id),
        }));
        if (mode === "supabase" && supabaseRef.current) {
          runRemoteSoft(() => deleteLeaveRow(supabaseRef.current!, id));
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
    }),
    [
      ready,
      mode,
      state,
      profile,
      myPerson,
      manage,
      authError,
      patch,
      withOrg,
      runRemote,
      refreshSupabase,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
