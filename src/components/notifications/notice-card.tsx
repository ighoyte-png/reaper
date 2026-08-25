"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { cn } from "@/lib/cn";

/** Color language shared by Notification Center + Dashboard notice widgets. */
export type NoticeCardTone =
  | "mention"
  | "bulletin"
  | "in_review"
  | "milestone_approved"
  | "message"
  | "assigned"
  | "reaction";

export function noticeToneClass(
  tone: NoticeCardTone,
  read: boolean,
): string {
  if (read) return "bg-[var(--bg-elevated)]/60";
  if (tone === "mention") return "bg-[var(--status-attention-wash)]";
  if (tone === "in_review") return "bg-[var(--status-healthy)]/15";
  if (tone === "milestone_approved") return "bg-[var(--status-milestone)]/15";
  if (tone === "bulletin") return "bg-[var(--status-over)]/15";
  if (tone === "assigned") return "bg-[var(--status-near)]/15";
  if (tone === "reaction") return "bg-[var(--accent)]/12";
  return "bg-[var(--accent)]/15";
}

export function noticeIconClass(
  tone: NoticeCardTone,
  read: boolean,
): string {
  if (read) return "text-[var(--text-muted)]";
  if (tone === "mention") return "text-[var(--status-attention)]";
  if (tone === "in_review") return "text-[var(--status-healthy)]";
  if (tone === "milestone_approved") return "text-[var(--status-milestone)]";
  if (tone === "bulletin") return "text-[var(--status-over)]";
  if (tone === "assigned") return "text-[var(--status-near)]";
  return "text-[var(--accent)]";
}

export function noticeUnreadDotClass(tone: NoticeCardTone): string {
  if (tone === "in_review") return "bg-[var(--status-healthy)]";
  if (tone === "milestone_approved") return "bg-[var(--status-milestone)]";
  if (tone === "bulletin") return "bg-[var(--status-over)]";
  if (tone === "assigned") return "bg-[var(--status-near)]";
  if (tone === "message") return "bg-[var(--accent)]";
  return "bg-[var(--status-attention)]";
}

function noticeStatusChipClass(tone: NoticeCardTone, read: boolean): string {
  if (read) return "bg-[var(--bg)]/80 text-[var(--text-muted)]";
  if (tone === "bulletin") {
    return "bg-[var(--status-over)]/15 text-[var(--status-over)]";
  }
  if (tone === "in_review") {
    return "bg-[var(--status-healthy)]/15 text-[var(--status-healthy)]";
  }
  if (tone === "milestone_approved") {
    return "bg-[var(--status-milestone)]/15 text-[var(--status-milestone)]";
  }
  if (tone === "assigned") {
    return "bg-[var(--status-near)]/15 text-[var(--status-near)]";
  }
  if (tone === "message" || tone === "reaction") {
    return "bg-[var(--accent)]/15 text-[var(--accent)]";
  }
  return "bg-[var(--status-attention)]/15 text-[var(--status-attention)]";
}

/** Compact relative time for notice meta (e.g. 3m, 2h, Yesterday). */
export function formatNoticeTimestamp(
  value: number | string | Date | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (value == null) return "";
  const ms =
    typeof value === "number"
      ? value
      : value instanceof Date
        ? value.getTime()
        : Date.parse(value);
  if (!Number.isFinite(ms)) return "";

  const delta = Math.max(0, nowMs - ms);
  const sec = Math.floor(delta / 1000);
  if (sec < 45) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;

  const dayStart = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const dayDiff = Math.round((dayStart(nowMs) - dayStart(ms)) / 86_400_000);
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) {
    return new Date(ms).toLocaleDateString(undefined, { weekday: "short" });
  }
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Shared notice card chrome (Notification Center + Dashboard widgets).
 * Icon + title/body, footer meta (client · status · time), dismiss/actions.
 */
export function NoticeCard({
  tone,
  read,
  icon: Icon,
  clientColor,
  clientName,
  title,
  subtitle,
  children,
  metaExtra,
  timestamp,
  statusChip = true,
  onActivate,
  actions,
  className,
}: {
  tone: NoticeCardTone;
  read: boolean;
  icon: LucideIcon;
  clientColor?: string | null;
  clientName?: string | null;
  title: string;
  subtitle?: string | null;
  /** Rich body / extra content under the title. */
  children?: ReactNode;
  /** Optional marker in the meta row (e.g. pin). */
  metaExtra?: ReactNode;
  /** When the notice was created / enqueued (ms, ISO, or Date). */
  timestamp?: number | string | Date | null;
  statusChip?: boolean;
  onActivate?: () => void;
  /** Right-side controls (dismiss, edit, delete). */
  actions?: ReactNode;
  className?: string;
}) {
  const timeLabel = formatNoticeTimestamp(timestamp);
  const showFooter =
    Boolean(clientColor || clientName || metaExtra) ||
    statusChip ||
    Boolean(timeLabel);

  return (
    <div
      className={cn(
        "group relative flex w-full gap-2.5 rounded-[var(--radius-md)] border p-3 text-left transition-colors",
        read
          ? "border-[var(--border)]/80 opacity-80"
          : "border-[var(--border)]",
        noticeToneClass(tone, read),
        "hover:brightness-[0.98] dark:hover:brightness-110",
        onActivate && "cursor-pointer",
        className,
      )}
    >
      {onActivate ? (
        <button
          type="button"
          className="absolute inset-0 cursor-pointer rounded-[var(--radius-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-label={`${read ? "Read" : "Unread"}: ${title}${timeLabel ? `, ${timeLabel}` : ""}`}
          onClick={onActivate}
        />
      ) : null}
      {!read ? (
        <span
          className={cn(
            "absolute left-1.5 top-1.5 z-[2] h-1.5 w-1.5 rounded-full",
            noticeUnreadDotClass(tone),
          )}
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "relative z-[1] mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg)]/70",
          noticeIconClass(tone, read),
        )}
        aria-hidden
      >
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <div className="relative z-[1] min-w-0 flex-1 pointer-events-none">
        <div className="flex items-start gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 text-[13px] leading-snug",
              read
                ? "font-medium text-[var(--text-muted)]"
                : "font-semibold text-[var(--text)]",
            )}
          >
            {title}
          </p>
          {actions ? (
            <div className="relative z-[2] -mr-1 -mt-0.5 flex shrink-0 items-start gap-0.5 pointer-events-auto">
              {actions}
            </div>
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
            {subtitle}
          </p>
        ) : null}
        {children ? (
          <div className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)] [&_a]:pointer-events-auto">
            {children}
          </div>
        ) : null}
        {showFooter ? (
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            {clientColor ? <ProjectColorBar color={clientColor} /> : null}
            {clientName ? (
              <span
                className={cn(
                  "min-w-0 truncate text-[11px] font-medium",
                  read ? "text-[var(--text-muted)]" : "text-[var(--text)]",
                )}
              >
                {clientName}
              </span>
            ) : null}
            {metaExtra}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {statusChip ? (
                <span
                  className={cn(
                    "rounded px-1 py-px text-[8px] font-semibold uppercase leading-none tracking-wide",
                    noticeStatusChipClass(tone, read),
                  )}
                >
                  {read ? "Read" : "Unread"}
                </span>
              ) : null}
              {timeLabel ? (
                <time
                  className="text-[10px] tabular-nums text-[var(--text-muted)]"
                  dateTime={
                    typeof timestamp === "number"
                      ? new Date(timestamp).toISOString()
                      : timestamp instanceof Date
                        ? timestamp.toISOString()
                        : typeof timestamp === "string"
                          ? timestamp
                          : undefined
                  }
                  title={
                    typeof timestamp === "number"
                      ? new Date(timestamp).toLocaleString()
                      : timestamp instanceof Date
                        ? timestamp.toLocaleString()
                        : typeof timestamp === "string"
                          ? new Date(timestamp).toLocaleString()
                          : undefined
                  }
                >
                  {timeLabel}
                </time>
              ) : null}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function noticeCardActionClassName(destructive = false): string {
  return cn(
    "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] opacity-70 hover:bg-[var(--bg)]/80 hover:opacity-100",
    destructive && "hover:text-[var(--status-over)]",
  );
}
