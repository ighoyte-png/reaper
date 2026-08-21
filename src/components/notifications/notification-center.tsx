"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Bell,
  ClipboardCheck,
  Megaphone,
  X,
  type LucideIcon,
} from "lucide-react";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
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
  return Megaphone;
}

function kindToneClass(
  kind: UtilityNotificationKind,
  read: boolean,
): string {
  if (read) return "bg-[var(--bg-elevated)]/60";
  if (kind === "mention") return "bg-[var(--status-attention-wash)]";
  if (kind === "in_review") return "bg-[var(--status-healthy)]/15";
  return "bg-[var(--accent)]/15";
}

function kindIconClass(
  kind: UtilityNotificationKind,
  read: boolean,
): string {
  if (read) return "text-[var(--text-muted)]";
  if (kind === "mention") return "text-[var(--status-attention)]";
  if (kind === "in_review") return "text-[var(--status-healthy)]";
  return "text-[var(--accent)]";
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
    personId: string | null | undefined;
  },
) {
  args.removeCard(card.id);
  if (card.kind === "mention" && card.mentionTarget && args.personId) {
    args.markMentionRead(card.mentionTarget, args.personId);
  } else if (
    (card.kind === "bulletin" || card.kind === "in_review") &&
    card.bulletinId
  ) {
    args.dismissBulletin(card.bulletinId);
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
    dismissBulletin: (bulletinId: string) => void;
    personId: string | null | undefined;
  },
) {
  const wasUnread = !card.read;
  args.markCardRead(card.id);
  if (!wasUnread) return;
  if (card.kind === "mention" && card.mentionTarget && args.personId) {
    args.markMentionRead(card.mentionTarget, args.personId);
  } else if (
    (card.kind === "bulletin" || card.kind === "in_review") &&
    card.bulletinId
  ) {
    args.dismissBulletin(card.bulletinId);
  }
}

/**
 * Windows 11–style notification center: right-edge flyout fed by utility notices.
 * Opened from the top-bar bell (left of search).
 */
export function NotificationCenter() {
  const router = useRouter();
  const { markMentionRead, dismissBulletin, myPerson, isPublicShare, profile } =
    useData();
  const {
    cards,
    removeCard,
    markCardRead,
    clearAll,
    prefEnabled,
    centerOpen,
    closeCenter,
  } = useUtilityNotifications();

  const panelRef = useRef<HTMLElement>(null);

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
    if (!prefEnabled && centerOpen) closeCenter();
  }, [prefEnabled, centerOpen, closeCenter]);

  useEffect(() => {
    if (!centerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeCenter();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [centerOpen, closeCenter]);

  if (isPublicShare || !profile || !prefEnabled) {
    return null;
  }

  function onActivate(card: UtilityNotificationCard) {
    acknowledgeCard(card, {
      markCardRead,
      markMentionRead,
      dismissBulletin,
      personId: myPerson?.id,
    });
    closeCenter();
    router.push(card.href);
  }

  function onClearAll() {
    for (const card of slides) {
      dismissCard(card, {
        removeCard,
        markMentionRead,
        dismissBulletin,
        personId: myPerson?.id,
      });
    }
    clearAll();
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-50",
        !centerOpen && "invisible",
      )}
      aria-hidden={!centerOpen}
    >
      <button
        type="button"
        className={cn(
          "pointer-events-auto absolute inset-0 cursor-default bg-black/25 transition-opacity duration-200",
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
          "pointer-events-auto absolute inset-y-0 right-0 flex w-full max-w-[22.5rem] flex-col border-l border-[var(--border)] bg-[var(--bg)] shadow-2xl transition-transform duration-200 ease-out sm:max-w-[24rem]",
          centerOpen ? "translate-x-0" : "translate-x-full",
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
              onClick={onClearAll}
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
                <li key={card.id}>
                  <NotificationCenterCard
                    card={card}
                    onActivate={() => onActivate(card)}
                    onDismiss={() =>
                      dismissCard(card, {
                        removeCard,
                        markMentionRead,
                        dismissBulletin,
                        personId: myPerson?.id,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
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
  const Icon = kindIcon(card.kind);
  const read = card.read;

  return (
    <div
      className={cn(
        "group relative flex w-full gap-2.5 rounded-[var(--radius-md)] border p-3 text-left transition-colors",
        read
          ? "border-[var(--border)]/80 opacity-80"
          : "border-[var(--border)]",
        kindToneClass(card.kind, read),
        "hover:brightness-[0.98] dark:hover:brightness-110",
      )}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-pointer rounded-[var(--radius-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        aria-label={`${read ? "Read" : "Unread"}: ${card.title}`}
        onClick={onActivate}
      />
      {!read ? (
        <span
          className="absolute left-1.5 top-1.5 z-[2] h-1.5 w-1.5 rounded-full bg-[var(--status-attention)]"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "relative z-[1] mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--bg)]/70",
          kindIconClass(card.kind, read),
        )}
        aria-hidden
      >
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <div className="relative z-[1] min-w-0 flex-1 pointer-events-none">
        <div className="mb-1 flex min-w-0 items-center gap-1.5">
          {card.clientColor ? (
            <ProjectColorBar color={card.clientColor} />
          ) : null}
          {card.clientName ? (
            <span
              className={cn(
                "min-w-0 truncate text-[11px] font-medium",
                read ? "text-[var(--text-muted)]" : "text-[var(--text)]",
              )}
            >
              {card.clientName}
            </span>
          ) : null}
          <span
            className={cn(
              "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
              read
                ? "bg-[var(--bg)]/80 text-[var(--text-muted)]"
                : "bg-[var(--status-attention)]/15 text-[var(--status-attention)]",
            )}
          >
            {read ? "Read" : "Unread"}
          </span>
        </div>
        <p
          className={cn(
            "text-[13px] leading-snug",
            read
              ? "font-medium text-[var(--text-muted)]"
              : "font-semibold text-[var(--text)]",
          )}
        >
          {card.title}
        </p>
        {card.subtitle ? (
          <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">
            {card.subtitle}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="relative z-[2] inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] opacity-70 hover:bg-[var(--bg)]/80 hover:opacity-100"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        <X size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** Navbar bell: opens the notification center; glows when unread count increases. */
export function NotificationCenterTrigger({
  className,
}: {
  className?: string;
}) {
  const { cards, prefEnabled, centerOpen, toggleCenter } =
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

  if (isPublicShare || !profile || !prefEnabled) {
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
