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
import { isMilestoneApprovalBulletin, isTaskInReviewBulletin } from "@/lib/domain/bulletins";
import { taskThreadMessageNotifyPersonId } from "@/lib/domain/tasks";
import { mentionTargetFromUnread, mentionUnreadKey } from "@/lib/mentions";
import {
  clearNotificationCenterCards,
  notificationCenterStorageKey,
  readNotificationCenterCards,
  writeNotificationCenterCards,
} from "@/lib/notification-center-persist";
import { notesPlainText } from "@/lib/notes-html";
import {
  desktopNotificationPermission,
  notificationPortraitIcon,
  reaperNotificationBadgeUrl,
  showDesktopNotification,
  TASK_ASSIGNED_EVENT,
  type TaskAssignedBroadcast,
} from "@/lib/desktop-notifications";
import { personAvatarColor, resolveAuthorLabel } from "@/lib/domain/people";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { useViewAsOptional } from "@/lib/view-as";
import type {
  Bulletin,
  MentionTarget,
  MentionUnread,
  Project,
  Task,
  TaskComment,
} from "@/lib/types";

export type UtilityNotificationKind =
  | "mention"
  | "bulletin"
  | "in_review"
  | "milestone_approved"
  | "message"
  | "assigned";

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
  /** Task thread reply (assigner ↔ assignee). */
  taskId?: string;
  commentId?: string;
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
  /** Mark matching message cards as read (does not purge). */
  removeMessageCard: (taskId: string) => void;
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

function messageCardId(commentId: string): string {
  return `message:${commentId}`;
}

function assignedNotifyCardId(taskId: string): string {
  return `assigned:${taskId}:notify`;
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
  const [storageReady, setStorageReady] = useState(false);

  const seenMentionKeysRef = useRef<Set<string> | null>(null);
  const seenBulletinIdsRef = useRef<Set<string> | null>(null);
  const seenMessageCommentIdsRef = useRef<Set<string> | null>(null);
  const seenAssignedCardIdsRef = useRef<Set<string> | null>(null);
  /** After first message-thread pass, new cards also get a desktop push. */
  const messageDesktopSeededRef = useRef(false);
  /** After first mention pass, new mention cards also get a desktop push. */
  const mentionDesktopSeededRef = useRef(false);
  /** After first bulletin pass, new bulletin cards also get a desktop push. */
  const bulletinDesktopSeededRef = useRef(false);
  const fadeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const storageKeyRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const mentionPersonId =
    viewAs?.effectivePersonId ?? myPerson?.id ?? null;
  const mentionPersonIdRef = useRef(mentionPersonId);
  mentionPersonIdRef.current = mentionPersonId;
  const orgId = state.organization?.id || null;
  const profileId = profile?.id ?? null;
  const storageKey =
    !isPublicShare && orgId && profileId && mentionPersonId
      ? notificationCenterStorageKey(orgId, profileId, mentionPersonId)
      : null;

  // Restore cards from localStorage before unread watchers run.
  useEffect(() => {
    for (const t of fadeTimersRef.current.values()) clearTimeout(t);
    fadeTimersRef.current.clear();

    if (!storageKey) {
      storageKeyRef.current = null;
      seenMentionKeysRef.current = null;
      seenBulletinIdsRef.current = null;
      seenMessageCommentIdsRef.current = null;
      seenAssignedCardIdsRef.current = null;
      messageDesktopSeededRef.current = false;
      mentionDesktopSeededRef.current = false;
      bulletinDesktopSeededRef.current = false;
      setCards([]);
      setStorageReady(false);
      return;
    }

    const restored = readNotificationCenterCards(storageKey);
    storageKeyRef.current = storageKey;
    messageDesktopSeededRef.current = false;
    mentionDesktopSeededRef.current = false;
    bulletinDesktopSeededRef.current = false;

    const mentionSeen = new Set<string>();
    const bulletinSeen = new Set<string>();
    const messageSeen = new Set<string>();
    const assignedSeen = new Set<string>();
    for (const card of restored) {
      if (card.kind === "mention" && card.mentionTarget) {
        mentionSeen.add(`${card.mentionTarget.kind}:${card.mentionTarget.id}`);
      } else if (
        (card.kind === "bulletin" ||
          card.kind === "in_review" ||
          card.kind === "milestone_approved") &&
        card.bulletinId
      ) {
        bulletinSeen.add(card.bulletinId);
      } else if (card.kind === "message" && card.commentId) {
        messageSeen.add(card.commentId);
      } else if (card.kind === "assigned") {
        assignedSeen.add(card.id);
      }
    }
    seenMentionKeysRef.current = mentionSeen;
    seenBulletinIdsRef.current = bulletinSeen;
    seenMessageCommentIdsRef.current = messageSeen;
    seenAssignedCardIdsRef.current = assignedSeen;

    setCards(
      restored.map((c) => ({
        ...c,
        visible: true,
      })),
    );
    setStorageReady(true);
  }, [storageKey]);

  // Remap legacy in_review cards that are actually milestone approvals.
  useEffect(() => {
    if (!storageReady || isPublicShare) return;
    setCards((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (c.kind !== "in_review" || !c.bulletinId) return c;
        const bulletin = state.bulletins.find((b) => b.id === c.bulletinId);
        if (!bulletin || !isMilestoneApprovalBulletin(bulletin)) return c;
        changed = true;
        return { ...c, kind: "milestone_approved" as const };
      });
      return changed ? next : prev;
    });
  }, [storageReady, isPublicShare, state.bulletins]);

  // Persist whenever the list changes (read/unread/dismiss).
  useEffect(() => {
    if (!storageKey || !storageReady || storageKeyRef.current !== storageKey) {
      return;
    }
    writeNotificationCenterCards(
      storageKey,
      cards.map((c) => ({
        id: c.id,
        kind: c.kind,
        href: c.href,
        title: c.title,
        subtitle: c.subtitle,
        clientName: c.clientName,
        clientColor: c.clientColor,
        enqueuedAt: c.enqueuedAt,
        read: c.read,
        mentionTarget: c.mentionTarget,
        bulletinId: c.bulletinId,
        taskId: c.taskId,
        commentId: c.commentId,
      })),
    );
  }, [cards, storageKey, storageReady]);

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
          (c.kind !== "bulletin" &&
            c.kind !== "in_review" &&
            c.kind !== "milestone_approved") ||
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

  const removeMessageCard = useCallback((taskId: string) => {
    setCards((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (c.kind !== "message" || c.taskId !== taskId || c.read) return c;
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
    if (storageKeyRef.current) {
      clearNotificationCenterCards(storageKeyRef.current);
    }
  }, []);

  const openCenter = useCallback(() => setCenterOpen(true), []);
  const closeCenter = useCallback(() => setCenterOpen(false), []);
  const toggleCenter = useCallback(() => setCenterOpen((v) => !v), []);

  // Watch mention unreads
  useEffect(() => {
    if (!storageReady || isPublicShare || !mentionPersonId) return;
    const mine = (state.unread_mentions ?? []).filter(
      (r) => r.person_id === mentionPersonId && !r.read_at,
    );

    if (seenMentionKeysRef.current === null) {
      seenMentionKeysRef.current = new Set();
    }
    const seen = seenMentionKeysRef.current;
    const pushDesktop = mentionDesktopSeededRef.current;
    const orgName = state.organization?.name?.trim() || "Reaper";

    for (const row of mine) {
      const k = mentionUnreadKey(row);
      if (!k || seen.has(k)) continue;
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
      if (pushDesktop) {
        pushMentionDesktop({
          target,
          href: built.href,
          title: built.title,
          orgName,
          state,
        });
      }
    }
    mentionDesktopSeededRef.current = true;
  }, [
    storageReady,
    state.unread_mentions,
    state.task_comments,
    state.tasks,
    state.projects,
    state.clients,
    state.people,
    state.profiles,
    state.assignments,
    state.organization?.name,
    mentionPersonId,
    isPublicShare,
    enqueue,
    projectHref,
    appHref,
  ]);

  // Watch bulletin unreads
  useEffect(() => {
    if (!storageReady || isPublicShare || !profile) return;
    const mine = state.unread_bulletin_ids ?? [];
    if (seenBulletinIdsRef.current === null) {
      seenBulletinIdsRef.current = new Set();
    }
    const seen = seenBulletinIdsRef.current;
    const pushDesktop = bulletinDesktopSeededRef.current;
    const orgName = state.organization?.name?.trim() || "Reaper";

    for (const bulletinId of mine) {
      if (seen.has(bulletinId)) continue;
      const bulletin =
        state.bulletins.find((b) => b.id === bulletinId) ?? null;
      if (!bulletin) continue;
      const built = buildBulletinCard({
        bulletin,
        projectHref,
        appHref,
        state,
      });
      if (!built) continue;
      seen.add(bulletinId);
      enqueue(built);
      if (pushDesktop) {
        pushBulletinDesktop({
          bulletin,
          href: built.href,
          orgName,
          state,
        });
      }
    }
    bulletinDesktopSeededRef.current = true;
  }, [
    storageReady,
    state.unread_bulletin_ids,
    state.bulletins,
    state.projects,
    state.clients,
    state.people,
    state.profiles,
    state.organization?.name,
    profile,
    isPublicShare,
    enqueue,
    projectHref,
    appHref,
  ]);

  // Watch assigner ↔ assignee task-thread replies
  useEffect(() => {
    if (!storageReady || isPublicShare || !mentionPersonId) return;

    const unreadTaskIds = new Set(
      (state.unread_task_threads ?? [])
        .filter((r) => r.person_id === mentionPersonId)
        .map((r) => r.task_id),
    );

    const qualifyingComments = (
      state.task_comments as TaskComment[]
    ).filter((comment) => {
      if (!unreadTaskIds.has(comment.task_id)) return false;
      if (comment.mentioned_person_ids?.includes(mentionPersonId)) {
        return false;
      }
      const task = state.tasks.find((t) => t.id === comment.task_id);
      if (!task) return false;
      const project =
        state.projects.find((p) => p.id === task.project_id) ?? null;
      const authorPerson = comment.author_profile_id
        ? state.people.find((p) => p.profile_id === comment.author_profile_id)
        : null;
      if (!authorPerson) return false;
      return (
        taskThreadMessageNotifyPersonId(
          task,
          authorPerson.id,
          state.people,
          project,
        ) === mentionPersonId
      );
    });

    if (seenMessageCommentIdsRef.current === null) {
      const pendingCommentLoad = [...unreadTaskIds].some((taskId) => {
        return !(state.task_comments as TaskComment[]).some(
          (c) => c.task_id === taskId,
        );
      });
      if (
        pendingCommentLoad &&
        (state.task_comments as TaskComment[]).length === 0
      ) {
        return;
      }
      seenMessageCommentIdsRef.current = new Set();
    }

    const seen = seenMessageCommentIdsRef.current;
    const pushDesktop = messageDesktopSeededRef.current;
    const orgName = state.organization?.name?.trim() || "Reaper";
    const byTask = new Map<string, TaskComment[]>();
    for (const comment of qualifyingComments) {
      const list = byTask.get(comment.task_id) ?? [];
      list.push(comment);
      byTask.set(comment.task_id, list);
    }

    const enqueueMessage = (
      comment: TaskComment,
      opts: { desktop: boolean },
    ) => {
      const built = buildMessageCard({
        comment,
        state,
        projectHref,
      });
      if (!built) return;
      enqueue(built);
      if (opts.desktop) {
        pushTaskMessageDesktop({
          comment,
          href: built.href,
          taskTitle: built.title,
          orgName,
          state,
        });
      }
    };

    for (const comments of byTask.values()) {
      const sorted = [...comments].sort((a, b) => {
        const ta = a.created_at ?? "";
        const tb = b.created_at ?? "";
        if (ta !== tb) return ta < tb ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      const anySeen = sorted.some((c) => seen.has(c.id));
      if (!anySeen) {
        for (const c of sorted) seen.add(c.id);
        const latest = sorted[sorted.length - 1];
        if (latest) {
          enqueueMessage(latest, { desktop: pushDesktop });
        }
        continue;
      }
      for (const comment of sorted) {
        if (seen.has(comment.id)) continue;
        seen.add(comment.id);
        enqueueMessage(comment, { desktop: pushDesktop });
      }
    }

    for (const comment of state.task_comments as TaskComment[]) {
      if (!unreadTaskIds.has(comment.task_id)) {
        seen.add(comment.id);
      }
    }

    messageDesktopSeededRef.current = true;
  }, [
    storageReady,
    state.unread_task_threads,
    state.task_comments,
    state.tasks,
    state.projects,
    state.clients,
    state.people,
    state.profiles,
    state.organization?.name,
    mentionPersonId,
    isPublicShare,
    enqueue,
    projectHref,
  ]);

  // Opt-in "assigned to you" (create task → Notify the assignee).
  useEffect(() => {
    if (!storageReady || isPublicShare) return;

    function onTaskAssigned(ev: Event) {
      const personId = mentionPersonIdRef.current;
      if (!personId) return;
      const detail = (ev as CustomEvent<TaskAssignedBroadcast>).detail;
      if (!detail?.personIds?.includes(personId)) return;

      if (seenAssignedCardIdsRef.current === null) {
        seenAssignedCardIdsRef.current = new Set();
      }
      const seenCards = seenAssignedCardIdsRef.current;
      const cardId = assignedNotifyCardId(detail.taskId);
      if (seenCards.has(cardId)) return;

      const snap = stateRef.current;
      const built = buildAssignedCardFromNotify({
        detail,
        state: snap,
        projectHref,
      });
      if (!built) return;
      seenCards.add(cardId);
      enqueue(built);

      const orgName = snap.organization?.name?.trim() || "Reaper";
      const authorName = detail.authorName?.trim() || "Someone";
      void (async () => {
        const icon = await notificationPortraitIcon({
          name: authorName,
          avatarUrl: detail.authorAvatarUrl,
          avatarAttachmentId: detail.authorAvatarAttachmentId,
          color: detail.authorColor,
        });
        void showDesktopNotification(authorName, {
          body: [
            orgName,
            detail.taskTitle?.trim()
              ? `Assigned you “${detail.taskTitle.trim()}”`
              : "Assigned you a task",
          ].join("\n"),
          tag: `task-assigned-${detail.taskId}`,
          icon,
          href: built.href,
        });
      })();
    }
    window.addEventListener(TASK_ASSIGNED_EVENT, onTaskAssigned);
    return () => {
      window.removeEventListener(TASK_ASSIGNED_EVENT, onTaskAssigned);
    };
  }, [storageReady, isPublicShare, enqueue, projectHref]);

  // When unread is cleared elsewhere, mark as read but keep the card.
  useEffect(() => {
    if (!storageReady || !mentionPersonId) return;
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
  }, [storageReady, state.unread_mentions, mentionPersonId]);

  useEffect(() => {
    if (!storageReady) return;
    const unread = new Set(state.unread_bulletin_ids ?? []);
    setCards((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (
          c.kind !== "bulletin" &&
          c.kind !== "in_review" &&
          c.kind !== "milestone_approved"
        )
          return c;
        if (!c.bulletinId || c.read) return c;
        if (unread.has(c.bulletinId)) return c;
        changed = true;
        return { ...c, read: true };
      });
      return changed ? next : prev;
    });
  }, [storageReady, state.unread_bulletin_ids]);

  useEffect(() => {
    if (!storageReady || !mentionPersonId) return;
    const unreadTasks = new Set(
      (state.unread_task_threads ?? [])
        .filter((r) => r.person_id === mentionPersonId)
        .map((r) => r.task_id),
    );
    setCards((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (c.kind !== "message" || !c.taskId || c.read) return c;
        if (unreadTasks.has(c.taskId)) return c;
        changed = true;
        return { ...c, read: true };
      });
      return changed ? next : prev;
    });
  }, [storageReady, state.unread_task_threads, mentionPersonId]);

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
      removeMessageCard,
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
      removeMessageCard,
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
      removeMessageCard: () => {},
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
  const milestoneApproved = isMilestoneApprovalBulletin(bulletin);
  const inReview = isTaskInReviewBulletin(bulletin);
  const kind: UtilityNotificationKind = milestoneApproved
    ? "milestone_approved"
    : inReview
      ? "in_review"
      : "bulletin";
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
    (milestoneApproved ? "Milestone" : inReview ? "Review" : "Bulletin");
  const snippet = notesPlainText(bulletin.body).replace(/\s+/g, " ").trim();

  return {
    id: bulletinCardId(bulletin.id),
    kind,
    href,
    title:
      bulletin.title?.trim() ||
      (milestoneApproved
        ? "Milestone approved"
        : inReview
          ? "Ready for review"
          : "Bulletin"),
    subtitle: [author, project?.name, snippet.slice(0, 120)]
      .filter(Boolean)
      .join(" · "),
    clientName: client?.name ?? null,
    clientColor: client?.color ?? null,
    bulletinId: bulletin.id,
  };
}

function buildMessageCard(args: {
  comment: TaskComment;
  state: {
    tasks: Pick<
      Task,
      "id" | "title" | "project_id" | "assignee_person_id" | "created_by_profile_id"
    >[];
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
  };
  projectHref: (
    project: Pick<Project, "client_id" | "slug">,
    search?: string,
  ) => string;
}): Omit<UtilityNotificationCard, "visible" | "enqueuedAt" | "read"> | null {
  const { comment, state, projectHref } = args;
  const task = state.tasks.find((t) => t.id === comment.task_id);
  const project = task
    ? state.projects.find((p) => p.id === task.project_id)
    : undefined;
  if (!task || !project) return null;
  const client = project.client_id
    ? state.clients.find((c) => c.id === project.client_id)
    : undefined;
  const author = comment.author_profile_id
    ? state.profiles.find((p) => p.id === comment.author_profile_id)
    : undefined;
  const authorPerson = comment.author_profile_id
    ? state.people.find((p) => p.profile_id === comment.author_profile_id)
    : undefined;
  const snippet = notesPlainText(comment.body).replace(/\s+/g, " ").trim();
  return {
    id: messageCardId(comment.id),
    kind: "message",
    href: projectHref(project, `task=${task.id}&comment=${comment.id}`),
    title: task.title || "New message",
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
    taskId: task.id,
    commentId: comment.id,
  };
}

function pushMentionDesktop(args: {
  target: MentionTarget;
  href: string;
  title: string;
  orgName: string;
  state: {
    task_comments: {
      id: string;
      body: string;
      author_profile_id: string | null;
    }[];
    tasks: {
      id: string;
      title: string;
      notes: string;
      created_by_profile_id?: string | null;
      edited_by_profile_id?: string | null;
    }[];
    assignments: {
      id: string;
      notes: string;
      edited_by_profile_id?: string | null;
      project_id: string;
    }[];
    people: {
      id: string;
      name: string;
      profile_id: string | null;
      avatar_url?: string | null;
      avatar_attachment_id?: string | null;
      avatar_color?: string | null;
      deleted_at?: string | null;
    }[];
    profiles: {
      id: string;
      full_name: string | null;
      email: string;
    }[];
    projects: { id: string; name: string }[];
  };
}): void {
  const { target, href, title, orgName, state } = args;
  let authorProfileId: string | null = null;
  let bodyLine = title;
  let tag = `mention-${target.kind}-${target.id}`;

  if (target.kind === "comment") {
    const comment = state.task_comments.find((c) => c.id === target.id);
    if (!comment) return;
    authorProfileId = comment.author_profile_id;
    const snippet = notesPlainText(comment.body).replace(/\s+/g, " ").trim();
    bodyLine = [
      orgName,
      title ? `Mentioned you in “${title}”` : "Mentioned you in a comment",
      snippet.slice(0, 140) || null,
    ]
      .filter(Boolean)
      .join("\n");
    tag = `mention-comment-${target.id}`;
  } else if (target.kind === "task") {
    const task = state.tasks.find((t) => t.id === target.id);
    if (!task) return;
    authorProfileId =
      task.edited_by_profile_id ?? task.created_by_profile_id ?? null;
    bodyLine = [
      orgName,
      task.title
        ? `Mentioned in task “${task.title}”`
        : "Mentioned in a task description",
    ].join("\n");
    tag = `mention-task-${target.id}`;
  } else if (target.kind === "assignment") {
    const assignment = state.assignments.find((a) => a.id === target.id);
    if (!assignment) return;
    authorProfileId = assignment.edited_by_profile_id ?? null;
    const project = state.projects.find((p) => p.id === assignment.project_id);
    bodyLine = [
      orgName,
      project?.name
        ? `Mentioned in schedule note · ${project.name}`
        : "Mentioned in a schedule note",
    ].join("\n");
    tag = `mention-assignment-${target.id}`;
  }

  const authorPerson = authorProfileId
    ? state.people.find((p) => p.profile_id === authorProfileId)
    : undefined;
  const authorProfile = authorProfileId
    ? state.profiles.find((p) => p.id === authorProfileId)
    : undefined;
  const authorName =
    resolveAuthorLabel(
      authorProfile
        ? {
            full_name: authorProfile.full_name ?? undefined,
            email: authorProfile.email,
          }
        : null,
      authorPerson
        ? {
            name: authorPerson.name,
            deleted_at: authorPerson.deleted_at ?? null,
          }
        : null,
    ) || "Someone";

  void (async () => {
    const icon = await notificationPortraitIcon({
      name: authorName,
      avatarUrl: authorPerson?.avatar_url,
      avatarAttachmentId: authorPerson?.avatar_attachment_id,
      color: authorPerson
        ? personAvatarColor({
            id: authorPerson.id,
            avatar_color: authorPerson.avatar_color ?? null,
          })
        : null,
    });
    void showDesktopNotification(authorName, {
      body: bodyLine,
      tag,
      icon,
      href,
    });
  })();
}

function pushBulletinDesktop(args: {
  bulletin: Bulletin;
  href: string;
  orgName: string;
  state: {
    people: {
      id: string;
      name: string;
      profile_id: string | null;
      avatar_url?: string | null;
      avatar_attachment_id?: string | null;
      avatar_color?: string | null;
      deleted_at?: string | null;
    }[];
    profiles: {
      id: string;
      full_name: string | null;
      email: string;
    }[];
  };
}): void {
  const { bulletin, href, orgName, state } = args;
  const isSuccess = bulletin.tone === "success";
  const isMilestone = Boolean(bulletin.milestone_id);
  const authorPerson = bulletin.created_by_profile_id
    ? state.people.find((p) => p.profile_id === bulletin.created_by_profile_id)
    : undefined;
  const authorProfile = bulletin.created_by_profile_id
    ? state.profiles.find((p) => p.id === bulletin.created_by_profile_id)
    : undefined;
  const authorName =
    resolveAuthorLabel(
      authorProfile
        ? {
            full_name: authorProfile.full_name ?? undefined,
            email: authorProfile.email,
          }
        : null,
      authorPerson
        ? {
            name: authorPerson.name,
            deleted_at: authorPerson.deleted_at ?? null,
          }
        : null,
    ) || "Bulletin";
  const snippet = notesPlainText(bulletin.body).slice(0, 140);
  const notifTitle = isSuccess ? orgName : authorName;
  const notifBody = isSuccess
    ? bulletin.title ||
      snippet ||
      (isMilestone ? "Milestone approved" : "Ready for review")
    : [
        orgName,
        bulletin.title
          ? `${bulletin.title}${snippet ? ` — ${snippet}` : ""}`
          : snippet || "New bulletin",
      ].join("\n");

  void (async () => {
    const icon = authorPerson
      ? await notificationPortraitIcon({
          name: authorName,
          avatarUrl: authorPerson.avatar_url,
          avatarAttachmentId: authorPerson.avatar_attachment_id,
          color: personAvatarColor({
            id: authorPerson.id,
            avatar_color: authorPerson.avatar_color ?? null,
          }),
        })
      : reaperNotificationBadgeUrl();
    void showDesktopNotification(notifTitle, {
      body: notifBody,
      tag: `bulletin-${bulletin.id}`,
      icon,
      href,
    });
  })();
}

function pushTaskMessageDesktop(args: {
  comment: TaskComment;
  href: string;
  taskTitle: string;
  orgName: string;
  state: {
    people: {
      id: string;
      name: string;
      profile_id: string | null;
      avatar_url?: string | null;
      avatar_attachment_id?: string | null;
      avatar_color?: string | null;
      deleted_at?: string | null;
    }[];
    profiles: {
      id: string;
      full_name: string | null;
      email: string;
    }[];
  };
}): void {
  const { comment, href, taskTitle, orgName, state } = args;
  const authorPerson = comment.author_profile_id
    ? state.people.find((p) => p.profile_id === comment.author_profile_id)
    : undefined;
  const authorProfile = comment.author_profile_id
    ? state.profiles.find((p) => p.id === comment.author_profile_id)
    : undefined;
  const authorName =
    resolveAuthorLabel(
      authorProfile
        ? {
            full_name: authorProfile.full_name ?? undefined,
            email: authorProfile.email,
          }
        : null,
      authorPerson
        ? {
            name: authorPerson.name,
            deleted_at: authorPerson.deleted_at ?? null,
          }
        : null,
    ) || "Someone";
  const snippet = notesPlainText(comment.body)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

  void (async () => {
    const icon = await notificationPortraitIcon({
      name: authorName,
      avatarUrl: authorPerson?.avatar_url,
      avatarAttachmentId: authorPerson?.avatar_attachment_id,
      color: authorPerson
        ? personAvatarColor({
            id: authorPerson.id,
            avatar_color: authorPerson.avatar_color ?? null,
          })
        : null,
    });
    void showDesktopNotification(authorName, {
      body: [
        orgName,
        taskTitle.trim()
          ? `New comment on “${taskTitle.trim()}”`
          : "New comment",
        snippet || null,
      ]
        .filter(Boolean)
        .join("\n"),
      // Same tag as the org-broadcast path so OS toasts coalesce.
      tag: `new-comment-${comment.id}`,
      icon,
      href,
    });
  })();
}

function buildAssignedCardFromNotify(args: {
  detail: TaskAssignedBroadcast;
  state: {
    tasks: Pick<Task, "id" | "title" | "project_id">[];
    projects: Project[];
    clients: { id: string; name: string; color: string }[];
  };
  projectHref: (
    project: Pick<Project, "client_id" | "slug">,
    search?: string,
  ) => string;
}): Omit<UtilityNotificationCard, "visible" | "enqueuedAt" | "read"> | null {
  const { detail, state, projectHref } = args;
  const task = state.tasks.find((t) => t.id === detail.taskId);
  const project = state.projects.find(
    (p) => p.id === (task?.project_id ?? detail.projectId),
  );
  if (!project) return null;
  const client = project.client_id
    ? state.clients.find((c) => c.id === project.client_id)
    : undefined;
  const authorName = detail.authorName?.trim() || null;
  const title = (task?.title ?? detail.taskTitle)?.trim() || "Task assigned";
  return {
    id: assignedNotifyCardId(detail.taskId),
    kind: "assigned",
    href: projectHref(project, `task=${detail.taskId}`),
    title,
    subtitle: [
      authorName ? `${authorName} assigned you` : "Assigned to you",
      project.name,
    ]
      .filter(Boolean)
      .join(" · "),
    clientName: client?.name ?? null,
    clientColor: client?.color ?? null,
    taskId: detail.taskId,
  };
}
