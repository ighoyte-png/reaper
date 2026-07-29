"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { isUnreadBulletin } from "@/lib/domain/bulletins";
import { personAvatarColor } from "@/lib/domain/people";
import { notesPlainText } from "@/lib/notes-html";
import {
  TASK_NOTE_MENTION_EVENT,
  notificationPortraitIcon,
  reaperNotificationBadgeUrl,
  showDesktopNotification,
  type TaskNoteMentionBroadcast,
} from "@/lib/desktop-notifications";

/**
 * Shows OS desktop notifications for @mentions (comments / task notes)
 * and new bulletin board posts (via unread_bulletin_ids).
 */
export function MentionDesktopListener() {
  const {
    state,
    myPerson,
    profile,
    isPublicShare,
    ensureMentionComments,
    canManage,
  } = useData();
  const router = useRouter();
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const seenCommentIdsRef = useRef<Set<string> | null>(null);
  const seenBulletinIdsRef = useRef<Set<string> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (isPublicShare || !myPerson) {
      seenCommentIdsRef.current = null;
      return;
    }
    const mine = state.unread_mentions
      .filter((r) => r.person_id === myPerson.id)
      .map((r) => r.comment_id);

    if (seenCommentIdsRef.current === null) {
      seenCommentIdsRef.current = new Set(mine);
      return;
    }

    const seen = seenCommentIdsRef.current;
    const fresh = mine.filter((id) => !seen.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) seen.add(id);

    const personId = myPerson.id;
    const myProfileId = profile?.id ?? null;
    const orgName = state.organization?.name?.trim() || "Reaper";

    void (async () => {
      try {
        const bundle = await ensureMentionComments(fresh);
        const snap = stateRef.current;
        const commentsById = new Map(
          snap.task_comments.map((c) => [c.id, c] as const),
        );
        for (const c of bundle.task_comments) commentsById.set(c.id, c);
        const tasksById = new Map(snap.tasks.map((t) => [t.id, t] as const));
        for (const t of bundle.tasks) tasksById.set(t.id, t);

        for (const commentId of fresh) {
          const comment = commentsById.get(commentId) ?? null;
          if (!comment) {
            // Keep unseen so a later fetch/realtime update can retry.
            seen.delete(commentId);
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
          const authorName =
            authorPerson?.name?.trim() ||
            authorProfile?.full_name?.trim() ||
            authorProfile?.email?.trim() ||
            "Someone";
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
            color: authorPerson ? personAvatarColor(authorPerson) : null,
          });

          const href =
            project && task
              ? projectHref(project, `task=${task.id}`)
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
        }
      } catch {
        for (const id of fresh) seen.delete(id);
      }
      void personId;
    })();
  }, [
    state.unread_mentions,
    state.task_comments,
    state.organization?.name,
    myPerson,
    profile?.id,
    isPublicShare,
    ensureMentionComments,
    router,
    projectHref,
    appHref,
  ]);

  useEffect(() => {
    if (isPublicShare || !myPerson) return;
    const personId = myPerson.id;
    const orgName = state.organization?.name?.trim() || "Reaper";

    function onTaskNoteMention(ev: Event) {
      const detail = (ev as CustomEvent<TaskNoteMentionBroadcast>).detail;
      if (!detail?.personIds?.includes(personId)) return;

      const authorName = detail.authorName?.trim() || "Someone";
      void (async () => {
        const icon = await notificationPortraitIcon({
          name: authorName,
          avatarUrl: detail.authorAvatarUrl,
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

    window.addEventListener(TASK_NOTE_MENTION_EVENT, onTaskNoteMention);
    return () =>
      window.removeEventListener(TASK_NOTE_MENTION_EVENT, onTaskNoteMention);
  }, [
    isPublicShare,
    myPerson,
    state.organization?.name,
    router,
    projectHref,
    appHref,
  ]);

  useEffect(() => {
    if (isPublicShare || !profile) {
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
    const personId = myPerson?.id ?? null;
    const manageWithoutPerson = canManage && !personId;
    const unreadSet = new Set(mine);

    void (async () => {
      const snap = stateRef.current;
      for (const bulletinId of fresh) {
        const bulletin =
          snap.bulletins.find((b) => b.id === bulletinId) ?? null;
        if (!bulletin) {
          // Unread row can arrive before the bulletin payload — retry later.
          continue;
        }
        seen.add(bulletinId);
        if (
          !isUnreadBulletin(bulletin, personId, profile.id, unreadSet, {
            manageWithoutPerson,
            pods: snap.pods,
            podMembers: snap.pod_members,
          })
        ) {
          continue;
        }

        const authorPerson = bulletin.created_by_profile_id
          ? (snap.people.find(
              (p) => p.profile_id === bulletin.created_by_profile_id,
            ) ?? null)
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
          ? projectHref(linkedProject)
          : appHref("/dashboard");
        const isSuccess = bulletin.tone === "success";
        const notifTitle = isSuccess
          ? orgName
          : authorPerson?.name?.trim() ||
            authorProfile?.full_name?.trim() ||
            authorProfile?.email?.trim() ||
            "Bulletin";
        const notifBody = isSuccess
          ? bulletin.title || snippet || "Milestone approved"
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
      }
    })();
  }, [
    state.unread_bulletin_ids,
    state.organization?.name,
    state.bulletins,
    myPerson?.id,
    profile,
    canManage,
    isPublicShare,
    router,
    projectHref,
    appHref,
  ]);

  return null;
}
