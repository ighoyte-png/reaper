"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { isUnreadBulletin } from "@/lib/domain/bulletins";
import { personAvatarColor, resolveAuthorLabel } from "@/lib/domain/people";
import { mentionUnreadKey } from "@/lib/mentions";
import { notesPlainText } from "@/lib/notes-html";
import { useViewAsOptional } from "@/lib/view-as";
import {
  ASSIGNMENT_NOTE_MENTION_EVENT,
  BULLETIN_UNREAD_EVENT,
  COMMENT_REACTION_EVENT,
  NEW_COMMENT_EVENT,
  TASK_NOTE_MENTION_EVENT,
  notificationPortraitIcon,
  reaperNotificationBadgeUrl,
  showDesktopNotification,
  type AssignmentNoteMentionBroadcast,
  type BulletinUnreadBroadcast,
  type CommentReactionBroadcast,
  type NewCommentBroadcast,
  type TaskNoteMentionBroadcast,
} from "@/lib/desktop-notifications";
import type { DemoState } from "@/lib/types";

async function notifyBulletinDesktop(args: {
  bulletinId: string;
  snap: DemoState;
  personId: string | null;
  profileId: string;
  manageWithoutPerson: boolean;
  unreadSet: Set<string>;
  orgName: string;
  projectHref: (
    project: { client_id: string | null; slug: string },
    search?: string,
  ) => string;
  appHref: (path: string) => string;
  router: { push: (href: string) => void };
}): Promise<"shown" | "skipped" | "missing"> {
  const {
    bulletinId,
    snap,
    personId,
    profileId,
    manageWithoutPerson,
    unreadSet,
    orgName,
    projectHref,
    appHref,
    router,
  } = args;
  const bulletin = snap.bulletins.find((b) => b.id === bulletinId) ?? null;
  if (!bulletin) return "missing";
  if (
    !isUnreadBulletin(bulletin, personId, profileId, unreadSet, {
      manageWithoutPerson,
      pods: snap.pods,
      podMembers: snap.pod_members,
    })
  ) {
    return "skipped";
  }

  const authorPerson = bulletin.created_by_profile_id
    ? (snap.people.find((p) => p.profile_id === bulletin.created_by_profile_id) ??
      null)
    : null;
  const authorProfile = bulletin.created_by_profile_id
    ? (snap.profiles.find((p) => p.id === bulletin.created_by_profile_id) ??
      null)
    : null;
  const authorName =
    authorPerson?.name?.trim() ||
    authorProfile?.full_name?.trim() ||
    authorProfile?.email?.trim() ||
    "Bulletin";

  const snippet = notesPlainText(bulletin.body).slice(0, 140);
  const linkedProject = bulletin.project_id
    ? (snap.projects.find((p) => p.id === bulletin.project_id) ?? null)
    : null;
  const href = linkedProject
    ? bulletin.task_id
      ? projectHref(linkedProject, `task=${bulletin.task_id}`)
      : bulletin.milestone_id
        ? projectHref(linkedProject, `milestone=${bulletin.milestone_id}`)
        : projectHref(linkedProject)
    : appHref("/dashboard");
  const isSuccess = bulletin.tone === "success";
  const isMilestone = Boolean(bulletin.milestone_id);
  const notifTitle = isSuccess
    ? orgName
    : authorPerson?.name?.trim() ||
      authorProfile?.full_name?.trim() ||
      authorProfile?.email?.trim() ||
      "Bulletin";
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
  const icon = authorPerson
    ? await notificationPortraitIcon({
        name: authorName,
        avatarUrl: authorPerson.avatar_url,
        avatarAttachmentId: authorPerson.avatar_attachment_id,
        color: personAvatarColor(authorPerson),
      })
    : reaperNotificationBadgeUrl();

  void showDesktopNotification(notifTitle, {
    body: notifBody,
    tag: `bulletin-${bulletinId}`,
    icon,
    href,
    onClick: () => {
      router.push(href);
    },
  });
  return "shown";
}

/**
 * Shows OS desktop notifications for @mentions (comments / task notes /
 * assignment notes), comment emoji reactions, and new bulletin board posts
 * (via unread_bulletin_ids).
 */
export function MentionDesktopListener() {
  const {
    ready,
    state,
    myPerson,
    profile,
    isPublicShare,
    ensureMentionComments,
    canManage,
  } = useData();
  const viewAs = useViewAsOptional();
  const router = useRouter();
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const seenMentionKeysRef = useRef<Set<string> | null>(null);
  const seenBulletinIdsRef = useRef<Set<string> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const notifyPersonId =
    viewAs?.effectivePersonId ?? myPerson?.id ?? null;

  useEffect(() => {
    if (isPublicShare || !notifyPersonId) {
      seenMentionKeysRef.current = null;
      return;
    }
    const mine = state.unread_mentions
      .filter((r) => r.person_id === notifyPersonId && !r.read_at)
      .map((r) => mentionUnreadKey(r))
      .filter(Boolean);

    if (seenMentionKeysRef.current === null) {
      seenMentionKeysRef.current = new Set(mine);
      return;
    }

    const seen = seenMentionKeysRef.current;
    const fresh = mine.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) seen.add(id);

    const myProfileId = profile?.id ?? null;
    const orgName = state.organization?.name?.trim() || "Reaper";
    const freshCommentIds = fresh
      .filter((k) => k.startsWith("comment:"))
      .map((k) => k.slice("comment:".length));

    void (async () => {
      try {
        const bundle = await ensureMentionComments(
          freshCommentIds.length > 0 ? freshCommentIds : undefined,
        );
        const snap = stateRef.current;
        const commentsById = new Map(
          snap.task_comments.map((c) => [c.id, c] as const),
        );
        for (const c of bundle.task_comments) commentsById.set(c.id, c);
        const tasksById = new Map(snap.tasks.map((t) => [t.id, t] as const));
        for (const t of bundle.tasks) tasksById.set(t.id, t);
        const assignmentsById = new Map(
          snap.assignments.map((a) => [a.id, a] as const),
        );
        for (const a of bundle.assignments ?? []) {
          assignmentsById.set(a.id, a);
        }

        for (const key of fresh) {
          if (key.startsWith("comment:")) {
            const commentId = key.slice("comment:".length);
            const comment = commentsById.get(commentId) ?? null;
            if (!comment) {
              seen.delete(key);
              continue;
            }
            if (
              comment.author_profile_id &&
              myProfileId &&
              comment.author_profile_id === myProfileId
            ) {
              continue;
            }
            const task = tasksById.get(comment.task_id) ?? null;
            const project = task
              ? (snap.projects.find((p) => p.id === task.project_id) ?? null)
              : null;
            const authorPerson = comment.author_profile_id
              ? (snap.people.find(
                  (p) => p.profile_id === comment.author_profile_id,
                ) ?? null)
              : null;
            const authorProfile = comment.author_profile_id
              ? (snap.profiles.find((p) => p.id === comment.author_profile_id) ??
                null)
              : null;
            const authorName = resolveAuthorLabel(authorProfile, authorPerson);
            const snippet = notesPlainText(comment.body)
              .replace(/\s+/g, " ")
              .trim();
            const snippetShort = snippet.slice(0, 140);
            const bodyParts = [orgName];
            if (task?.title?.trim()) {
              bodyParts.push(task.title.trim());
            }
            if (snippetShort) {
              bodyParts.push(snippetShort);
            } else if (!task?.title?.trim()) {
              bodyParts.push("New mention in a comment");
            }

            const icon = await notificationPortraitIcon({
              name: authorName,
              avatarUrl: authorPerson?.avatar_url,
              avatarAttachmentId: authorPerson?.avatar_attachment_id,
              color: authorPerson ? personAvatarColor(authorPerson) : null,
            });

            const href =
              project && task
                ? projectHref(project, `task=${task.id}&comment=${commentId}`)
                : appHref("/dashboard");

            void showDesktopNotification(authorName, {
              body: bodyParts.join("\n"),
              tag: `mention-comment-${commentId}`,
              icon,
              href,
              onClick: () => {
                router.push(href);
              },
            });
            continue;
          }

          if (key.startsWith("task:")) {
            const taskId = key.slice("task:".length);
            const task = tasksById.get(taskId) ?? null;
            if (!task) {
              seen.delete(key);
              continue;
            }
            const project =
              snap.projects.find((p) => p.id === task.project_id) ?? null;
            const authorProfileId =
              task.edited_by_profile_id ?? task.created_by_profile_id ?? null;
            if (authorProfileId && myProfileId && authorProfileId === myProfileId) {
              continue;
            }
            const authorPerson = authorProfileId
              ? (snap.people.find((p) => p.profile_id === authorProfileId) ??
                null)
              : null;
            const authorProfile = authorProfileId
              ? (snap.profiles.find((p) => p.id === authorProfileId) ?? null)
              : null;
            const authorName = resolveAuthorLabel(authorProfile, authorPerson);
            const icon = await notificationPortraitIcon({
              name: authorName,
              avatarUrl: authorPerson?.avatar_url,
              avatarAttachmentId: authorPerson?.avatar_attachment_id,
              color: authorPerson ? personAvatarColor(authorPerson) : null,
            });
            const href = project
              ? projectHref(project, `task=${task.id}`)
              : appHref("/dashboard");
            void showDesktopNotification(authorName, {
              body: [
                orgName,
                task.title
                  ? `Mentioned in task “${task.title}”`
                  : "Mentioned in a task description",
              ].join("\n"),
              tag: `mention-task-${taskId}`,
              icon,
              href,
              onClick: () => {
                router.push(href);
              },
            });
            continue;
          }

          if (key.startsWith("assignment:")) {
            const assignmentId = key.slice("assignment:".length);
            const assignment = assignmentsById.get(assignmentId) ?? null;
            if (!assignment) {
              seen.delete(key);
              continue;
            }
            const project =
              snap.projects.find((p) => p.id === assignment.project_id) ?? null;
            const authorProfileId = assignment.edited_by_profile_id;
            if (
              authorProfileId &&
              myProfileId &&
              authorProfileId === myProfileId
            ) {
              continue;
            }
            const authorPerson = authorProfileId
              ? (snap.people.find((p) => p.profile_id === authorProfileId) ??
                null)
              : null;
            const authorProfile = authorProfileId
              ? (snap.profiles.find((p) => p.id === authorProfileId) ?? null)
              : null;
            const authorName = resolveAuthorLabel(authorProfile, authorPerson);
            const icon = await notificationPortraitIcon({
              name: authorName,
              avatarUrl: authorPerson?.avatar_url,
              avatarAttachmentId: authorPerson?.avatar_attachment_id,
              color: authorPerson ? personAvatarColor(authorPerson) : null,
            });
            const qs = new URLSearchParams({
              person: assignment.person_id,
              assignment: assignment.id,
              tab: "details",
              date: assignment.start_date,
            });
            const href = appHref(`/schedule?${qs.toString()}`);
            void showDesktopNotification(authorName, {
              body: [
                orgName,
                project?.name
                  ? `Mentioned in schedule note · ${project.name}`
                  : "Mentioned in a schedule note",
              ].join("\n"),
              tag: `mention-assignment-${assignmentId}`,
              icon,
              href,
              onClick: () => {
                router.push(href);
              },
            });
          }
        }
      } catch {
        for (const id of fresh) seen.delete(id);
      }
    })();
  }, [
    state.unread_mentions,
    state.task_comments,
    state.organization?.name,
    notifyPersonId,
    profile?.id,
    isPublicShare,
    ensureMentionComments,
    router,
    projectHref,
    appHref,
  ]);

  useEffect(() => {
    if (isPublicShare) return;
    const personId = notifyPersonId;
    const myProfileId = profile?.id ?? null;
    if (!personId && !myProfileId) return;
    const orgName = state.organization?.name?.trim() || "Reaper";

    function onTaskNoteMention(ev: Event) {
      if (!personId) return;
      const detail = (ev as CustomEvent<TaskNoteMentionBroadcast>).detail;
      if (!detail?.personIds?.includes(personId)) return;

      const authorName = detail.authorName?.trim() || "Someone";
      void (async () => {
        const icon = await notificationPortraitIcon({
          name: authorName,
          avatarUrl: detail.authorAvatarUrl,
          avatarAttachmentId: detail.authorAvatarAttachmentId,
          color: detail.authorColor,
        });
        const project = stateRef.current.projects.find(
          (p) => p.id === detail.projectId,
        );
        const href = project
          ? projectHref(project, `task=${detail.taskId}`)
          : appHref("/dashboard");
        void showDesktopNotification(authorName, {
          body: [
            orgName,
            detail.taskTitle
              ? `In task “${detail.taskTitle}”`
              : "In a task note",
          ].join("\n"),
          tag: `mention-task-${detail.taskId}`,
          icon,
          href,
          onClick: () => {
            router.push(href);
          },
        });
      })();
    }

    function onAssignmentNoteMention(ev: Event) {
      if (!personId) return;
      const detail = (ev as CustomEvent<AssignmentNoteMentionBroadcast>).detail;
      if (!detail?.personIds?.includes(personId)) return;

      const authorName = detail.authorName?.trim() || "Someone";
      void (async () => {
        const icon = await notificationPortraitIcon({
          name: authorName,
          avatarUrl: detail.authorAvatarUrl,
          avatarAttachmentId: detail.authorAvatarAttachmentId,
          color: detail.authorColor,
        });
        const qs = new URLSearchParams({
          person: detail.personId,
          assignment: detail.assignmentId,
          tab: "details",
          date: detail.startDate,
        });
        const href = appHref(`/schedule?${qs.toString()}`);
        void showDesktopNotification(authorName, {
          body: [
            orgName,
            detail.projectName
              ? `In schedule note · ${detail.projectName}`
              : "In a schedule note",
          ].join("\n"),
          tag: `mention-assignment-${detail.assignmentId}`,
          icon,
          href,
          onClick: () => {
            router.push(href);
          },
        });
      })();
    }

    function onCommentReaction(ev: Event) {
      const detail = (ev as CustomEvent<CommentReactionBroadcast>).detail;
      if (!detail?.authorProfileId || !myProfileId) return;
      if (detail.authorProfileId !== myProfileId) return;
      if (detail.reactorProfileId === myProfileId) return;

      const reactorName = detail.reactorName?.trim() || "Someone";
      const emoji = detail.emoji?.trim() || "";
      void (async () => {
        const icon = await notificationPortraitIcon({
          name: reactorName,
          avatarUrl: detail.reactorAvatarUrl,
          avatarAttachmentId: detail.reactorAvatarAttachmentId,
          color: detail.reactorColor,
        });
        const project = detail.projectId
          ? (stateRef.current.projects.find((p) => p.id === detail.projectId) ??
            null)
          : null;
        const href =
          project && detail.taskId
            ? projectHref(
                project,
                `task=${detail.taskId}&comment=${detail.commentId}`,
              )
            : appHref("/dashboard");
        void showDesktopNotification(reactorName, {
          body: [
            orgName,
            emoji
              ? `${emoji} reacted to your comment`
              : "Reacted to your comment",
            detail.taskTitle ? detail.taskTitle : null,
          ]
            .filter(Boolean)
            .join("\n"),
          tag: `comment-reaction-${detail.commentId}-${detail.reactorProfileId}-${emoji}`,
          icon,
          href,
          onClick: () => {
            router.push(href);
          },
        });
      })();
    }

    function onNewComment(ev: Event) {
      if (!personId) return;
      const detail = (ev as CustomEvent<NewCommentBroadcast>).detail;
      if (!detail?.personIds?.includes(personId)) return;
      // Mention toast already covers newly @mentioned people.
      if (detail.mentionedPersonIds?.includes(personId)) return;

      const authorName = detail.authorName?.trim() || "Someone";
      void (async () => {
        const icon = await notificationPortraitIcon({
          name: authorName,
          avatarUrl: detail.authorAvatarUrl,
          avatarAttachmentId: detail.authorAvatarAttachmentId,
          color: detail.authorColor,
        });
        const project = detail.projectId
          ? (stateRef.current.projects.find((p) => p.id === detail.projectId) ??
            null)
          : null;
        const href =
          project && detail.taskId
            ? projectHref(
                project,
                `task=${detail.taskId}&comment=${detail.commentId}`,
              )
            : appHref("/dashboard");
        const snippet = detail.snippet?.trim() || "";
        void showDesktopNotification(authorName, {
          body: [
            orgName,
            detail.taskTitle
              ? `New comment on “${detail.taskTitle}”`
              : "New comment",
            snippet || null,
          ]
            .filter(Boolean)
            .join("\n"),
          tag: `new-comment-${detail.commentId}`,
          icon,
          href,
          onClick: () => {
            router.push(href);
          },
        });
      })();
    }

    window.addEventListener(TASK_NOTE_MENTION_EVENT, onTaskNoteMention);
    window.addEventListener(
      ASSIGNMENT_NOTE_MENTION_EVENT,
      onAssignmentNoteMention,
    );
    window.addEventListener(COMMENT_REACTION_EVENT, onCommentReaction);
    window.addEventListener(NEW_COMMENT_EVENT, onNewComment);
    return () => {
      window.removeEventListener(TASK_NOTE_MENTION_EVENT, onTaskNoteMention);
      window.removeEventListener(
        ASSIGNMENT_NOTE_MENTION_EVENT,
        onAssignmentNoteMention,
      );
      window.removeEventListener(COMMENT_REACTION_EVENT, onCommentReaction);
      window.removeEventListener(NEW_COMMENT_EVENT, onNewComment);
    };
  }, [
    isPublicShare,
    notifyPersonId,
    profile?.id,
    state.organization?.name,
    router,
    projectHref,
    appHref,
  ]);

  useEffect(() => {
    if (isPublicShare || !profile || !ready) {
      seenBulletinIdsRef.current = null;
      return;
    }

    const mine = state.unread_bulletin_ids;
    if (seenBulletinIdsRef.current === null) {
      seenBulletinIdsRef.current = new Set(mine);
      return;
    }

    const seen = seenBulletinIdsRef.current;
    const fresh = mine.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;

    const orgName = state.organization?.name?.trim() || "Reaper";
    const personId = notifyPersonId;
    const manageWithoutPerson = canManage && !personId;
    const unreadSet = new Set(mine);
    const profileId = profile.id;

    void (async () => {
      const snap = stateRef.current;
      for (const bulletinId of fresh) {
        const shown = await notifyBulletinDesktop({
          bulletinId,
          snap,
          personId,
          profileId,
          manageWithoutPerson,
          unreadSet,
          orgName,
          projectHref,
          appHref,
          router,
        });
        if (shown !== "missing") seen.add(bulletinId);
      }
    })();
  }, [
    ready,
    state.unread_bulletin_ids,
    state.organization?.name,
    state.bulletins,
    notifyPersonId,
    profile,
    canManage,
    isPublicShare,
    router,
    projectHref,
    appHref,
  ]);

  useEffect(() => {
    if (isPublicShare || !profile || !ready) return;
    const profileId = profile.id;
    const orgName = state.organization?.name?.trim() || "Reaper";
    const personId = notifyPersonId;
    const manageWithoutPerson = canManage && !personId;

    function onBulletinUnread(ev: Event) {
      const detail = (ev as CustomEvent<BulletinUnreadBroadcast>).detail;
      if (!detail?.bulletinId || detail.profileId !== profileId) return;
      if (seenBulletinIdsRef.current?.has(detail.bulletinId)) return;

      void (async () => {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          if (seenBulletinIdsRef.current?.has(detail.bulletinId)) return;
          const snap = stateRef.current;
          const shown = await notifyBulletinDesktop({
            bulletinId: detail.bulletinId,
            snap,
            personId,
            profileId,
            manageWithoutPerson,
            unreadSet: new Set([
              ...snap.unread_bulletin_ids,
              detail.bulletinId,
            ]),
            orgName,
            projectHref,
            appHref,
            router,
          });
          if (shown === "missing") {
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
          if (seenBulletinIdsRef.current) {
            seenBulletinIdsRef.current.add(detail.bulletinId);
          }
          return;
        }
      })();
    }

    window.addEventListener(BULLETIN_UNREAD_EVENT, onBulletinUnread);
    return () => {
      window.removeEventListener(BULLETIN_UNREAD_EVENT, onBulletinUnread);
    };
  }, [
    ready,
    isPublicShare,
    profile,
    notifyPersonId,
    canManage,
    state.organization?.name,
    router,
    projectHref,
    appHref,
  ]);

  return null;
}
