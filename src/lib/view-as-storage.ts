/** sessionStorage key for View As person id (client UX only). */
export const VIEW_AS_STORAGE_KEY = "reaper-view-as-person-id";

/** Clear View As from sessionStorage (logout / demo switch). */
export function clearViewAsStorage() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(VIEW_AS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
