"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/** Height accordion: mounts at 0fr, then expands so open/close always animates. */
export function ExpandPanel({
  open,
  children,
  className,
  onClosed,
  instant = false,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  /** Fired once the close height transition finishes (or immediately if reduced motion). */
  onClosed?: () => void;
  /** Snap open/closed with no height transition (e.g. restore collapsed lists on load). */
  instant?: boolean;
}) {
  const [showContent, setShowContent] = useState(open);
  const [expanded, setExpanded] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const closedNotifiedRef = useRef(!open);

  // Instant: match open immediately (no open→close flash on prefs hydrate).
  useLayoutEffect(() => {
    if (!instant) return;
    setShowContent(open);
    setExpanded(open);
    if (open) {
      closedNotifiedRef.current = false;
      return;
    }
    if (!closedNotifiedRef.current) {
      closedNotifiedRef.current = true;
      onClosedRef.current?.();
    }
  }, [open, instant]);

  // Open: mount content first (still at 0fr), then expand after layout.
  // Close: collapse first, then unmount after the height transition.
  useLayoutEffect(() => {
    if (instant) return;
    if (open) {
      closedNotifiedRef.current = false;
      setShowContent(true);
      return;
    }
    setExpanded(false);
  }, [open, instant]);

  useLayoutEffect(() => {
    if (instant) return;
    if (!open || !showContent || expanded) return;
    // Force a 0fr layout paint so the following 1fr change can transition.
    void panelRef.current?.offsetHeight;
    setExpanded(true);
  }, [open, showContent, expanded, instant]);

  function notifyClosed() {
    if (closedNotifiedRef.current) return;
    closedNotifiedRef.current = true;
    onClosedRef.current?.();
  }

  useEffect(() => {
    if (instant) return;
    if (open || expanded || !showContent) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setShowContent(false);
      notifyClosed();
      return;
    }
    const t = window.setTimeout(() => {
      setShowContent(false);
      notifyClosed();
    }, 220);
    return () => clearTimeout(t);
  }, [open, expanded, showContent, instant]);

  return (
    <div
      ref={panelRef}
      className={cn(
        "grid motion-reduce:transition-none",
        !instant &&
          "transition-[grid-template-rows] duration-200 ease-out",
        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        className,
      )}
      aria-hidden={!open}
      onTransitionEnd={(e) => {
        if (instant) return;
        if (e.target !== panelRef.current) return;
        if (e.propertyName !== "grid-template-rows") return;
        if (!open) {
          setShowContent(false);
          notifyClosed();
        }
      }}
    >
      <div className="min-h-0 overflow-hidden">
        {showContent ? children : null}
      </div>
    </div>
  );
}
