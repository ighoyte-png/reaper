"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block text-xs text-[var(--text-muted)]", className)}>
      {label}
      {children}
    </label>
  );
}

export const inputClass =
  "mt-1 h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)]";

/** Native date input that opens the calendar when clicking anywhere on the field. */
export function DateInput({
  className,
  onClick,
  ...props
}: Omit<ComponentPropsWithoutRef<"input">, "type">) {
  return (
    <input
      {...props}
      type="date"
      className={cn("cursor-pointer", className)}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || props.disabled || props.readOnly) return;
        try {
          e.currentTarget.showPicker?.();
        } catch {
          // Unsupported browser or non-gesture context — native control still works.
        }
      }}
    />
  );
}

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function Modal({
  title,
  children,
  onClose,
  className,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Extra classes for the dialog panel (e.g. wider max-width). */
  className?: string;
}) {
  const mounted = useMounted();
  if (!mounted) return null;

  // clsx doesn't dedupe Tailwind conflicts — omit default max-w when caller sets one.
  const hasCustomMaxWidth = Boolean(className && /\bmax-w-/.test(className));

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        className={cn(
          "max-h-[90dvh] w-full overflow-y-auto rounded-t-xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-xl sm:rounded-[var(--radius-md)]",
          !hasCustomMaxWidth && "max-w-lg",
          className,
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 px-0"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </Button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  tone,
  mode = "confirm",
  onConfirm,
  onCancel,
  children,
  confirmDisabled = false,
  altConfirmLabel,
  onAltConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  /** Secondary button label in confirm mode (default Cancel). */
  cancelLabel?: string;
  /** danger = red destructive; accent = primary action */
  tone?: "danger" | "accent";
  /** notice = single OK/Got it button (no Cancel) */
  mode?: "confirm" | "notice";
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
  confirmDisabled?: boolean;
  altConfirmLabel?: string;
  onAltConfirm?: () => void;
}) {
  const mounted = useMounted();
  if (!mounted) return null;

  const resolvedTone = tone ?? (mode === "notice" ? "accent" : "danger");
  const resolvedLabel =
    confirmLabel ?? (mode === "notice" ? "OK" : "Delete");

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-4 shadow-xl">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{message}</p>
        {children}
        <div className="mt-4 flex justify-end gap-2">
          {mode === "confirm" ? (
            <Button variant="secondary" size="lg" onClick={onCancel}>
              {cancelLabel}
            </Button>
          ) : null}
          <Button
            variant={resolvedTone === "accent" ? "primary" : "destructive"}
            size="lg"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {resolvedLabel}
          </Button>
          {altConfirmLabel && onAltConfirm ? (
            <Button
              variant="primary"
              size="lg"
              disabled={confirmDisabled}
              onClick={onAltConfirm}
            >
              {altConfirmLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function EmptyState({
  title,
  cta,
  onClick,
}: {
  title: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] px-6 py-16 text-center">
      <p className="text-sm text-[var(--text-muted)]">{title}</p>
      <Button
        variant="primary"
        size="lg"
        className="mt-4 px-4"
        onClick={onClick}
      >
        {cta}
      </Button>
    </div>
  );
}
