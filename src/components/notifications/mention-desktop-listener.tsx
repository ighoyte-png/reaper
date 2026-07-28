"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { personAvatarColor } from "@/lib/domain/people";
import { notesPlainText } from "@/lib/notes-html";
import {
  TASK_NOTE_MENTION_EVENT,
  notificationPortraitIcon,
  showDesktopNotification,
  type TaskNoteMentionBroadcast,
} from "@/lib/desktop-notifications";

/**
 * Shows OS desktop notifications when the signed-in person is @mentioned
 * in a task comment (via mention_unreads) or task notes (via broadcast).
 */
export function MentionDesktopListener() {
  const {
    state,
    myPerson,
    profile,
    isPublicShare,
    ensureMentionComments,
  } = useData();
  const router = useRouter();
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const seenCommentIdsRef = useRef<Set<string> | null>(null);
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
      await ensureMentionComments(fresh);
      const snap = stateRef.current;
      for (const commentId of fresh) {
        const comment =
          snap.task_comments.find((c) => c.id === commentId) ?? null;
        if (
          comment?.author_profile_id &&
          myProfileId &&
          comment.author_profile_id === myProfileId
        ) {
          continue;
        }
        const task = comment
          ? (snap.tasks.find((t) => t.id === comment.task_id) ?? null)
          : null;
        const project = task
          ? (snap.projects.find((p) => p.id === task.project_id) ?? null)
          : null;
        const authorPerson = comment?.author_profile_id
          ? (snap.people.find((p) => p.profile_id === comment.author_profile_id) ??
            null)
          : null;
        const authorProfile = comment?.author_profile_id
          ? (snap.profiles.find((p) => p.id === comment.author_profile_id) ??
            null)
          : null;
        const authorName =
          authorPerson?.name?.trim() ||
          authorProfile?.full_name?.trim() ||
          authorProfile?.email?.trim() ||
          "Someone";
        const snippet = comment
          ? notesPlainText(comment.body).slice(0, 140)
          : "";
        const bodyParts = [
          orgName,
          task
            ? `${task.title}${snippet ? ` — ${snippet}` : ""}`
            : snippet || "New mention in a comment",
        ];

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
      void personId;
    })();
  }, [
    state.unread_mentions,
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

  return null;
}
