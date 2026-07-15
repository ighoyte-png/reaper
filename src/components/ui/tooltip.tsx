"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export function Tooltip({
  content,
  children,
  className,
}: {
  content: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  function updatePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top - 6,
      left: rect.left + rect.width / 2,
    });
  }

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  if (!content.trim()) return <>{children}</>;

  const tooltip =
    open &&
    coords &&
    typeof document !== "undefined" &&
    createPortal(
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none fixed z-[200] w-max max-w-[220px] -translate-x-1/2 -translate-y-full whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-left text-[11px] font-normal leading-snug text-[var(--text)] shadow-lg"
        style={{ top: coords.top, left: coords.left }}
      >
        {content}
      </span>,
      document.body,
    );

  return (
    <span
      ref={triggerRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {tooltip}
    </span>
  );
}
