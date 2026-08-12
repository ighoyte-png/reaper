/** Browser / PWA desktop notifications for @mentions. */

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

/**
 * Slack-style circular portrait for notification `icon`.
 * Uses the avatar when loadable; otherwise initials on the person color.
 */
export async function notificationPortraitIcon(opts: {
  name: string;
  avatarUrl?: string | null;
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

  const avatarUrl = opts.avatarUrl?.trim() || null;
  if (avatarUrl) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = "anonymous";
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("avatar load failed"));
        el.src = avatarUrl;
      });
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      return canvas.toDataURL("image/png");
    } catch {
      /* fall through to initials */
    }
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

  const swOptions: NotificationOptions = {
    body: opts?.body,
    tag: opts?.tag,
    icon,
    badge,
    data: { href },
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
      data: { href },
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
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
  authorColor?: string | null;
};

export const TASK_NOTE_MENTION_EVENT = "reaper:task-note-mention";

export function dispatchTaskNoteMention(detail: TaskNoteMentionBroadcast) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TASK_NOTE_MENTION_EVENT, { detail }),
  );
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
