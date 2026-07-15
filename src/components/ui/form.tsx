import { cn } from "@/lib/cn";

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
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
  "mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 text-sm text-[var(--text)]";

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-xl sm:rounded-md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            className="text-sm text-[var(--text-muted)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 shadow-xl">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="h-9 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-9 rounded-md bg-[var(--status-over)] px-3 text-sm font-medium text-white hover:opacity-90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
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
    <div className="rounded-md border border-dashed border-[var(--border)] px-6 py-16 text-center">
      <p className="text-sm text-[var(--text-muted)]">{title}</p>
      <button
        type="button"
        onClick={onClick}
        className="mt-4 h-9 rounded-md bg-[var(--accent)] px-4 text-sm text-[var(--accent-fg)]"
      >
        {cta}
      </button>
    </div>
  );
}
