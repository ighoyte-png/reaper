"use client";

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
import { HoverPrefetchLink } from "@/components/nav/hover-prefetch-link";
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
import type { Project } from "@/lib/types";

function FavoriteBookmark({
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
      <HoverPrefetchLink
        href={href}
        title={fullLabel}
        draggable={false}
        className={cn(
          "inline-flex max-w-[11rem] cursor-pointer items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] leading-none transition-colors",
          active
            ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
            : "text-[var(--text)] hover:bg-[var(--bg-elevated)]",
        )}
        onClickCapture={blockNavIfSuppressed}
        onClick={blockNavIfSuppressed}
        onAuxClick={blockNavIfSuppressed}
      >
        <ProjectColorBar color={color} size="sm" className="self-center" />
        <span className="min-w-0 truncate">
          {clientName ? (
            <>
              <span className="text-[var(--text-muted)]">{clientName}</span>
              <span className="text-[var(--text-muted)]"> · </span>
              <span>{project.name}</span>
            </>
          ) : (
            project.name
          )}
        </span>
      </HoverPrefetchLink>
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
        "inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]",
        disabled && "pointer-events-none opacity-30",
      )}
      aria-label={
        direction === "prev" ? "Scroll favorites left" : "Scroll favorites right"
      }
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={14} strokeWidth={1.75} />
    </button>
  );
}

/** Chrome-style bookmarks strip under the main app header. */
export function FavoritesBookmarksBar() {
  return (
    <Suspense fallback={null}>
      <FavoritesBookmarksBarInner />
    </Suspense>
  );
}

function FavoritesBookmarksBarInner() {
  const { state, profile, isPublicShare, reorderProjectFavorites } = useData();
  const favoriteHref = useFavoriteProjectHref();
  const pathForNav = usePathForNav();
  const isPhone = useIsPhone();
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
    !isPublicShare && Boolean(profile) && favorites.length > 0;

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
  }, [favorites]);

  useEffect(() => {
    return () => {
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
      if (blockClickRef.current) {
        document.removeEventListener("click", blockClickRef.current, true);
        blockClickRef.current = null;
      }
    };
  }, []);

  if (!showBar || isPhone) return null;

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

  return (
    <nav
      className="flex h-8 w-full shrink-0 items-center gap-0.5 border-b border-[var(--border)] bg-[var(--sidebar)] px-1.5 sm:px-2"
      aria-label="Favorite projects"
    >
      {overflow ? (
        <ScrollArrow
          direction="prev"
          disabled={!canScrollPrev}
          onClick={() => scrollByPage(-1)}
        />
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          "min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          dragging && "cursor-grabbing",
        )}
      >
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
            <ul className="flex w-max items-center gap-0.5 py-0.5">
              {favorites.map((project) => {
                const active = isFavoriteProjectActive(
                  project,
                  pathForNav,
                  state.clients,
                );
                return (
                  <li key={project.id} className="shrink-0">
                    <FavoriteBookmark
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
      </div>

      {overflow ? (
        <ScrollArrow
          direction="next"
          disabled={!canScrollNext}
          onClick={() => scrollByPage(1)}
        />
      ) : null}
    </nav>
  );
}

/** Vertical favorites list for the phone hamburger drawer. */
export function FavoritesDrawerSection({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  return (
    <Suspense fallback={null}>
      <FavoritesDrawerSectionInner onNavigate={onNavigate} />
    </Suspense>
  );
}

function FavoritesDrawerSectionInner({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { state, profile, isPublicShare } = useData();
  const favoriteHref = useFavoriteProjectHref();
  const pathForNav = usePathForNav();

  const favorites = useMemo(
    () =>
      orderedFavoriteProjects(
        state.project_favorites,
        state.projects,
        profile?.id,
      ),
    [state.project_favorites, state.projects, profile?.id],
  );

  if (isPublicShare || !profile || favorites.length === 0) return null;

  return (
    <div className="border-t border-[var(--border)] px-2 pb-2 pt-3">
      <p className="px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        Favorites
      </p>
      <ul className="flex flex-col gap-0.5">
        {favorites.map((project) => {
          const active = isFavoriteProjectActive(
            project,
            pathForNav,
            state.clients,
          );
          const clientName = clientNameOf(project, state.clients);
          const color = projectDisplayColor(project, state.clients);
          const fullLabel = clientName
            ? `${clientName} - ${project.name}`
            : project.name;
          return (
            <li key={project.id}>
              <HoverPrefetchLink
                href={favoriteHref(project)}
                title={fullLabel}
                onClick={() => onNavigate?.()}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-[var(--bg-elevated)] font-medium text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
                )}
              >
                <ProjectColorBar color={color} size="sm" className="self-center" />
                <span className="min-w-0 truncate">
                  {clientName ? (
                    <>
                      <span className="text-[var(--text-muted)]">{clientName}</span>
                      <span className="text-[var(--text-muted)]"> · </span>
                      <span className="text-[var(--text)]">{project.name}</span>
                    </>
                  ) : (
                    <span className="text-[var(--text)]">{project.name}</span>
                  )}
                </span>
              </HoverPrefetchLink>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
