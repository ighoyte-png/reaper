"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import {
  useUtilityNotifications,
  type UtilityNotificationCard,
  type UtilityNotificationKind,
} from "@/lib/utility-notifications";

function slideToneClass(kind: UtilityNotificationKind): string {
  if (kind === "mention") {
    return "bg-[var(--status-attention-wash)]";
  }
  if (kind === "in_review") {
    return "bg-[var(--status-healthy)]/15";
  }
  return "bg-[var(--accent)]/15";
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

export function UtilityNoticeCarousel() {
  const router = useRouter();
  const { markMentionRead, dismissBulletin, myPerson, isPublicShare, profile } =
    useData();
  const { cards, removeCard, clearAll } = useUtilityNotifications();
  const [index, setIndex] = useState(0);
  const prevNewestIdRef = useRef<string | null>(null);

  const slides = useMemo(
    () => [...cards].sort((a, b) => b.enqueuedAt - a.enqueuedAt),
    [cards],
  );

  const count = slides.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const current = count > 0 ? slides[safeIndex] : null;
  const newestId = slides[0]?.id ?? null;

  useEffect(() => {
    if (count === 0) {
      setIndex(0);
      prevNewestIdRef.current = null;
      return;
    }
    setIndex((prev) => Math.min(prev, count - 1));
  }, [count]);

  useEffect(() => {
    if (!newestId) return;
    if (prevNewestIdRef.current !== newestId) {
      prevNewestIdRef.current = newestId;
      setIndex(0);
    }
  }, [newestId]);

  if (isPublicShare || !profile || !current || count === 0) {
    return null;
  }

  function onActivate(card: UtilityNotificationCard) {
    dismissCard(card, {
      removeCard,
      markMentionRead,
      dismissBulletin,
      personId: myPerson?.id,
    });
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
      className="pointer-events-auto absolute bottom-2 right-2 z-30 w-[min(100%-1rem,20rem)] rounded-md border border-[var(--border)] bg-[var(--bg)] shadow-md"
      role="region"
      aria-label="Utility notices"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--text)]">
          {count} {count === 1 ? "notice" : "notices"}
        </span>
        <button
          type="button"
          className="shrink-0 cursor-pointer text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
          onClick={onClearAll}
        >
          Clear all
        </button>
      </div>

      <button
        type="button"
        className={cn(
          "flex w-full cursor-pointer flex-col gap-0.5 px-2.5 py-2 text-left transition-opacity",
          slideToneClass(current.kind),
          current.visible ? "opacity-100" : "opacity-90",
        )}
        title={
          current.subtitle
            ? `${current.title}\n${current.subtitle}`
            : current.title
        }
        onClick={() => onActivate(current)}
      >
        <span className="truncate text-[12px] font-semibold leading-tight text-[var(--text)]">
          {current.title}
        </span>
        {current.subtitle ? (
          <span className="line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
            {current.subtitle}
          </span>
        ) : null}
      </button>

      {count > 1 ? (
        <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-1.5 py-1">
          <button
            type="button"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)] disabled:pointer-events-none disabled:opacity-30"
            aria-label="Previous notice"
            disabled={safeIndex <= 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
            {safeIndex + 1} / {count}
          </span>
          <button
            type="button"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)] disabled:pointer-events-none disabled:opacity-30"
            aria-label="Next notice"
            disabled={safeIndex >= count - 1}
            onClick={() => setIndex((i) => Math.min(count - 1, i + 1))}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
