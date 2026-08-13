"use client";

import Link from "next/link";
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
import type { Project } from "@/lib/types";

function FavoriteTab({
  project,
  href,
  clientName,
  active,
  color,
  suppressClickRef,
}: {
  project: Project;
  href: string;
  clientName: string;
  active: boolean;
  color: string;
  suppressClickRef: MutableRefObject<boolean>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

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
      {...listeners}
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
      disabled={disabled}
      onClick={onClick}
      aria-label={direction === "prev" ? "Scroll favorites left" : "Scroll favorites right"}
      className={cn(
        "hidden h-8 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] transition-colors sm:inline-flex",
        disabled
          ? "cursor-default opacity-30"
          : "hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
      )}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
}

/** Bottom navbar of starred projects — only renders when favorites exist. */
export function FavoritesBottomNav() {
  return (
    <Suspense fallback={null}>
      <FavoritesBottomNavInner />
    </Suspense>
  );
}

function FavoritesBottomNavInner() {
  const { state, profile, isPublicShare, reorderProjectFavorites } = useData();
  const favoriteHref = useFavoriteProjectHref();
  const pathForNav = usePathForNav();
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

  if (isPublicShare || !profile || favorites.length === 0) return null;

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
    // Capture on document so Next Link / nav-progress never see the ghost click.
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
      className="flex h-12 w-full shrink-0 items-center gap-0.5 border-t border-[var(--border)] bg-[var(--sidebar)] px-1.5 sm:px-2"
      aria-label="Favorite projects"
    >
      {overflow ? (
        <ScrollArrow
          direction="prev"
          disabled={!canScrollPrev}
          onClick={() => scrollByPage(-1)}
        />
      ) : null}

      {/* Scrollport must wrap a wider child (w-max) — overflow on the flex row itself never scrolls. */}
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
          >
            <ul className="ml-auto flex w-max min-w-full items-center justify-end gap-0.5 py-1">
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
