"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Bell,
  ClipboardCheck,
  Megaphone,
  MessageSquare,
  Milestone,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/form";
import {
  NoticeCard,
  noticeCardActionClassName,
  type NoticeCardTone,
} from "@/components/notifications/notice-card";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import {
  useUtilityNotifications,
  type UtilityNotificationCard,
  type UtilityNotificationKind,
} from "@/lib/utility-notifications";

const COUNT_GLOW_MS = 750;

function kindIcon(kind: UtilityNotificationKind): LucideIcon {
  if (kind === "mention") return AtSign;
  if (kind === "in_review") return ClipboardCheck;
  if (kind === "milestone_approved") return Milestone;
  if (kind === "message") return MessageSquare;
  if (kind === "assigned") return UserPlus;
  return Megaphone;
}

function kindAsTone(kind: UtilityNotificationKind): NoticeCardTone {
  return kind;
}

function dismissCard(
  card: UtilityNotificationCard,
  args: {
    removeCard: (id: string) => void;
    markMentionRead: (
      target: NonNullable<UtilityNotificationCard["mentionTarget"]>,
      personId: string,
    ) => void;
    dismissBulletin: (bulletinId: string) => void;
    dismissTaskThreadUnread: (taskId: string, personId: string) => void;
    dismissAssignedUnread: (taskId: string, personId: string) => void;
    personId: string | null | undefined;
  },
) {
  args.removeCard(card.id);
  if (card.kind === "mention" && card.mentionTarget && args.personId) {
    args.markMentionRead(card.mentionTarget, args.personId);
  } else if (
    (card.kind === "bulletin" ||
      card.kind === "in_review" ||
      card.kind === "milestone_approved") &&
    card.bulletinId
  ) {
    args.dismissBulletin(card.bulletinId);
  } else if (card.kind === "message" && card.taskId && args.personId) {
    args.dismissTaskThreadUnread(card.taskId, args.personId);
  } else if (card.kind === "assigned" && card.taskId && args.personId) {
    args.dismissAssignedUnread(card.taskId, args.personId);
  }
}

function acknowledgeCard(
  card: UtilityNotificationCard,
  args: {
    markCardRead: (id: string) => void;
    markMentionRead: (
      target: NonNullable<UtilityNotificationCard["mentionTarget"]>,
      personId: string,
    ) => void;
    dismissTaskThreadUnread: (taskId: string, personId: string) => void;
    dismissAssignedUnread: (taskId: string, personId: string) => void;
    personId: string | null | undefined;
  },
) {
  const wasUnread = !card.read;
  args.markCardRead(card.id);
  if (!wasUnread) return;
  if (card.kind === "mention" && card.mentionTarget && args.personId) {
    args.markMentionRead(card.mentionTarget, args.personId);
  } else if (card.kind === "message" && card.taskId && args.personId) {
    args.dismissTaskThreadUnread(card.taskId, args.personId);
  } else if (card.kind === "assigned" && card.taskId && args.personId) {
    args.dismissAssignedUnread(card.taskId, args.personId);
  }
}

/**
 * Windows 11–style notification center: right-edge flyout fed by utility notices.
 * Opened from the top-bar bell (left of search).
 */
export function NotificationCenter() {
  const router = useRouter();
  const {
    markMentionRead,
    dismissBulletin,
    dismissTaskThreadUnread,
    dismissAssignedUnread,
    myPerson,
    isPublicShare,
    profile,
  } = useData();
  const {
    cards,
    removeCard,
    markCardRead,
    clearAll,
    centerOpen,
    closeCenter,
  } = useUtilityNotifications();

  const panelRef = useRef<HTMLElement>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const slides = useMemo(
    () =>
      [...cards].sort((a, b) => {
        if (a.read !== b.read) return a.read ? 1 : -1;
        return b.enqueuedAt - a.enqueuedAt;
      }),
    [cards],
  );
  const unreadCount = useMemo(
    () => cards.filter((c) => !c.read).length,
    [cards],
  );
  const count = slides.length;

  useEffect(() => {
    if (!centerOpen) setConfirmClearAll(false);
  }, [centerOpen]);

  useEffect(() => {
    if (!centerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmClearAll) {
        setConfirmClearAll(false);
        return;
      }
      closeCenter();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [centerOpen, closeCenter, confirmClearAll]);

  if (isPublicShare || !profile) {
    return null;
  }

  const dismissArgs = {
    removeCard,
    markMentionRead,
    dismissBulletin,
    dismissTaskThreadUnread,
    dismissAssignedUnread,
    personId: myPerson?.id,
  };

  function onActivate(card: UtilityNotificationCard) {
    acknowledgeCard(card, {
      markCardRead,
      markMentionRead,
      dismissTaskThreadUnread,
      dismissAssignedUnread,
      personId: myPerson?.id,
    });
    closeCenter();
    router.push(card.href);
  }

  function onClearAllConfirmed() {
    for (const card of slides) {
      dismissCard(card, dismissArgs);
    }
    clearAll();
    setConfirmClearAll(false);
  }

  return (
    <>
    <div
      className={cn(
        "fixed inset-0 z-50",
        centerOpen ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!centerOpen}
    >
      <button
        type="button"
        tabIndex={centerOpen ? 0 : -1}
        className={cn(
          "absolute inset-0 cursor-default bg-black/25 transition-opacity duration-300 ease-out",
          centerOpen ? "opacity-100" : "opacity-0",
        )}
        aria-label="Close notification center"
        onClick={closeCenter}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Notification center"
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-[22.5rem] flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl transition-transform duration-300 ease-out sm:max-w-[24rem]",
          centerOpen ? "translate-x-0" : "translate-x-full",
          !centerOpen && "pointer-events-none",
        )}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[var(--text)]">
              Notifications
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              {count === 0
                ? "You're all caught up"
                : unreadCount === 0
                  ? `${count} read`
                  : `${unreadCount} unread${count > unreadCount ? ` · ${count} total` : ""}`}
            </p>
          </div>
          {count > 0 ? (
            <button
              type="button"
              className="cursor-pointer rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
              onClick={() => setConfirmClearAll(true)}
            >
              Clear all
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            aria-label="Close"
            onClick={closeCenter}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {count === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-[var(--text-muted)]">
              No notifications
            </p>
          ) : (
            <ul className="space-y-2">
              {slides.map((card) => (
                <AnimatedNoticeListItem key={card.id} card={card}>
                  <NotificationCenterCard
                    card={card}
                    onActivate={() => onActivate(card)}
                    onDismiss={() => dismissCard(card, dismissArgs)}
                  />
                </AnimatedNoticeListItem>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
    {confirmClearAll ? (
      <ConfirmDialog
        title="Clear all notifications?"
        message="This removes every notification from the center. You can’t undo this."
        confirmLabel="Clear all"
        tone="danger"
        onCancel={() => setConfirmClearAll(false)}
        onConfirm={onClearAllConfirmed}
      />
    ) : null}
    </>
  );
}

function AnimatedNoticeListItem({
  card,
  children,
}: {
  card: UtilityNotificationCard;
  children: ReactNode;
}) {
  // Cards already visible when mounted (panel open / existing list) skip enter.
  const mountedAlreadyVisible = useRef(card.visible);
  const [enter, setEnter] = useState(false);

  useEffect(() => {
    if (mountedAlreadyVisible.current) return;
    if (!card.visible) return;
    setEnter(true);
  }, [card.visible]);

  return (
    <li
      className={cn(
        !card.visible && !enter && "opacity-0",
        enter && "notice-card-enter",
      )}
    >
      {children}
    </li>
  );
}

function NotificationCenterCard({
  card,
  onActivate,
  onDismiss,
}: {
  card: UtilityNotificationCard;
  onActivate: () => void;
  onDismiss: () => void;
}) {
  return (
    <NoticeCard
      tone={kindAsTone(card.kind)}
      read={card.read}
      icon={kindIcon(card.kind)}
      clientColor={card.clientColor}
      clientName={card.clientName}
      title={card.title}
      subtitle={card.subtitle}
      onActivate={onActivate}
      actions={
        <button
          type="button"
          className={noticeCardActionClassName()}
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      }
    />
  );
}

/** Navbar bell: opens the notification center; glows when unread count increases. */
export function NotificationCenterTrigger({
  className,
}: {
  className?: string;
}) {
  const { cards, centerOpen, toggleCenter } =
    useUtilityNotifications();
  const { isPublicShare, profile } = useData();
  const [countGlow, setCountGlow] = useState(false);
  const prevCountRef = useRef(0);
  const countSeededRef = useRef(false);
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadCount = useMemo(
    () => cards.filter((c) => !c.read).length,
    [cards],
  );

  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = unreadCount;
    if (!countSeededRef.current) {
      countSeededRef.current = true;
      return;
    }
    if (unreadCount <= prev) return;
    setCountGlow(true);
    if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    glowTimerRef.current = setTimeout(() => {
      setCountGlow(false);
      glowTimerRef.current = null;
    }, COUNT_GLOW_MS);
  }, [unreadCount]);

  useEffect(() => {
    return () => {
      if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    };
  }, []);

  if (isPublicShare || !profile) {
    return null;
  }

  return (
    <button
      type="button"
      className={cn(
        "relative inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
        centerOpen && "border-[var(--text)]/20 bg-[var(--row-hover)] text-[var(--text)]",
        className,
      )}
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications"
      }
      aria-expanded={centerOpen}
      aria-haspopup="dialog"
      title="Notifications"
      onClick={() => toggleCenter()}
    >
      <Bell size={18} strokeWidth={1.75} className="opacity-90" />
      {unreadCount > 0 ? (
        <span
          className={cn(
            "absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--status-attention)] px-1 text-[10px] font-semibold text-white tabular-nums",
            countGlow && "notices-count-glow",
          )}
          aria-hidden
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}
