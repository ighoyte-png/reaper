"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { clsx } from "clsx";

type ToastKind = "default" | "warning" | "success";

interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  push: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = "default") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex max-w-sm flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-80">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              "pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-lg",
              toast.kind === "warning" &&
                "border-[var(--status-near)] bg-[var(--bg-elevated)] text-[var(--text)]",
              toast.kind === "success" &&
                "border-[var(--status-healthy)] bg-[var(--bg-elevated)] text-[var(--text)]",
              toast.kind === "default" &&
                "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]",
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
