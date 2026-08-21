"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  ClipboardCheck,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import { useIsPhone } from "@/lib/hooks/use-media-query";
import {
  useUtilityNotifications,
  type UtilityNotificationCard,
  type UtilityNotificationKind,
} from "@/lib/utility-notifications";

const HIDE_DELAY_MS = 400;
const BASE_TILE = 52;
const EXPANDED_MAX_W = 288;
const MAX_SCALE = 1.35;
const INFLUENCE_PX = 100;
const COUNT_GLOW_MS = 750;

function kindIcon(kind: UtilityNotificationKind): LucideIcon {
  if (kind === "mention") return AtSign;
  if (kind === "in_review") return ClipboardCheck;
  return Megaphone;
}

function kindToneClass(kind: UtilityNotificationKind): string {
  if (kind === "mention") return "bg-[var(--status-attention-wash)]";
  if (kind === "in_review") return "bg-[var(--status-healthy)]/15";
  return "bg-[var(--accent)]/15";
}

function kindIconClass(kind: UtilityNotificationKind): string {
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

function scaleForDistance(distance: number): number {
  if (distance >= INFLUENCE_PX) return 1;
  const ratio = (INFLUENCE_PX - distance) / INFLUENCE_PX;
  return 1 + (MAX_SCALE - 1) * Math.sin(ratio * (Math.PI / 2));
}

export function UtilityNoticeCarousel() {
  const router = useRouter();
  const isPhone = useIsPhone();
  const { markMentionRead, dismissBulletin, myPerson, isPublicShare, profile } =
    useData();
  const { cards, removeCard, prefEnabled } = useUtilityNotifications();

  const [revealed, setRevealed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pointerX, setPointerX] = useState<number | null>(null);
  const [countGlow, setCountGlow] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overDockRef = useRef(false);
  const prevCountRef = useRef(0);
  const countSeededRef = useRef(false);

  const slides = useMemo(
    () => [...cards].sort((a, b) => b.enqueuedAt - a.enqueuedAt),
    [cards],
  );
  const count = slides.length;

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      if (overDockRef.current) return;
      setRevealed(false);
      setExpandedId(null);
      setPointerX(null);
    }, HIDE_DELAY_MS);
  }, [clearHideTimer]);

  const showDock = useCallback(() => {
    clearHideTimer();
    setRevealed(true);
  }, [clearHideTimer]);

  useEffect(() => {
    return () => {
      clearHideTimer();
      if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    };
  }, [clearHideTimer]);

  useEffect(() => {
    if (count === 0) {
      setRevealed(false);
      setExpandedId(null);
      setPointerX(null);
    }
  }, [count]);

  // Glow the count badge when new notices arrive (skip initial seed only).
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = count;
    if (!countSeededRef.current) {
      countSeededRef.current = true;
      return;
    }
    if (count <= prev) return;
    setCountGlow(true);
    if (glowTimerRef.current) clearTimeout(glowTimerRef.current);
    glowTimerRef.current = setTimeout(() => {
      setCountGlow(false);
      glowTimerRef.current = null;
    }, COUNT_GLOW_MS);
  }, [count]);

  // Escape collapses / hides.
  useEffect(() => {
    if (!revealed) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setExpandedId(null);
      if (isPhone) {
        setRevealed(false);
      } else {
        overDockRef.current = false;
        scheduleHide();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [revealed, isPhone, scheduleHide]);

  // Phone: tap outside closes.
  useEffect(() => {
    if (!isPhone || !revealed) return;
    function onPointerDown(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      setRevealed(false);
      setExpandedId(null);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isPhone, revealed]);

  if (isPublicShare || !profile || !prefEnabled || count === 0) {
    return null;
  }

  function onActivate(card: UtilityNotificationCard) {
    dismissCard(card, {
      removeCard,
      markMentionRead,
      dismissBulletin,
      personId: myPerson?.id,
    });
    setExpandedId(null);
    router.push(card.href);
  }

  function onDockPointerEnter() {
    overDockRef.current = true;
    showDock();
  }

  function onDockPointerLeave() {
    overDockRef.current = false;
    setPointerX(null);
    if (!isPhone) {
      setExpandedId(null);
      scheduleHide();
    }
  }

  function onDockPointerMove(e: ReactPointerEvent) {
    if (isPhone) return;
    setPointerX(e.clientX);
  }

  function onBadgePointerEnter() {
    if (isPhone) return;
    overDockRef.current = true;
    showDock();
  }

  function onBadgePointerLeave() {
    if (isPhone) return;
    overDockRef.current = false;
    scheduleHide();
  }

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex h-0 flex-col items-center justify-end"
      role="region"
      aria-label="Utility notices"
    >
      <div
        className={cn(
          "pointer-events-none absolute bottom-12 left-1/2 flex w-full flex-col items-center px-2 transition-[opacity,transform] duration-200 ease-out",
          revealed
            ? "-translate-x-1/2 translate-y-0 opacity-100"
            : "pointer-events-none -translate-x-1/2 translate-y-3 opacity-0",
        )}
        aria-hidden={!revealed}
      >
        <div
          className={cn(
            "pointer-events-auto flex max-w-[min(100%,36rem)] items-end gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)]/90 px-2.5 py-2 shadow-lg backdrop-blur-md",
            !revealed && "pointer-events-none",
          )}
          onPointerEnter={onDockPointerEnter}
          onPointerLeave={onDockPointerLeave}
          onPointerMove={onDockPointerMove}
        >
          <div className="flex min-h-[3.25rem] max-w-full items-end gap-1.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {slides.map((card) => (
              <DockTile
                key={card.id}
                card={card}
                expanded={expandedId === card.id}
                pointerX={isPhone || expandedId ? null : pointerX}
                onHoverExpand={() => {
                  if (!isPhone) setExpandedId(card.id);
                }}
                onHoverCollapse={() => {
                  if (!isPhone) {
                    setExpandedId((id) => (id === card.id ? null : id));
                  }
                }}
                onSelect={() => {
                  if (isPhone) {
                    if (expandedId === card.id) {
                      onActivate(card);
                    } else {
                      setExpandedId(card.id);
                    }
                    return;
                  }
                  onActivate(card);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        className={cn(
          "pointer-events-auto absolute bottom-2 left-1/2 z-[1] inline-flex h-8 -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg)]/95 px-3 text-[11px] font-medium text-[var(--text)] shadow-md backdrop-blur-md",
          revealed && "opacity-70",
        )}
        aria-expanded={revealed}
        aria-label={
          revealed
            ? "Hide notices"
            : `${count} ${count === 1 ? "notice" : "notices"}`
        }
        onClick={() => {
          if (!isPhone) return;
          setRevealed((v) => {
            const next = !v;
            if (!next) setExpandedId(null);
            return next;
          });
        }}
        onPointerEnter={onBadgePointerEnter}
        onPointerLeave={onBadgePointerLeave}
        onFocus={onBadgePointerEnter}
        onBlur={onBadgePointerLeave}
      >
        <span
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--status-attention)] px-1 text-[10px] font-semibold text-white tabular-nums",
            countGlow && "notices-count-glow",
          )}
          aria-hidden
        >
          {count}
        </span>
        Notices
      </button>
    </div>
  );
}

function DockTile({
  card,
  expanded,
  pointerX,
  onHoverExpand,
  onHoverCollapse,
  onSelect,
}: {
  card: UtilityNotificationCard;
  expanded: boolean;
  pointerX: number | null;
  onHoverExpand: () => void;
  onHoverCollapse: () => void;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const Icon = kindIcon(card.kind);

  let scale = 1;
  if (!expanded && pointerX != null && ref.current) {
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    scale = scaleForDistance(Math.abs(pointerX - cx));
  }

  const collapsedSize = BASE_TILE * scale;

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "relative flex shrink-0 cursor-pointer flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] text-left shadow-sm transition-[width,height,background-color,padding] duration-150 ease-out",
        "origin-bottom focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        kindToneClass(card.kind),
        expanded
          ? "h-auto w-auto max-w-[min(100%,18rem)] items-stretch justify-start gap-1.5 p-3"
          : "items-center justify-center",
        card.visible ? "opacity-100" : "opacity-90",
      )}
      style={
        expanded
          ? {
              maxWidth: EXPANDED_MAX_W,
              transformOrigin: "bottom center",
            }
          : {
              width: collapsedSize,
              height: collapsedSize,
              transformOrigin: "bottom center",
            }
      }
      aria-label={
        card.clientName
          ? `${card.title}. ${card.clientName}. ${card.subtitle}`
          : card.subtitle
            ? `${card.title}. ${card.subtitle}`
            : card.title
      }
      aria-expanded={expanded}
      onMouseEnter={onHoverExpand}
      onMouseLeave={onHoverCollapse}
      onFocus={onHoverExpand}
      onBlur={onHoverCollapse}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      {expanded ? (
        <span className="flex min-w-0 items-start gap-2">
          {card.clientColor ? (
            <ProjectColorBar color={card.clientColor} className="mt-1" />
          ) : null}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-start gap-1.5">
              <span
                className={cn(
                  "mt-0.5 inline-flex shrink-0 items-center justify-center",
                  kindIconClass(card.kind),
                )}
              >
                <Icon size={16} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 text-[12px] font-semibold leading-tight text-[var(--text)]">
                {card.title}
              </span>
            </span>
            {card.clientName ? (
              <span className="text-[11px] font-medium leading-snug text-[var(--text)]">
                {card.clientName}
              </span>
            ) : null}
            {card.subtitle ? (
              <span className="text-[11px] leading-snug text-[var(--text-muted)]">
                {card.subtitle}
              </span>
            ) : null}
          </span>
        </span>
      ) : (
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center",
            kindIconClass(card.kind),
          )}
        >
          <Icon size={22} strokeWidth={1.75} />
        </span>
      )}
    </button>
  );
}
