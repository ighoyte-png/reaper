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
import { usePathname } from "next/navigation";
import { useData } from "@/lib/data/store";
import { isSystemBulletin } from "@/lib/domain/bulletins";
import { mentionTargetFromUnread, mentionUnreadKey } from "@/lib/mentions";
import { notesPlainText } from "@/lib/notes-html";
import { resolveAuthorLabel } from "@/lib/domain/people";
import { stripWorkspacePrefix } from "@/lib/paths";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { useViewAsOptional } from "@/lib/view-as";
import { desktopNotificationPermission } from "@/lib/desktop-notifications";
import {
  readUtilityNotificationsPref,
  UTILITY_NOTIFICATIONS_PREF_EVENT,
} from "@/lib/utility-notifications-pref";
import type {
  Bulletin,
  MentionTarget,
  MentionUnread,
  Project,
} from "@/lib/types";

export type UtilityNotificationKind = "mention" | "bulletin" | "in_review";

export type UtilityNotificationCard = {
  id: string;
  kind: UtilityNotificationKind;
  href: string;
  title: string;
  subtitle: string;
  /** ISO time when enqueued (for stable oldest→newest order). */
  enqueuedAt: number;
  /** Fade-in after mount. */
  visible: boolean;
  mentionTarget?: MentionTarget;
  bulletinId?: string;
};

type UtilityNotificationsContextValue = {
  cards: UtilityNotificationCard[];
  removeCard: (id: string) => void;
  removeMentionCard: (target: MentionTarget) => void;
  removeBulletinCard: (bulletinId: string) => void;
  clearAll: () => void;
};

const UtilityNotificationsContext =
  createContext<UtilityNotificationsContextValue | null>(null);

function isDashboardPath(pathForNav: string): boolean {
  return pathForNav === "/dashboard" || pathForNav.startsWith("/dashboard/");
}

function mentionCardId(row: MentionUnread): string {
  return `mention:${mentionUnreadKey(row)}`;
}

function bulletinCardId(bulletinId: string): string {
  return `bulletin:${bulletinId}`;
}

export function UtilityNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { state, myPerson, profile, isPublicShare } = useData();
  const pathname = usePathname();
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const viewAs = useViewAsOptional();
  const [cards, setCards] = useState<UtilityNotificationCard[]>([]);
  const [prefEnabled, setPrefEnabled] = useState(true);

  const seenMentionKeysRef = useRef<Set<string> | null>(null);
  const seenBulletinIdsRef = useRef<Set<string> | null>(null);
  /** True until we've left a cold-start dashboard (or never started there). */
  const suppressBackfillRef = useRef(false);
  const coldStartCheckedRef = useRef(false);
  const fadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const pathForNav = useMemo(
    () => stripWorkspacePrefix(pathname, state.organization.slug),
    [pathname, state.organization.slug],
  );

  const onDashboard = isDashboardPath(pathForNav);
  const mentionPersonId =
    viewAs?.effectivePersonId ?? myPerson?.id ?? null;

  useEffect(() => {
    function sync() {
      setPrefEnabled(readUtilityNotificationsPref(profile?.id));
    }
    sync();
    window.addEventListener(UTILITY_NOTIFICATIONS_PREF_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(UTILITY_NOTIFICATIONS_PREF_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [profile?.id]);

  useEffect(() => {
    if (coldStartCheckedRef.current) return;
    coldStartCheckedRef.current = true;
    if (onDashboard) {
      suppressBackfillRef.current = true;
    }
  }, [onDashboard]);

  useEffect(() => {
    if (!onDashboard && suppressBackfillRef.current) {
      // Left dashboard after cold start — still don't resurrect old items;
      // only clear the "seed baseline" so fresh events enqueue.
      suppressBackfillRef.current = false;
    }
  }, [onDashboard]);

  const scheduleVisible = useCallback((id: string) => {
    const delay =
      desktopNotificationPermission() === "granted" ? 500 : 0;
    const existing = fadeTimersRef.current.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      fadeTimersRef.current.delete(id);
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, visible: true } : c)),
      );
    }, delay);
    fadeTimersRef.current.set(id, t);
  }, []);

  useEffect(() => {
    return () => {
      for (const t of fadeTimersRef.current.values()) clearTimeout(t);
      fadeTimersRef.current.clear();
    };
  }, []);

  const enqueue = useCallback(
    (card: Omit<UtilityNotificationCard, "visible" | "enqueuedAt">) => {
      if (!prefEnabled || isPublicShare) return;
      if (onDashboard) return;
      if (suppressBackfillRef.current) return;

      setCards((prev) => {
        if (prev.some((c) => c.id === card.id)) return prev;
        return [
          ...prev,
          {
            ...card,
            enqueuedAt: Date.now(),
            visible: false,
          },
        ];
      });
      scheduleVisible(card.id);
    },
    [prefEnabled, isPublicShare, onDashboard, scheduleVisible],
  );

  const removeCard = useCallback((id: string) => {
    const t = fadeTimersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      fadeTimersRef.current.delete(id);
    }
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const removeMentionCard = useCallback(
    (target: MentionTarget) => {
      const key = `${target.kind}:${target.id}`;
      setCards((prev) =>
        prev.filter(
          (c) =>
            !(
              c.kind === "mention" &&
              c.mentionTarget &&
              `${c.mentionTarget.kind}:${c.mentionTarget.id}` === key
            ),
        ),
      );
    },
    [],
  );

  const removeBulletinCard = useCallback((bulletinId: string) => {
    setCards((prev) =>
      prev.filter(
        (c) =>
          !(
            (c.kind === "bulletin" || c.kind === "in_review") &&
            c.bulletinId === bulletinId
          ),
      ),
    );
  }, []);

  const clearAll = useCallback(() => {
    for (const t of fadeTimersRef.current.values()) clearTimeout(t);
    fadeTimersRef.current.clear();
    setCards([]);
  }, []);

  useEffect(() => {
    if (!prefEnabled) {
      clearAll();
      seenMentionKeysRef.current = null;
      seenBulletinIdsRef.current = null;
    }
  }, [prefEnabled, clearAll]);

  // Watch mention unreads
  useEffect(() => {
    if (isPublicShare || !mentionPersonId) {
      seenMentionKeysRef.current = null;
      return;
    }
    const mine = (state.unread_mentions ?? []).filter(
      (r) => r.person_id === mentionPersonId && !r.read_at,
    );
    const keys = mine
      .map((r) => mentionUnreadKey(r))
      .filter(Boolean);

    if (seenMentionKeysRef.current === null) {
      seenMentionKeysRef.current = new Set();
      const seen = seenMentionKeysRef.current;
      // Cold-start on dashboard: baseline only (no backfill). Off-dashboard:
      // surface current unreads as chips.
      if (!suppressBackfillRef.current && !onDashboard) {
        for (const row of mine) {
          const k = mentionUnreadKey(row);
          if (!k) continue;
          const target = mentionTargetFromUnread(row);
          if (!target) continue;
          const built = buildMentionCard({
            row,
            target,
            state,
            projectHref,
            appHref,
          });
          if (!built) continue;
          seen.add(k);
          enqueue(built);
        }
      } else {
        for (const k of keys) seen.add(k);
      }
      return;
    }

    const seen = seenMentionKeysRef.current;
    const fresh = mine.filter((r) => {
      const k = mentionUnreadKey(r);
      return k && !seen.has(k);
    });

    for (const row of fresh) {
      const k = mentionUnreadKey(row);
      if (!k) continue;
      const target = mentionTargetFromUnread(row);
      if (!target) continue;
      const built = buildMentionCard({
        row,
        target,
        state,
        projectHref,
        appHref,
      });
      if (!built) continue;
      seen.add(k);
      enqueue(built);
    }
    // Baseline keys we intentionally skip (e.g. on dashboard) still count as seen
    // so leaving the dashboard does not resurrect them.
    if (onDashboard || suppressBackfillRef.current) {
      for (const k of keys) seen.add(k);
    }
  }, [
    state.unread_mentions,
    state.task_comments,
    state.tasks,
    state.projects,
    state.clients,
    state.people,
    state.profiles,
    state.assignments,
    mentionPersonId,
    isPublicShare,
    onDashboard,
    enqueue,
    projectHref,
    appHref,
  ]);

  // Watch bulletin unreads
  useEffect(() => {
    if (isPublicShare || !profile) {
      seenBulletinIdsRef.current = null;
      return;
    }
    const mine = state.unread_bulletin_ids ?? [];
    if (seenBulletinIdsRef.current === null) {
      seenBulletinIdsRef.current = new Set(mine);
      if (!suppressBackfillRef.current && !onDashboard) {
        for (const bulletinId of mine) {
          const bulletin =
            state.bulletins.find((b) => b.id === bulletinId) ?? null;
          if (!bulletin) {
            seenBulletinIdsRef.current.delete(bulletinId);
            continue;
          }
          const built = buildBulletinCard({
            bulletin,
            projectHref,
            appHref,
            state,
          });
          if (built) enqueue(built);
        }
      }
      return;
    }
    const seen = seenBulletinIdsRef.current;
    const fresh = mine.filter((id) => !seen.has(id));
    for (const id of mine) seen.add(id);

    for (const bulletinId of fresh) {
      const bulletin =
        state.bulletins.find((b) => b.id === bulletinId) ?? null;
      if (!bulletin) {
        // Retry when bulletin payload arrives — leave out of seen temporarily
        seen.delete(bulletinId);
        continue;
      }
      const built = buildBulletinCard({
        bulletin,
        projectHref,
        appHref,
        state,
      });
      if (built) enqueue(built);
    }
  }, [
    state.unread_bulletin_ids,
    state.bulletins,
    state.projects,
    state.clients,
    profile,
    isPublicShare,
    onDashboard,
    enqueue,
    projectHref,
    appHref,
  ]);

  // Drop cards whose unread was cleared elsewhere
  useEffect(() => {
    if (!mentionPersonId) return;
    const unreadKeys = new Set(
      (state.unread_mentions ?? [])
        .filter((r) => r.person_id === mentionPersonId && !r.read_at)
        .map((r) => mentionUnreadKey(r))
        .filter(Boolean),
    );
    setCards((prev) =>
      prev.filter((c) => {
        if (c.kind !== "mention" || !c.mentionTarget) return true;
        const key = `${c.mentionTarget.kind}:${c.mentionTarget.id}`;
        return unreadKeys.has(key);
      }),
    );
  }, [state.unread_mentions, mentionPersonId]);

  useEffect(() => {
    const unread = new Set(state.unread_bulletin_ids ?? []);
    setCards((prev) =>
      prev.filter((c) => {
        if (c.kind !== "bulletin" && c.kind !== "in_review") return true;
        if (!c.bulletinId) return true;
        return unread.has(c.bulletinId);
      }),
    );
  }, [state.unread_bulletin_ids]);

  const value = useMemo(
    () => ({
      cards,
      removeCard,
      removeMentionCard,
      removeBulletinCard,
      clearAll,
    }),
    [cards, removeCard, removeMentionCard, removeBulletinCard, clearAll],
  );

  return (
    <UtilityNotificationsContext.Provider value={value}>
      {children}
    </UtilityNotificationsContext.Provider>
  );
}

export function useUtilityNotifications(): UtilityNotificationsContextValue {
  const ctx = useContext(UtilityNotificationsContext);
  if (!ctx) {
    return {
      cards: [],
      removeCard: () => {},
      removeMentionCard: () => {},
      removeBulletinCard: () => {},
      clearAll: () => {},
    };
  }
  return ctx;
}

function buildMentionCard(args: {
  row: MentionUnread;
  target: MentionTarget;
  state: {
    task_comments: { id: string; task_id: string; body: string; author_profile_id: string | null; created_at?: string }[];
    tasks: { id: string; title: string; project_id: string; notes: string }[];
    projects: Project[];
    clients: { id: string; name: string }[];
    people: {
      id: string;
      name: string;
      profile_id: string | null;
      deleted_at?: string | null;
    }[];
    profiles: {
      id: string;
      full_name: string | null;
      email: string;
    }[];
    assignments: {
      id: string;
      project_id: string;
      person_id: string;
      notes: string;
      start_date: string;
    }[];
  };
  projectHref: (
    project: Pick<Project, "client_id" | "slug">,
    search?: string,
  ) => string;
  appHref: (path: string) => string;
}): Omit<UtilityNotificationCard, "visible" | "enqueuedAt"> | null {
  const { row, target, state, projectHref, appHref } = args;
  const id = mentionCardId(row);

  if (target.kind === "comment") {
    const comment = state.task_comments.find((c) => c.id === target.id);
    const task = comment
      ? state.tasks.find((t) => t.id === comment.task_id)
      : undefined;
    const project = task
      ? state.projects.find((p) => p.id === task.project_id)
      : undefined;
    if (!comment || !task || !project) return null;
    const author = comment.author_profile_id
      ? state.profiles.find((p) => p.id === comment.author_profile_id)
      : undefined;
    const authorPerson = comment.author_profile_id
      ? state.people.find((p) => p.profile_id === comment.author_profile_id)
      : undefined;
    const client = project.client_id
      ? state.clients.find((c) => c.id === project.client_id)
      : undefined;
    const snippet = notesPlainText(comment.body).replace(/\s+/g, " ").trim();
    return {
      id,
      kind: "mention",
      href: projectHref(project, `task=${task.id}&comment=${comment.id}`),
      title: task.title || "Mention",
      subtitle: [
        resolveAuthorLabel(
          author
            ? {
                full_name: author.full_name ?? undefined,
                email: author.email,
              }
            : null,
          authorPerson
            ? {
                name: authorPerson.name,
                deleted_at: authorPerson.deleted_at ?? null,
              }
            : null,
        ),
        client?.name,
        project.name,
        snippet.slice(0, 80),
      ]
        .filter(Boolean)
        .join(" · "),
      mentionTarget: target,
    };
  }

  if (target.kind === "task") {
    const task = state.tasks.find((t) => t.id === target.id);
    const project = task
      ? state.projects.find((p) => p.id === task.project_id)
      : undefined;
    if (!task || !project) return null;
    const snippet = notesPlainText(task.notes).replace(/\s+/g, " ").trim();
    return {
      id,
      kind: "mention",
      href: projectHref(project, `task=${task.id}`),
      title: task.title || "Task mention",
      subtitle: [project.name, snippet.slice(0, 80)].filter(Boolean).join(" · "),
      mentionTarget: target,
    };
  }

  const assignment = state.assignments.find((a) => a.id === target.id);
  const project = assignment
    ? state.projects.find((p) => p.id === assignment.project_id)
    : undefined;
  if (!assignment || !project) return null;
  const qs = new URLSearchParams({
    person: assignment.person_id,
    assignment: assignment.id,
    tab: "details",
    date: assignment.start_date,
  });
  const snippet = notesPlainText(assignment.notes).replace(/\s+/g, " ").trim();
  return {
    id,
    kind: "mention",
    href: appHref(`/schedule?${qs.toString()}`),
    title: project.name || "Schedule mention",
    subtitle: ["Schedule note", snippet.slice(0, 80)]
      .filter(Boolean)
      .join(" · "),
    mentionTarget: target,
  };
}

function buildBulletinCard(args: {
  bulletin: Bulletin;
  projectHref: (
    project: Pick<Project, "client_id" | "slug">,
    search?: string,
  ) => string;
  appHref: (path: string) => string;
  state: {
    projects: Project[];
    people: { profile_id: string | null; name: string }[];
    profiles: { id: string; full_name: string | null; email: string }[];
  };
}): Omit<UtilityNotificationCard, "visible" | "enqueuedAt"> | null {
  const { bulletin, projectHref, appHref, state } = args;
  const inReview =
    isSystemBulletin(bulletin) && bulletin.tone === "success";
  const kind: UtilityNotificationKind = inReview ? "in_review" : "bulletin";
  const project = bulletin.project_id
    ? state.projects.find((p) => p.id === bulletin.project_id)
    : null;
  const href = project
    ? bulletin.task_id
      ? projectHref(project, `task=${bulletin.task_id}`)
      : bulletin.milestone_id
        ? projectHref(project, `milestone=${bulletin.milestone_id}`)
        : projectHref(project)
    : appHref("/dashboard");

  const authorPerson = bulletin.created_by_profile_id
    ? state.people.find((p) => p.profile_id === bulletin.created_by_profile_id)
    : null;
  const authorProfile = bulletin.created_by_profile_id
    ? state.profiles.find((p) => p.id === bulletin.created_by_profile_id)
    : null;
  const author =
    authorPerson?.name?.trim() ||
    authorProfile?.full_name?.trim() ||
    authorProfile?.email?.trim() ||
    (inReview ? "Review" : "Bulletin");
  const snippet = notesPlainText(bulletin.body).replace(/\s+/g, " ").trim();

  return {
    id: bulletinCardId(bulletin.id),
    kind,
    href,
    title: bulletin.title?.trim() || (inReview ? "Ready for review" : "Bulletin"),
    subtitle: [author, project?.name, snippet.slice(0, 60)]
      .filter(Boolean)
      .join(" · "),
    bulletinId: bulletin.id,
  };
}
