import { avatarContentAbsoluteUrl } from "@/lib/storage/avatar-url";

/** Browser / PWA desktop notifications for @mentions and comment reactions. */

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
  let permission: NotificationPermission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }
  if (permission === "granted") {
    void import("@/lib/web-push-client").then(({ ensurePushSubscription }) => {
      void ensurePushSubscription();
    });
  }
  return permission;
}

function absoluteUrl(pathOrUrl: string): string {
  if (
    pathOrUrl.startsWith("data:") ||
    pathOrUrl.startsWith("blob:") ||
    /^https?:\/\//i.test(pathOrUrl)
  ) {
    return pathOrUrl;
  }
  if (typeof window === "undefined") return pathOrUrl;
  try {
    return new URL(pathOrUrl, window.location.origin).href;
  } catch {
    return pathOrUrl;
  }
}

/** Prefer PWA icon PNG over SVG for OS notification chrome / badge. */
export function reaperNotificationBadgeUrl(): string {
  return absoluteUrl("/pwa-icons/192");
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (
    parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}

function drawInitialsPortrait(
  ctx: CanvasRenderingContext2D,
  size: number,
  name: string,
  color: string,
) {
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${Math.round(size * 0.38)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initialsFromName(name), size / 2, size / 2 + size * 0.02);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("avatar load failed"));
    el.src = url;
  });
}

/**
 * Prefer a durable attachment id (immutable same-origin avatar proxy) over a
 * possibly expired bootstrap signed `avatar_url`.
 */
export async function resolveNotificationAvatarUrl(opts: {
  avatarUrl?: string | null;
  avatarAttachmentId?: string | null;
}): Promise<string | null> {
  const attachmentId = opts.avatarAttachmentId?.trim() || null;
  if (attachmentId) {
    return avatarContentAbsoluteUrl(attachmentId);
  }
  const seedUrl = opts.avatarUrl?.trim() || null;
  return seedUrl ? absoluteUrl(seedUrl) : null;
}

/**
 * Slack-style circular portrait for notification `icon`.
 * Uses the avatar when loadable; otherwise initials on the person color.
 */
export async function notificationPortraitIcon(opts: {
  name: string;
  avatarUrl?: string | null;
  avatarAttachmentId?: string | null;
  color?: string | null;
}): Promise<string> {
  const size = 192;
  const color = opts.color?.trim() || "#546E7A";
  const name = opts.name.trim() || "Someone";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return reaperNotificationBadgeUrl();

  const attachmentId = opts.avatarAttachmentId?.trim() || null;
  let avatarUrl = await resolveNotificationAvatarUrl({
    avatarUrl: opts.avatarUrl,
    avatarAttachmentId: attachmentId,
  });

  const tryDraw = async (url: string): Promise<string | null> => {
    try {
      const img = await loadImage(url);
      ctx.save();
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const dataUrl = canvas.toDataURL("image/png");
      ctx.restore();
      return dataUrl;
    } catch {
      try {
        ctx.restore();
      } catch {
        /* ignore */
      }
      return null;
    }
  };

  if (avatarUrl) {
    const drawn = await tryDraw(avatarUrl);
    if (drawn) return drawn;
  }

  drawInitialsPortrait(ctx, size, name, color);
  return canvas.toDataURL("image/png");
}


async function showViaServiceWorker(
  title: string,
  options: NotificationOptions,
): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg?.showNotification) return false;
    await reg.showNotification(title, options);
    return true;
  } catch {
    return false;
  }
}

/** Fired when a non-SW OS notification is clicked (fallback path). */
export const OS_NOTIFICATION_CLICK_EVENT = "reaper:os-notification-click";

/**
 * Show an OS notification. Prefers the service worker path so an *installed*
 * PWA can brand the toast as Reaper; falls back to `new Notification`.
 */
export async function showDesktopNotification(
  title: string,
  opts?: {
    body?: string;
    tag?: string;
    /** Square portrait / app graphic (URL or data URL). */
    icon?: string;
    /** Small badge (Android); falls back to Reaper mark. */
    badge?: string;
    /** Path or URL opened on click (preferred for SW notifications). */
    href?: string;
    /** Durable feed row id — marked read when the OS toast is clicked. */
    notificationId?: string;
    onClick?: () => void;
  },
): Promise<void> {
  if (!desktopNotificationsSupported()) return;
  if (Notification.permission !== "granted") return;

  const icon = opts?.icon
    ? absoluteUrl(opts.icon)
    : reaperNotificationBadgeUrl();
  const badge = opts?.badge
    ? absoluteUrl(opts.badge)
    : reaperNotificationBadgeUrl();
  const href = opts?.href ? absoluteUrl(opts.href) : absoluteUrl("/");
  const notificationId = opts?.notificationId
    ? String(opts.notificationId)
    : undefined;

  const swOptions: NotificationOptions = {
    body: opts?.body,
    tag: opts?.tag,
    icon,
    badge,
    data: { href, notificationId },
  };

  if (await showViaServiceWorker(title, swOptions)) {
    return;
  }

  try {
    const notification = new Notification(title, {
      body: opts?.body,
      tag: opts?.tag,
      icon,
      badge,
      data: { href, notificationId },
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      if (notificationId) {
        window.dispatchEvent(
          new CustomEvent(OS_NOTIFICATION_CLICK_EVENT, {
            detail: { notificationId, href },
          }),
        );
      }
      if (opts?.onClick) {
        opts.onClick();
      } else if (opts?.href) {
        window.location.assign(href);
      }
      notification.close();
    };
  } catch {
    /* ignore */
  }
}

export type TaskNoteMentionBroadcast = {
  personIds: string[];
  taskId: string;
  projectId: string;
  taskTitle: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  authorAvatarAttachmentId?: string | null;
  authorColor?: string | null;
};

export const TASK_NOTE_MENTION_EVENT = "reaper:task-note-mention";

export function dispatchTaskNoteMention(detail: TaskNoteMentionBroadcast) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TASK_NOTE_MENTION_EVENT, { detail }),
  );
}

export type AssignmentNoteMentionBroadcast = {
  personIds: string[];
  assignmentId: string;
  projectId: string;
  personId: string;
  startDate: string;
  projectName: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  authorAvatarAttachmentId?: string | null;
  authorColor?: string | null;
};

export const ASSIGNMENT_NOTE_MENTION_EVENT = "reaper:assignment-note-mention";

export function dispatchAssignmentNoteMention(
  detail: AssignmentNoteMentionBroadcast,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ASSIGNMENT_NOTE_MENTION_EVENT, { detail }),
  );
}

export type CommentReactionBroadcast = {
  authorProfileId: string;
  reactorProfileId: string;
  commentId: string;
  taskId: string;
  projectId: string;
  taskTitle: string;
  emoji: string;
  reactorName: string;
  reactorAvatarUrl?: string | null;
  reactorAvatarAttachmentId?: string | null;
  reactorColor?: string | null;
};

export const COMMENT_REACTION_EVENT = "reaper:comment-reaction";

export function dispatchCommentReaction(detail: CommentReactionBroadcast) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COMMENT_REACTION_EVENT, { detail }));
}

export type NewCommentBroadcast = {
  /** People who should see the toast (person ids). */
  personIds: string[];
  /** Newly @mentioned people — they get the mention toast instead. */
  mentionedPersonIds: string[];
  commentId: string;
  taskId: string;
  projectId: string;
  taskTitle: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  authorAvatarAttachmentId?: string | null;
  authorColor?: string | null;
  snippet?: string;
};

export const NEW_COMMENT_EVENT = "reaper:new-comment";

export function dispatchNewComment(detail: NewCommentBroadcast) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NEW_COMMENT_EVENT, { detail }));
}

export type TaskAssignedBroadcast = {
  personIds: string[];
  taskId: string;
  projectId: string;
  taskTitle: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  authorAvatarAttachmentId?: string | null;
  authorColor?: string | null;
};

export const TASK_ASSIGNED_EVENT = "reaper:task-assigned";

export function dispatchTaskAssigned(detail: TaskAssignedBroadcast) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TASK_ASSIGNED_EVENT, { detail }));
}

export type BulletinUnreadBroadcast = {
  bulletinId: string;
  profileId: string;
};

export const BULLETIN_UNREAD_EVENT = "reaper:bulletin-unread";

export function dispatchBulletinUnread(detail: BulletinUnreadBroadcast) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(BULLETIN_UNREAD_EVENT, { detail }));
}

const PROMPT_SNOOZE_KEY = "reaper.notification-prompt.snooze-until";
const PROMPT_DISMISS_KEY = "reaper.notification-prompt.dismissed";
const PROMPT_SNOOZE_MS = 24 * 60 * 60 * 1000;

/** Whether the in-app enable-notifications bar should be offered. */
export function shouldOfferNotificationPermissionPrompt(): boolean {
  if (!desktopNotificationsSupported()) return false;
  if (Notification.permission === "granted") return false;
  // Browser blocked — Enable can't recover without OS settings.
  if (Notification.permission === "denied") return false;
  try {
    if (localStorage.getItem(PROMPT_DISMISS_KEY) === "1") return false;
    const until = Number(localStorage.getItem(PROMPT_SNOOZE_KEY) || "");
    if (Number.isFinite(until) && until > Date.now()) return false;
  } catch {
    /* private mode */
  }
  return true;
}

export function snoozeNotificationPermissionPrompt(days = 1): void {
  try {
    const ms = Math.max(0, days) * PROMPT_SNOOZE_MS;
    localStorage.setItem(PROMPT_SNOOZE_KEY, String(Date.now() + ms));
  } catch {
    /* ignore */
  }
}

/** Hide the prompt until the user clears storage (X dismiss). */
export function dismissNotificationPermissionPrompt(): void {
  try {
    localStorage.setItem(PROMPT_DISMISS_KEY, "1");
    localStorage.removeItem(PROMPT_SNOOZE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearNotificationPermissionPromptPrefs(): void {
  try {
    localStorage.removeItem(PROMPT_SNOOZE_KEY);
    localStorage.removeItem(PROMPT_DISMISS_KEY);
  } catch {
    /* ignore */
  }
}
