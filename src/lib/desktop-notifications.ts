/** Browser desktop notifications for @mentions (projects comments / task notes). */

export function desktopNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function desktopNotificationPermission(): NotificationPermission | "unsupported" {
  if (!desktopNotificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** Request permission (call from a user gesture when possible). */
export async function ensureDesktopNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!desktopNotificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showDesktopNotification(
  title: string,
  opts?: {
    body?: string;
    tag?: string;
    onClick?: () => void;
  },
): Notification | null {
  if (!desktopNotificationsSupported()) return null;
  if (Notification.permission !== "granted") return null;
  try {
    const notification = new Notification(title, {
      body: opts?.body,
      tag: opts?.tag,
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      opts?.onClick?.();
      notification.close();
    };
    return notification;
  } catch {
    return null;
  }
}

export type TaskNoteMentionBroadcast = {
  personIds: string[];
  taskId: string;
  projectId: string;
  taskTitle: string;
  authorName: string;
};

export const TASK_NOTE_MENTION_EVENT = "reaper:task-note-mention";

export function dispatchTaskNoteMention(detail: TaskNoteMentionBroadcast) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TASK_NOTE_MENTION_EVENT, { detail }),
  );
}
