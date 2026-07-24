import type { PodFilter } from "@/lib/domain/pods";

function storageKey(orgId: string, profileId: string | null | undefined): string {
  return `reaper-schedule-pod:${orgId}:${profileId || "anon"}`;
}

/** Persisted schedule Pod filter (survives leaving the Schedule page). */
export function readSchedulePodFilter(
  orgId: string | null | undefined,
  profileId: string | null | undefined,
): PodFilter {
  if (!orgId || typeof window === "undefined") return "all";
  try {
    const raw = localStorage.getItem(storageKey(orgId, profileId));
    if (!raw || raw === "all") return "all";
    return raw;
  } catch {
    return "all";
  }
}

export function writeSchedulePodFilter(
  orgId: string | null | undefined,
  profileId: string | null | undefined,
  podFilter: PodFilter,
): void {
  if (!orgId || typeof window === "undefined") return;
  try {
    const key = storageKey(orgId, profileId);
    if (podFilter === "all") localStorage.removeItem(key);
    else localStorage.setItem(key, podFilter);
  } catch {
    /* ignore quota / private mode */
  }
}
