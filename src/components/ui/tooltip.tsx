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
  /** `end` anchors the tooltip's right edge to the trigger (grows left). */
  align = "center",
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  align?: "center" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const triggerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  function clearClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    clearClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  function updatePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top - 6,
      left: align === "end" ? rect.right : rect.left + rect.width / 2,
    });
  }

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reposition when align changes
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- align affects updatePosition
  }, [open, align]);

  useEffect(() => () => clearClose(), []);

  if (content == null || content === false || content === "") {
    return <>{children}</>;
  }

  const tooltip =
    open &&
    coords &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={tipRef}
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-auto fixed z-[200] w-max max-w-[260px] -translate-y-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-2 text-left text-[11px] font-normal leading-snug text-[var(--text)] shadow-lg",
          align === "end" ? "-translate-x-full" : "-translate-x-1/2",
        )}
        style={{ top: coords.top, left: coords.left }}
        onMouseEnter={() => {
          clearClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
        {content}
      </div>,
      document.body,
    );

  return (
    <div
      ref={triggerRef}
      className={cn("relative", className ?? "inline-flex")}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => {
        clearClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => {
        clearClose();
        setOpen(true);
      }}
      onBlur={scheduleClose}
    >
      {children}
      {tooltip}
    </div>
  );
}
