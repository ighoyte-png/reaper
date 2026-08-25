"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  Copy,
  Download,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { resolveAttachmentDownloadUrl } from "@/lib/storage/client-upload";
import { cn } from "@/lib/cn";

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;

export type ImageLightboxTarget = {
  src: string;
  alt?: string;
  attachmentId?: string | null;
};

export function ImageLightbox({
  src,
  alt,
  attachmentId,
  onClose,
}: ImageLightboxTarget & { onClose: () => void }) {
  const { push } = useToast();
  const [mounted, setMounted] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clampScale = useCallback((next: number) => {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
  }, []);

  const setZoom = useCallback(
    (next: number) => {
      const clamped = clampScale(next);
      setScale(clamped);
      if (clamped <= 1) setOffset({ x: 0, y: 0 });
    },
    [clampScale],
  );

  const zoomBy = useCallback(
    (delta: number) => {
      setScale((s) => {
        const clamped = clampScale(s + delta);
        if (clamped <= 1) setOffset({ x: 0, y: 0 });
        return clamped;
      });
    },
    [clampScale],
  );

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  function onWheel(e: ReactWheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    zoomBy(delta);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLImageElement>) {
    if (scale <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLImageElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setOffset({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    });
  }

  function onPointerUp(e: ReactPointerEvent<HTMLImageElement>) {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  }

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      if (attachmentId) {
        const result = await resolveAttachmentDownloadUrl(attachmentId);
        if (result) {
          const a = document.createElement("a");
          a.href = result.url;
          a.download = result.filename || alt || "image";
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
          return;
        }
      }
      const res = await fetch(src);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = alt || "image";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Cross-origin signed URLs may block fetch; open in a new tab as fallback.
      window.open(src, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(src);
      push("Link copied", "success");
    } catch {
      push("Could not copy link", "warning");
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image preview"}
      onClick={onClose}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-black/40 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 truncate text-sm text-white/90">
          {alt || "Image"}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <ToolbarIcon
            label="Zoom out"
            onClick={() => zoomBy(-ZOOM_STEP)}
            disabled={scale <= MIN_SCALE}
          >
            <Minus size={16} strokeWidth={1.75} />
          </ToolbarIcon>
          <ToolbarIcon label="Reset zoom" onClick={resetView}>
            <RotateCcw size={16} strokeWidth={1.75} />
          </ToolbarIcon>
          <ToolbarIcon
            label="Zoom in"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={scale >= MAX_SCALE}
          >
            <Plus size={16} strokeWidth={1.75} />
          </ToolbarIcon>
          <ToolbarIcon
            label="Download"
            onClick={() => void download()}
            disabled={busy}
          >
            <Download size={16} strokeWidth={1.75} />
          </ToolbarIcon>
          <ToolbarIcon label="Copy link" onClick={() => void copyLink()}>
            <Copy size={16} strokeWidth={1.75} />
          </ToolbarIcon>
          <ToolbarIcon label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </ToolbarIcon>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 cursor-default items-center justify-center overflow-hidden p-4"
        onClick={(e) => {
          // Close when clicking the dimmed stage, not the image itself.
          if (e.target === e.currentTarget) onClose();
        }}
        onWheel={onWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt || ""}
          draggable={false}
          className={cn(
            "max-h-full max-w-full select-none object-contain transition-transform duration-100",
            scale > 1
              ? "cursor-grab active:cursor-grabbing"
              : "cursor-zoom-in",
          )}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => {
            if (scale === 1) setZoom(2);
            else resetView();
          }}
        />
      </div>
    </div>,
    document.body,
  );
}

function ToolbarIcon({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 w-8 px-0 text-white/90 hover:bg-white/10 hover:text-white disabled:opacity-40"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** Resolve a lightbox target from a click on an <img> (or nested target). */
export function imageLightboxTargetFromEvent(
  event: Event,
): ImageLightboxTarget | null {
  const target = event.target;
  if (!(target instanceof HTMLImageElement)) return null;
  if (target.classList.contains("rich-notes-img-pending")) return null;
  if (
    target.classList.contains("custom-emoji") ||
    target.getAttribute("data-type") === "custom-emoji"
  ) {
    return null;
  }
  const src = target.currentSrc || target.src;
  if (!src || src.startsWith("data:image/svg+xml")) return null;
  const attachmentId = target.getAttribute("data-attachment-id");
  return {
    src,
    alt: target.alt || undefined,
    attachmentId: attachmentId || null,
  };
}
