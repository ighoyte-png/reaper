"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function hasExplicitWidth(className?: string) {
  return Boolean(
    className &&
      /(^|\s)(w-|min-w-|max-w-|flex-1|grow|shrink-0)/.test(className),
  );
}

function hasExplicitMarginTop(className?: string) {
  return Boolean(className && /(^|\s)(mt-|my-|m-)/.test(className));
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className,
  searchable = false,
  id,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  useEffect(() => setMounted(true), []);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const syncHighlight = useCallback(
    (list: SelectOption[], currentValue: string) => {
      const idx = list.findIndex(
        (o) => o.value === currentValue && !o.disabled,
      );
      if (idx >= 0) {
        setHighlight(idx);
        return;
      }
      const first = list.findIndex((o) => !o.disabled);
      setHighlight(first >= 0 ? first : 0);
    },
    [],
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = Math.min(280, window.innerHeight - 16);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxH = Math.min(menuHeight, openUp ? spaceAbove : spaceBelow);
    const width = Math.max(rect.width, 160);
    setMenuStyle({
      position: "fixed",
      left: Math.min(rect.left, window.innerWidth - width - 8),
      width,
      maxHeight: Math.max(120, maxH),
      zIndex: 120,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    syncHighlight(filtered, value);
    const onScroll = () => updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePosition, syncHighlight, filtered, value]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = window.setTimeout(() => {
      if (searchable) searchRef.current?.focus();
      else menuRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    syncHighlight(filtered, value);
  }, [filtered, open, syncHighlight, value]);

  function choose(option: SelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveHighlight(delta: number) {
    if (filtered.length === 0) return;
    let next = highlight;
    for (let i = 0; i < filtered.length; i++) {
      next = (next + delta + filtered.length) % filtered.length;
      if (!filtered[next]?.disabled) {
        setHighlight(next);
        return;
      }
    }
  }

  function onTriggerKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "Enter" ||
      e.key === " "
    ) {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = filtered[highlight];
      if (opt) choose(opt);
    } else if (e.key === "Home") {
      e.preventDefault();
      const first = filtered.findIndex((o) => !o.disabled);
      if (first >= 0) setHighlight(first);
    } else if (e.key === "End") {
      e.preventDefault();
      for (let i = filtered.length - 1; i >= 0; i--) {
        if (!filtered[i]?.disabled) {
          setHighlight(i);
          break;
        }
      }
    }
  }

  const label = selected?.label ?? placeholder;
  const showPlaceholder = !selected;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-9 cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] px-2 text-left text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60",
          !hasExplicitMarginTop(className) && "mt-1",
          !hasExplicitWidth(className) && "w-full",
          showPlaceholder && "text-[var(--text-muted)]",
          className,
        )}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className={cn(
            "shrink-0 text-[var(--text-muted)] transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {mounted && open
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel ?? "Options"}
              style={menuStyle}
              className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] shadow-xl outline-none"
              onKeyDown={onMenuKeyDown}
            >
              {searchable ? (
                <div className="shrink-0 border-b border-[var(--border)] p-1.5">
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onMenuKeyDown}
                    placeholder="Filter…"
                    className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] px-2 text-sm outline-none focus:border-[var(--accent)]"
                    aria-label="Filter options"
                  />
                </div>
              ) : null}
              <ul className="min-h-0 flex-1 overflow-y-auto p-1">
                {filtered.length === 0 ? (
                  <li className="px-2 py-1.5 text-sm text-[var(--text-muted)]">
                    No matches
                  </li>
                ) : (
                  filtered.map((option, index) => {
                    const isSelected = option.value === value;
                    const isActive = index === highlight;
                    return (
                      <li key={`${option.value}-${index}`} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          disabled={option.disabled}
                          className={cn(
                            "flex w-full cursor-pointer items-center rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40",
                            isSelected &&
                              "bg-[var(--bg-elevated)] font-medium",
                            isActive && !isSelected && "bg-[var(--row-hover)]",
                            !isSelected &&
                              !isActive &&
                              "hover:bg-[var(--row-hover)]",
                          )}
                          onMouseEnter={() => setHighlight(index)}
                          onClick={() => choose(option)}
                        >
                          <span className="truncate">{option.label}</span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
