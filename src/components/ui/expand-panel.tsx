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
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [showContent, setShowContent] = useState(open);
  const [expanded, setExpanded] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);

  // Open: mount content first (still at 0fr), then expand after layout.
  // Close: collapse first, then unmount after the height transition.
  useLayoutEffect(() => {
    if (open) {
      setShowContent(true);
      return;
    }
    setExpanded(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !showContent || expanded) return;
    // Force a 0fr layout paint so the following 1fr change can transition.
    void panelRef.current?.offsetHeight;
    setExpanded(true);
  }, [open, showContent, expanded]);

  useEffect(() => {
    if (open || expanded || !showContent) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setShowContent(false);
      return;
    }
    const t = window.setTimeout(() => setShowContent(false), 280);
    return () => clearTimeout(t);
  }, [open, expanded, showContent]);

  return (
    <div
      ref={panelRef}
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
        expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        className,
      )}
      aria-hidden={!open}
      onTransitionEnd={(e) => {
        if (e.target !== panelRef.current) return;
        if (e.propertyName !== "grid-template-rows") return;
        if (!open) setShowContent(false);
      }}
    >
      <div className="min-h-0 overflow-hidden">
        {showContent ? children : null}
      </div>
    </div>
  );
}
