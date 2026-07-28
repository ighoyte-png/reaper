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
  if (!ctx) return absoluteUrl("/reaper_logo.svg");

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

export function showDesktopNotification(
  title: string,
  opts?: {
    body?: string;
    tag?: string;
    /** Square portrait / app graphic (URL or data URL). */
    icon?: string;
    /** Small badge (Android); falls back to Reaper mark. */
    badge?: string;
    onClick?: () => void;
  },
): Notification | null {
  if (!desktopNotificationsSupported()) return null;
  if (Notification.permission !== "granted") return null;
  try {
    const icon = opts?.icon ? absoluteUrl(opts.icon) : absoluteUrl("/reaper_logo.svg");
    const badge = opts?.badge
      ? absoluteUrl(opts.badge)
      : absoluteUrl("/reaper_logo.svg");
    const notification = new Notification(title, {
      body: opts?.body,
      tag: opts?.tag,
      icon,
      badge,
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
