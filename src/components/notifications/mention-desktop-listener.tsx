"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import {
  TASK_NOTE_MENTION_EVENT,
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

        showDesktopNotification("New mention", {
          body: "Open Reaper to view the mention",
          tag: `mention-comment-${commentId}`,
          onClick: () => {
            const latest = stateRef.current;
            const c =
              latest.task_comments.find((x) => x.id === commentId) ?? comment;
            const t = c
              ? (latest.tasks.find((x) => x.id === c.task_id) ?? task)
              : task;
            const p = t
              ? (latest.projects.find((x) => x.id === t.project_id) ?? project)
              : project;
            if (p && t) {
              router.push(projectHref(p, `task=${t.id}`));
            } else {
              router.push(appHref("/dashboard"));
            }
          },
        });
      }
      void personId;
    })();
  }, [
    state.unread_mentions,
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

    function onTaskNoteMention(ev: Event) {
      const detail = (ev as CustomEvent<TaskNoteMentionBroadcast>).detail;
      if (!detail?.personIds?.includes(personId)) return;

      showDesktopNotification("New mention", {
          body: "Open Reaper to view the mention",
          tag: `mention-task-${detail.taskId}`,
          onClick: () => {
            const project = stateRef.current.projects.find(
              (p) => p.id === detail.projectId,
            );
            if (project) {
              router.push(projectHref(project, `task=${detail.taskId}`));
            } else {
              router.push(appHref("/dashboard"));
            }
          },
        });
    }

    window.addEventListener(TASK_NOTE_MENTION_EVENT, onTaskNoteMention);
    return () =>
      window.removeEventListener(TASK_NOTE_MENTION_EVENT, onTaskNoteMention);
  }, [isPublicShare, myPerson, router, projectHref, appHref]);

  return null;
}
