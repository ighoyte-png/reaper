"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProjectColorBar } from "@/components/ui/project-color-bar";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import { orderedFavoriteProjects } from "@/lib/domain/project-favorites";
import { clientNameOf, projectDisplayColor } from "@/lib/domain/sorting";
import {
  isFavoriteProjectActive,
  useFavoriteProjectHref,
  usePathForNav,
} from "@/lib/hooks/use-app-href";
import { useIsPhone } from "@/lib/hooks/use-media-query";
import {
  useUtilityNotifications,
  type UtilityNotificationCard,
  type UtilityNotificationKind,
} from "@/lib/utility-notifications";
import type { Project } from "@/lib/types";

function FavoriteTab({
  project,
  href,
  clientName,
  active,
  color,
  suppressClickRef,
  dragDisabled,
}: {
  project: Project;
  href: string;
  clientName: string;
  active: boolean;
  color: string;
  suppressClickRef: MutableRefObject<boolean>;
  dragDisabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, disabled: Boolean(dragDisabled) });

  const fullLabel = clientName
    ? `${clientName} - ${project.name}`
    : project.name;

  function blockNavIfSuppressed(
    e: ReactMouseEvent | ReactPointerEvent,
  ) {
    if (!suppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "shrink-0 touch-manipulation",
        isDragging && "z-10 opacity-70",
      )}
      {...attributes}
      {...(dragDisabled ? {} : listeners)}
    >
      <Link
        href={href}
        title={fullLabel}
        draggable={false}
        className={cn(
          "flex max-w-[11rem] cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors",
          active
            ? "bg-[var(--bg-elevated)] text-[var(--text)]"
            : "text-[var(--text)] hover:bg-[var(--row-hover)]",
        )}
        onClickCapture={blockNavIfSuppressed}
        onClick={blockNavIfSuppressed}
        onAuxClick={blockNavIfSuppressed}
      >
        <ProjectColorBar color={color} size="sm" className="self-center" />
        <span className="min-w-0 text-left leading-tight">
          <span className="block truncate text-[12px] font-medium">
            {clientName || "No client"}
          </span>
          <span className="mt-0.5 block truncate text-[10px] font-normal text-[var(--text-muted)]">
            {project.name}
          </span>
        </span>
      </Link>
    </div>
  );
}

function ScrollArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
        disabled && "pointer-events-none opacity-30",
      )}
      aria-label={direction === "prev" ? "Scroll favorites left" : "Scroll favorites right"}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  );
}

function chipToneClass(kind: UtilityNotificationKind): string {
  if (kind === "mention") {
    return "bg-[var(--status-attention-wash)] text-[var(--status-attention)]";
  }
  if (kind === "in_review") {
    return "bg-[var(--status-healthy)]/15 text-[var(--status-healthy)]";
  }
  return "bg-[var(--accent)]/15 text-[var(--accent)]";
}

function UtilityChip({
  card,
  onActivate,
}: {
  card: UtilityNotificationCard;
  onActivate: (card: UtilityNotificationCard) => void;
}) {
  return (
    <button
      type="button"
      title={card.subtitle ? `${card.title}\n${card.subtitle}` : card.title}
      className={cn(
        "flex h-8 max-w-[12rem] shrink-0 cursor-pointer flex-col justify-center rounded-md px-2.5 text-left transition-opacity duration-300",
        chipToneClass(card.kind),
        card.visible ? "opacity-100" : "opacity-0",
      )}
      onClick={() => onActivate(card)}
    >
      <span className="truncate text-[11px] font-semibold leading-tight text-[var(--text)]">
        {card.title}
      </span>
      {card.subtitle ? (
        <span className="truncate text-[10px] leading-tight text-[var(--text-muted)]">
          {card.subtitle}
        </span>
      ) : null}
    </button>
  );
}

export function FavoritesBottomNav() {
  return (
    <Suspense fallback={null}>
      <FavoritesBottomNavInner />
    </Suspense>
  );
}

function FavoritesBottomNavInner() {
  const {
    state,
    profile,
    isPublicShare,
    reorderProjectFavorites,
    markMentionRead,
    dismissBulletin,
    myPerson,
  } = useData();
  const favoriteHref = useFavoriteProjectHref();
  const pathForNav = usePathForNav();
  const isPhone = useIsPhone();
  const router = useRouter();
  const { cards, removeCard } = useUtilityNotifications();
  const [dragging, setDragging] = useState(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const suppressClickRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blockClickRef = useRef<((e: MouseEvent) => void) | null>(null);

  const favorites = useMemo(
    () =>
      orderedFavoriteProjects(
        state.project_favorites,
        state.projects,
        profile?.id,
      ),
    [state.project_favorites, state.projects, profile?.id],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const overflow = canScrollPrev || canScrollNext;
  const showBar =
    !isPublicShare &&
    Boolean(profile) &&
    (favorites.length > 0 || cards.length > 0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function updateScrollState() {
      const node = scrollRef.current;
      if (!node) return;
      const max = node.scrollWidth - node.clientWidth;
      setCanScrollPrev(node.scrollLeft > 1);
      setCanScrollNext(max > 1 && node.scrollLeft < max - 1);
    }

    updateScrollState();
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    const list = el.querySelector("ul");
    if (list) ro.observe(list);
    el.addEventListener("scroll", updateScrollState, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateScrollState);
    };
  }, [favorites, cards.length]);

  useEffect(() => {
    return () => {
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
      if (blockClickRef.current) {
        document.removeEventListener("click", blockClickRef.current, true);
        blockClickRef.current = null;
      }
    };
  }, []);

  if (!showBar) return null;

  function armClickSuppression() {
    suppressClickRef.current = true;
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    if (blockClickRef.current) {
      document.removeEventListener("click", blockClickRef.current, true);
    }
    const blockClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    blockClickRef.current = blockClick;
    document.addEventListener("click", blockClick, true);
  }

  function clearClickSuppressionSoon() {
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = false;
      if (blockClickRef.current) {
        document.removeEventListener("click", blockClickRef.current, true);
        blockClickRef.current = null;
      }
      suppressTimerRef.current = null;
    }, 400);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(false);
    clearClickSuppressionSoon();
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = favorites.findIndex((p) => p.id === active.id);
    const newIndex = favorites.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(favorites, oldIndex, newIndex);
    reorderProjectFavorites(next.map((p) => p.id));
  }

  function scrollByPage(direction: -1 | 1) {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(160, Math.floor(el.clientWidth * 0.7));
    el.scrollBy({ left: direction * amount, behavior: "smooth" });
  }

  function onActivateCard(card: UtilityNotificationCard) {
    removeCard(card.id);
    if (card.kind === "mention" && card.mentionTarget && myPerson?.id) {
      markMentionRead(card.mentionTarget, myPerson.id);
    } else if (
      (card.kind === "bulletin" || card.kind === "in_review") &&
      card.bulletinId
    ) {
      dismissBulletin(card.bulletinId);
    }
    router.push(card.href);
  }

  const orderedCards = cards;

  return (
    <nav
      className="relative flex h-12 w-full shrink-0 items-center gap-0.5 overflow-hidden border-t border-[var(--border)] bg-[var(--sidebar)] px-1.5 sm:px-2"
      aria-label={
        cards.length > 0
          ? "Utility notifications and favorite projects"
          : "Favorite projects"
      }
    >
      {/* Utility chips: no own scroll; excess clips under favorites. */}
      {orderedCards.length > 0 ? (
        <div className="pointer-events-none absolute inset-y-0 left-1.5 z-0 flex max-w-none items-center gap-1 overflow-visible sm:left-2">
          <div className="pointer-events-auto flex items-center gap-1 py-1">
            {orderedCards.map((card) => (
              <UtilityChip
                key={card.id}
                card={card}
                onActivate={onActivateCard}
              />
            ))}
          </div>
        </div>
      ) : null}

      {overflow && favorites.length > 0 ? (
        <ScrollArrow
          direction="prev"
          disabled={!canScrollPrev}
          onClick={() => scrollByPage(-1)}
        />
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          "relative z-10 min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Leave room for at least one favorite when chips are present.
          orderedCards.length > 0 && favorites.length > 0 && "min-w-[7.5rem]",
          dragging && "cursor-grabbing",
        )}
      >
        {favorites.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            autoScroll={false}
            onDragStart={() => {
              armClickSuppression();
              setDragging(true);
            }}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setDragging(false);
              armClickSuppression();
              clearClickSuppressionSoon();
            }}
          >
            <SortableContext
              items={favorites.map((p) => p.id)}
              strategy={horizontalListSortingStrategy}
              disabled={isPhone}
            >
              <ul className="ml-auto flex w-max min-w-full items-center justify-end gap-0.5 bg-[var(--sidebar)] py-1 pl-2">
                {favorites.map((project) => {
                  const active = isFavoriteProjectActive(
                    project,
                    pathForNav,
                    state.clients,
                  );
                  return (
                    <li key={project.id} className="shrink-0">
                      <FavoriteTab
                        project={project}
                        href={favoriteHref(project)}
                        clientName={clientNameOf(project, state.clients)}
                        active={active}
                        color={projectDisplayColor(project, state.clients)}
                        suppressClickRef={suppressClickRef}
                        dragDisabled={isPhone}
                      />
                    </li>
                  );
                })}
              </ul>
            </SortableContext>
          </DndContext>
        ) : null}
      </div>

      {overflow && favorites.length > 0 ? (
        <ScrollArrow
          direction="next"
          disabled={!canScrollNext}
          onClick={() => scrollByPage(1)}
        />
      ) : null}
    </nav>
  );
}
