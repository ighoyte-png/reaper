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
  | "assigned";

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

/**
 * Shared notice card chrome (Notification Center + Dashboard widgets).
 * Kind wash, icon tile, client bar, Read/Unread chip, dismiss/actions.
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
  statusChip?: boolean;
  onActivate?: () => void;
  /** Right-side controls (dismiss, edit, delete). */
  actions?: ReactNode;
  className?: string;
}) {
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
          aria-label={`${read ? "Read" : "Unread"}: ${title}`}
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
        <div className="mb-1 flex min-w-0 items-center gap-1.5">
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
          {statusChip ? (
            <span
              className={cn(
                "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                read
                  ? "bg-[var(--bg)]/80 text-[var(--text-muted)]"
                  : tone === "bulletin"
                    ? "bg-[var(--status-over)]/15 text-[var(--status-over)]"
                    : tone === "in_review"
                      ? "bg-[var(--status-healthy)]/15 text-[var(--status-healthy)]"
                      : tone === "milestone_approved"
                        ? "bg-[var(--status-milestone)]/15 text-[var(--status-milestone)]"
                        : tone === "assigned"
                        ? "bg-[var(--status-near)]/15 text-[var(--status-near)]"
                        : tone === "message"
                          ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                          : "bg-[var(--status-attention)]/15 text-[var(--status-attention)]",
              )}
            >
              {read ? "Read" : "Unread"}
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            "text-[13px] leading-snug",
            read
              ? "font-medium text-[var(--text-muted)]"
              : "font-semibold text-[var(--text)]",
          )}
        >
          {title}
        </p>
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
      </div>
      {actions ? (
        <div className="relative z-[2] flex shrink-0 items-start gap-0.5">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function noticeCardActionClassName(destructive = false): string {
  return cn(
    "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] opacity-70 hover:bg-[var(--bg)]/80 hover:opacity-100",
    destructive && "hover:text-[var(--status-over)]",
  );
}
