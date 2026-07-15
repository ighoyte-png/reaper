"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DataContext,
  type DataContextValue,
} from "@/lib/data/store";
import {
  createDemoSeed,
  DEMO_STORAGE_KEY,
} from "@/lib/demo/seed";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { sanitizePublicWorkspace } from "@/lib/share/sanitize";
import type { DemoState, Profile } from "@/lib/types";

function noopAsync(): Promise<void> {
  return Promise.resolve();
}

function loadDemoWorkspaceByToken(token: string): DemoState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as DemoState)
      : createDemoSeed();
    const org = parsed.organization;
    if (
      !org?.share_enabled ||
      !org.share_token ||
      org.share_token !== token
    ) {
      return null;
    }
    return sanitizePublicWorkspace({
      ...createDemoSeed(),
      ...parsed,
      organization: {
        id: org.id,
        name: org.name,
        share_enabled: true,
      },
      sessionProfileId: null,
    });
  } catch {
    return null;
  }
}

function viewerProfile(orgId: string): Profile {
  return {
    id: "public-viewer",
    organization_id: orgId,
    email: "",
    full_name: "Public view",
    role: "member",
  };
}

export function PublicShareProvider({
  token,
  children,
}: {
  token: string;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<DemoState | null>(null);
  const mode = isSupabaseConfigured() ? "supabase" : "demo";
  const shareBasePath = `/share/${token}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setReady(false);
      setError(null);
      try {
        if (mode === "demo") {
          const ws = loadDemoWorkspaceByToken(token);
          if (!ws) {
            if (!cancelled) {
              setState(null);
              setError("This public link is off or invalid.");
            }
          } else if (!cancelled) {
            setState(ws);
          }
        } else {
          const res = await fetch(`/api/share/${encodeURIComponent(token)}`);
          const body = (await res.json()) as {
            workspace?: DemoState;
            error?: string;
          };
          if (!res.ok || !body.workspace) {
            if (!cancelled) {
              setState(null);
              setError(body.error || "This public link is off or invalid.");
            }
          } else if (!cancelled) {
            setState(sanitizePublicWorkspace(body.workspace));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setState(null);
          setError(
            err instanceof Error ? err.message : "Could not load public view",
          );
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, mode]);

  const value = useMemo<DataContextValue | null>(() => {
    if (!state) return null;
    const profile = viewerProfile(state.organization.id);
    return {
      ready: true,
      mode,
      state: { ...state, sessionProfileId: profile.id, profiles: [profile] },
      profile,
      myPerson: null,
      canManage: false,
      isAuthenticated: true,
      isPublicShare: true,
      shareBasePath,
      authError: null,
      loginDemo: () => {},
      login: async () => {},
      signup: async () => ({ needsConfirmation: false }),
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
      upsertProject: async () => {},
      deleteProject: () => {},
      upsertPerson: async () => {},
      deletePerson: () => {},
      upsertAssignment: () => {},
      deleteAssignment: () => {},
      upsertMilestone: () => {},
      deleteMilestone: () => {},
      upsertLeave: () => {},
      setLeaveBlock: () => [],
      deleteLeave: () => {},
      upsertHolidayCalendar: () => {},
      deleteHolidayCalendar: () => {},
      upsertHolidayCalendarDay: () => {},
      deleteHolidayCalendarDay: () => {},
      applyHolidayCalendar: async () => 0,
      newId: (prefix) => `${prefix}-ro`,
    };
  }, [state, mode, shareBasePath]);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
        Loading public view…
      </div>
    );
  }

  if (error || !value) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-[var(--text)]">Link unavailable</p>
        <p className="max-w-sm text-sm text-[var(--text-muted)]">
          {error || "This public link is off or invalid."}
        </p>
      </div>
    );
  }

  return (
    <DataContext.Provider value={value}>{children}</DataContext.Provider>
  );
}
