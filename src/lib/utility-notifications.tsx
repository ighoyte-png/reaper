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
import { useData } from "@/lib/data/store";
import { isSystemBulletin } from "@/lib/domain/bulletins";
import { mentionTargetFromUnread, mentionUnreadKey } from "@/lib/mentions";
import { notesPlainText } from "@/lib/notes-html";
import { resolveAuthorLabel } from "@/lib/domain/people";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { useViewAsOptional } from "@/lib/view-as";
import { desktopNotificationPermission } from "@/lib/desktop-notifications";
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
  /** Client display name when the notice is project-linked. */
  clientName?: string | null;
  /** Client brand color for the dock / dashboard color bar. */
  clientColor?: string | null;
  /** ISO time when enqueued (for stable oldest→newest order). */
  enqueuedAt: number;
  /** Fade-in after mount. */
  visible: boolean;
  /** Opened/acknowledged in the notification center (stays in the list). */
  read: boolean;
  mentionTarget?: MentionTarget;
  bulletinId?: string;
};

type UtilityNotificationsContextValue = {
  cards: UtilityNotificationCard[];
  centerOpen: boolean;
  openCenter: () => void;
  closeCenter: () => void;
  toggleCenter: () => void;
  markCardRead: (id: string) => void;
  removeCard: (id: string) => void;
  /** Mark matching mention cards as read (does not purge). */
  removeMentionCard: (target: MentionTarget) => void;
  /** Mark matching bulletin/in-review cards as read (does not purge). */
  removeBulletinCard: (bulletinId: string) => void;
  clearAll: () => void;
};

const UtilityNotificationsContext =
  createContext<UtilityNotificationsContextValue | null>(null);

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
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const viewAs = useViewAsOptional();
  const [cards, setCards] = useState<UtilityNotificationCard[]>([]);
  const [centerOpen, setCenterOpen] = useState(false);

  const seenMentionKeysRef = useRef<Set<string> | null>(null);
  const seenBulletinIdsRef = useRef<Set<string> | null>(null);
  const fadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const mentionPersonId =
    viewAs?.effectivePersonId ?? myPerson?.id ?? null;

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
    (card: Omit<UtilityNotificationCard, "visible" | "enqueuedAt" | "read">) => {
      if (isPublicShare) return;

      setCards((prev) => {
        if (prev.some((c) => c.id === card.id)) return prev;
        // Newest notices sit at the top of the center list.
        return [
          {
            ...card,
            enqueuedAt: Date.now(),
            visible: false,
            read: false,
          },
          ...prev,
        ];
      });
      scheduleVisible(card.id);
    },
    [isPublicShare, scheduleVisible],
  );

  const markCardRead = useCallback((id: string) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id && !c.read ? { ...c, read: true } : c)),
    );
  }, []);

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
      // Mark read in the center — do not purge (only X / Clear all remove cards).
      setCards((prev) => {
        let changed = false;
        const next = prev.map((c) => {
          if (
            c.kind !== "mention" ||
            !c.mentionTarget ||
            c.read ||
            `${c.mentionTarget.kind}:${c.mentionTarget.id}` !== key
          ) {
            return c;
          }
          changed = true;
          return { ...c, read: true };
        });
        return changed ? next : prev;
      });
    },
    [],
  );

  const removeBulletinCard = useCallback((bulletinId: string) => {
    // Mark read in the center — do not purge (only X / Clear all remove cards).
    setCards((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (
          (c.kind !== "bulletin" && c.kind !== "in_review") ||
          c.bulletinId !== bulletinId ||
          c.read
        ) {
          return c;
        }
        changed = true;
        return { ...c, read: true };
      });
      return changed ? next : prev;
    });
  }, []);

  const clearAll = useCallback(() => {
    for (const t of fadeTimersRef.current.values()) clearTimeout(t);
    fadeTimersRef.current.clear();
    setCards([]);
  }, []);

  const openCenter = useCallback(() => setCenterOpen(true), []);
  const closeCenter = useCallback(() => setCenterOpen(false), []);
  const toggleCenter = useCallback(() => setCenterOpen((v) => !v), []);

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
      seenBulletinIdsRef.current = new Set();
      for (const bulletinId of mine) {
        const bulletin =
          state.bulletins.find((b) => b.id === bulletinId) ?? null;
        if (!bulletin) continue;
        const built = buildBulletinCard({
          bulletin,
          projectHref,
          appHref,
          state,
        });
        if (built) {
          seenBulletinIdsRef.current.add(bulletinId);
          enqueue(built);
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
    enqueue,
    projectHref,
    appHref,
  ]);

  // When unread is cleared elsewhere (dashboard, etc.), mark as read but keep
  // the card in the notification center until the user dismisses it.
  useEffect(() => {
    if (!mentionPersonId) return;
    const unreadKeys = new Set(
      (state.unread_mentions ?? [])
        .filter((r) => r.person_id === mentionPersonId && !r.read_at)
        .map((r) => mentionUnreadKey(r))
        .filter(Boolean),
    );
    setCards((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (c.kind !== "mention" || !c.mentionTarget || c.read) return c;
        const key = `${c.mentionTarget.kind}:${c.mentionTarget.id}`;
        if (unreadKeys.has(key)) return c;
        changed = true;
        return { ...c, read: true };
      });
      return changed ? next : prev;
    });
  }, [state.unread_mentions, mentionPersonId]);

  useEffect(() => {
    const unread = new Set(state.unread_bulletin_ids ?? []);
    setCards((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (c.kind !== "bulletin" && c.kind !== "in_review") return c;
        if (!c.bulletinId || c.read) return c;
        if (unread.has(c.bulletinId)) return c;
        changed = true;
        return { ...c, read: true };
      });
      return changed ? next : prev;
    });
  }, [state.unread_bulletin_ids]);

  const value = useMemo(
    () => ({
      cards,
      centerOpen,
      openCenter,
      closeCenter,
      toggleCenter,
      markCardRead,
      removeCard,
      removeMentionCard,
      removeBulletinCard,
      clearAll,
    }),
    [
      cards,
      centerOpen,
      openCenter,
      closeCenter,
      toggleCenter,
      markCardRead,
      removeCard,
      removeMentionCard,
      removeBulletinCard,
      clearAll,
    ],
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
      centerOpen: false,
      openCenter: () => {},
      closeCenter: () => {},
      toggleCenter: () => {},
      markCardRead: () => {},
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
    clients: { id: string; name: string; color: string }[];
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
}): Omit<UtilityNotificationCard, "visible" | "enqueuedAt" | "read"> | null {
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
        project.name,
        snippet.slice(0, 120),
      ]
        .filter(Boolean)
        .join(" · "),
      clientName: client?.name ?? null,
      clientColor: client?.color ?? null,
      mentionTarget: target,
    };
  }

  if (target.kind === "task") {
    const task = state.tasks.find((t) => t.id === target.id);
    const project = task
      ? state.projects.find((p) => p.id === task.project_id)
      : undefined;
    if (!task || !project) return null;
    const client = project.client_id
      ? state.clients.find((c) => c.id === project.client_id)
      : undefined;
    const snippet = notesPlainText(task.notes).replace(/\s+/g, " ").trim();
    return {
      id,
      kind: "mention",
      href: projectHref(project, `task=${task.id}`),
      title: task.title || "Task mention",
      subtitle: [project.name, snippet.slice(0, 120)].filter(Boolean).join(" · "),
      clientName: client?.name ?? null,
      clientColor: client?.color ?? null,
      mentionTarget: target,
    };
  }

  const assignment = state.assignments.find((a) => a.id === target.id);
  const project = assignment
    ? state.projects.find((p) => p.id === assignment.project_id)
    : undefined;
  if (!assignment || !project) return null;
  const client = project.client_id
    ? state.clients.find((c) => c.id === project.client_id)
    : undefined;
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
    subtitle: ["Schedule note", snippet.slice(0, 120)]
      .filter(Boolean)
      .join(" · "),
    clientName: client?.name ?? null,
    clientColor: client?.color ?? null,
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
    clients: { id: string; name: string; color: string }[];
    people: { profile_id: string | null; name: string }[];
    profiles: { id: string; full_name: string | null; email: string }[];
  };
}): Omit<UtilityNotificationCard, "visible" | "enqueuedAt" | "read"> | null {
  const { bulletin, projectHref, appHref, state } = args;
  const inReview =
    isSystemBulletin(bulletin) && bulletin.tone === "success";
  const kind: UtilityNotificationKind = inReview ? "in_review" : "bulletin";
  const project = bulletin.project_id
    ? state.projects.find((p) => p.id === bulletin.project_id)
    : null;
  const client = project?.client_id
    ? state.clients.find((c) => c.id === project.client_id)
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
    subtitle: [author, project?.name, snippet.slice(0, 120)]
      .filter(Boolean)
      .join(" · "),
    clientName: client?.name ?? null,
    clientColor: client?.color ?? null,
    bulletinId: bulletin.id,
  };
}
