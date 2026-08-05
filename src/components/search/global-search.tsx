"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Building2,
  FolderKanban,
  ListTodo,
  MessageSquareText,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data/store";
import { useAppHref, useProjectHref } from "@/lib/hooks/use-app-href";
import { notesPlainText } from "@/lib/notes-html";
import { searchDemoState, enrichSearchHits, searchHitTaskIdsMissingStatus, type SearchHit, type SearchHitKind } from "@/lib/search";
import { TaskStatusTag } from "@/components/tasks/task-status-tag";
import { createClient } from "@/lib/supabase/client";
import { fetchTaskStatuses, searchOrg } from "@/lib/supabase/api";

const KIND_ORDER: SearchHitKind[] = ["project", "client", "task", "comment"];

const KIND_LABEL: Record<SearchHitKind, string> = {
  project: "Projects",
  client: "Clients",
  task: "Tasks",
  comment: "Comments",
};

const KIND_ICON: Record<SearchHitKind, typeof Search> = {
  project: FolderKanban,
  client: Building2,
  task: ListTodo,
  comment: MessageSquareText,
};

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

function flattenHits(hits: SearchHit[]): SearchHit[] {
  const groups = KIND_ORDER.map((kind) =>
    hits.filter((h) => h.kind === kind),
  );
  return groups.flat();
}

export function GlobalSearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const mounted = useMounted();
  const router = useRouter();
  const { mode, state, isPublicShare, canManage, myPerson, profile, ensureOrgTasks } = useData();
  const appHref = useAppHref();
  const projectHref = useProjectHref();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 200);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const reqId = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const accessRef = useRef({
    canManage,
    personId: myPerson?.id ?? null,
    role: profile?.role ?? null,
  });
  accessRef.current = {
    canManage,
    personId: myPerson?.id ?? null,
    role: profile?.role ?? null,
  };

  const flat = useMemo(() => flattenHits(hits), [hits]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits([]);
    setError(null);
    setActiveIndex(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open || isPublicShare || mode !== "supabase") return;
    void ensureOrgTasks();
  }, [open, isPublicShare, mode, ensureOrgTasks]);

  useEffect(() => {
    if (!open || hits.length === 0) return;
    setHits((prev) => enrichSearchHits(prev, state.tasks));
  }, [open, hits.length, state.tasks]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || isPublicShare) return;
    const q = debounced.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }

    const id = ++reqId.current;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        let next: SearchHit[];
        if (mode === "demo") {
          next = searchDemoState(stateRef.current, q, 40, accessRef.current);
        } else {
          const client = createClient();
          const orgId = stateRef.current.organization.id;
          next = await searchOrg(client, q);
          next = enrichSearchHits(next, stateRef.current.tasks);
          const missing = searchHitTaskIdsMissingStatus(next);
          if (missing.length > 0 && orgId) {
            const statuses = await fetchTaskStatuses(client, orgId, missing);
            next = enrichSearchHits(next, [], statuses);
          }
        }
        if (reqId.current !== id) return;
        setHits(next);
        setActiveIndex(0);
      } catch (err) {
        if (reqId.current !== id) return;
        setHits([]);
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    })();
  }, [debounced, open, isPublicShare, mode, canManage, myPerson?.id, profile?.role]);

  const go = useCallback(
    (hit: SearchHit) => {
      if (hit.kind === "client") {
        router.push(
          appHref(`/clients?q=${encodeURIComponent(hit.title)}`),
        );
      } else if (hit.kind === "project" && hit.project_id) {
        const project = state.projects.find((p) => p.id === hit.project_id);
        if (project) router.push(projectHref(project));
        else router.push(appHref("/projects"));
      } else if (
        (hit.kind === "task" || hit.kind === "comment") &&
        hit.project_id &&
        hit.task_id
      ) {
        const project = state.projects.find((p) => p.id === hit.project_id);
        if (project) {
          router.push(projectHref(project, `task=${hit.task_id}`));
        } else {
          router.push(appHref("/projects"));
        }
      }
      onClose();
    },
    [appHref, onClose, projectHref, router, state.projects],
  );

  if (!mounted || !open || isPublicShare) return null;

  const qReady = query.trim().length >= 2;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 p-0 pt-[12vh] sm:p-4 sm:pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="flex max-h-[min(70dvh,32rem)] w-full max-w-xl flex-col overflow-hidden rounded-t-xl border border-[var(--border)] bg-[var(--bg)] shadow-xl sm:rounded-[var(--radius-md)]"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <Search
            size={16}
            strokeWidth={1.75}
            className="shrink-0 text-[var(--text-muted)]"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Reaper"
            className={cn(
              inputClass,
              "h-9 flex-1 border-0 bg-transparent px-0 shadow-none focus:ring-0",
            )}
            aria-autocomplete="list"
            aria-controls="global-search-results"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) =>
                  flat.length === 0 ? 0 : Math.min(i + 1, flat.length - 1),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const hit = flat[activeIndex];
                if (hit) go(hit);
              }
            }}
          />
          <kbd className="hidden shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] sm:inline">
            Esc
          </kbd>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 px-0 sm:hidden"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </Button>
        </div>

        <div
          id="global-search-results"
          className="min-h-0 flex-1 overflow-y-auto p-2"
          role="listbox"
        >
          {!qReady ? (
            <p className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
              Type at least 2 characters to search.
            </p>
          ) : loading ? (
            <p className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
              Searching…
            </p>
          ) : error ? (
            <p className="px-2 py-6 text-center text-sm text-[var(--status-over)]">
              {error}
            </p>
          ) : flat.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
              No results for “{debounced.trim()}”.
            </p>
          ) : (
            KIND_ORDER.map((kind) => {
              const group = hits.filter((h) => h.kind === kind);
              if (group.length === 0) return null;
              const Icon = KIND_ICON[kind];
              return (
                <section key={kind} className="mb-2">
                  <h3 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {KIND_LABEL[kind]}
                  </h3>
                  <ul className="space-y-0.5">
                    {group.map((hit) => {
                      const index = flat.indexOf(hit);
                      const active = index === activeIndex;
                      const snippet = notesPlainText(hit.snippet || "");
                      const showStatus =
                        (hit.kind === "task" || hit.kind === "comment") &&
                        hit.task_status;
                      return (
                        <li key={`${hit.kind}-${hit.id}`}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={cn(
                              "flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
                              active
                                ? "bg-[var(--row-hover)]"
                                : "hover:bg-[var(--row-hover)]",
                            )}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => go(hit)}
                          >
                            <Icon
                              size={15}
                              strokeWidth={1.75}
                              className="mt-0.5 shrink-0 text-[var(--text-muted)]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-sm font-medium text-[var(--text)]">
                                  {hit.title}
                                </span>
                                {showStatus ? (
                                  <TaskStatusTag
                                    status={hit.task_status!}
                                    className="shrink-0"
                                  />
                                ) : null}
                              </span>
                              {hit.subtitle ? (
                                <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                                  {hit.subtitle}
                                </span>
                              ) : null}
                              {snippet ? (
                                <span className="mt-0.5 block line-clamp-2 text-xs text-[var(--text-muted)]">
                                  {snippet}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function GlobalSearchTrigger({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 text-xs text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
        className,
      )}
      aria-label="Search"
      title="Search (Ctrl+K)"
    >
      <Search size={14} strokeWidth={1.75} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left sm:inline">
        Search Reaper
      </span>
      <kbd className="ml-1 hidden shrink-0 rounded border border-[var(--border)] px-1 py-px text-[10px] text-[var(--text-muted)] sm:inline">
        Ctrl+K
      </kbd>
    </button>
  );
}

/** Register Cmd/Ctrl+K to open search. Returns null. */
export function useGlobalSearchHotkey(onOpen: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== "k") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable
      ) {
        // Still allow Cmd+K from inputs — global search should win
      }
      e.preventDefault();
      onOpen();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpen, enabled]);
}

export function GlobalSearchHotkeyBridge({
  onOpen,
  enabled,
}: {
  onOpen: () => void;
  enabled?: boolean;
}): ReactNode {
  useGlobalSearchHotkey(onOpen, enabled !== false);
  return null;
}
