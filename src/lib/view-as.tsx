"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useData } from "@/lib/data/store";
import {
  VIEW_AS_STORAGE_KEY,
  clearViewAsStorage,
  viewAsStorageKey,
} from "@/lib/view-as-storage";
import type { Person } from "@/lib/types";

export { VIEW_AS_STORAGE_KEY, clearViewAsStorage } from "@/lib/view-as-storage";

type ViewAsContextValue = {
  viewAsPersonId: string | null;
  setViewAsPersonId: (id: string | null) => void;
  clearViewAs: () => void;
  viewedPerson: Person | null;
  /** Effective person id for assignee-scoped views (view-as or self for members). */
  effectivePersonId: string | null;
  /** When true, managers see all tasks (no view-as). */
  showingAsManager: boolean;
  /**
   * Manage capability for UI/data scoping. False while Viewing As so the app
   * matches a member experience. Raw canManage stays true for Exit / picker.
   */
  effectiveCanManage: boolean;
};

const ViewAsContext = createContext<ViewAsContextValue | null>(null);

function readStoredId(isPublicShare: boolean): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(viewAsStorageKey(isPublicShare));
  } catch {
    return null;
  }
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const { state, canManage, myPerson, isPublicShare } = useData();
  const canViewAs = canManage || isPublicShare;
  const [viewAsPersonId, setViewAsPersonIdState] = useState<string | null>(
    () => readStoredId(isPublicShare),
  );

  const setViewAsPersonId = useCallback(
    (id: string | null) => {
      setViewAsPersonIdState(id);
      try {
        const key = viewAsStorageKey(isPublicShare);
        if (id) sessionStorage.setItem(key, id);
        else sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
    [isPublicShare],
  );

  const clearViewAs = useCallback(() => {
    setViewAsPersonId(null);
  }, [setViewAsPersonId]);

  // Members (non-public) cannot use View As — drop stale sessionStorage.
  useEffect(() => {
    if (!canViewAs && viewAsPersonId) {
      setViewAsPersonId(null);
    }
  }, [canViewAs, viewAsPersonId, setViewAsPersonId]);

  const viewedPerson = useMemo(() => {
    if (!viewAsPersonId) return null;
    return state.people.find((p) => p.id === viewAsPersonId) ?? null;
  }, [state.people, viewAsPersonId]);

  // Invalid stored id (person deleted)
  const resolvedViewAsId =
    canViewAs && viewAsPersonId && viewedPerson ? viewAsPersonId : null;

  const value = useMemo<ViewAsContextValue>(() => {
    // Public org share uses the same org-wide scope as managers (read-only).
    const orgWide = canManage || isPublicShare;
    const showingAsManager = orgWide && !resolvedViewAsId;
    const effectivePersonId = orgWide
      ? resolvedViewAsId
      : myPerson?.id ?? null;
    const effectiveCanManage = canManage && !resolvedViewAsId;
    return {
      viewAsPersonId: resolvedViewAsId,
      setViewAsPersonId,
      clearViewAs,
      viewedPerson: resolvedViewAsId ? viewedPerson : null,
      effectivePersonId,
      showingAsManager,
      effectiveCanManage,
    };
  }, [
    canManage,
    isPublicShare,
    resolvedViewAsId,
    myPerson?.id,
    setViewAsPersonId,
    clearViewAs,
    viewedPerson,
  ]);

  return (
    <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>
  );
}

export function useViewAs(): ViewAsContextValue {
  const ctx = useContext(ViewAsContext);
  if (!ctx) {
    throw new Error("useViewAs must be used within ViewAsProvider");
  }
  return ctx;
}

/** Safe for share routes / components outside ViewAsProvider. */
export function useViewAsOptional(): ViewAsContextValue | null {
  return useContext(ViewAsContext);
}
