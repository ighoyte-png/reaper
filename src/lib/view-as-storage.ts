/** sessionStorage key for View As person id (client UX only). */
export const VIEW_AS_STORAGE_KEY = "reaper-view-as-person-id";

/** Separate key for public org share so it does not collide with logged-in View As. */
export const VIEW_AS_PUBLIC_STORAGE_KEY = "reaper-view-as-person-id:public";

export function viewAsStorageKey(isPublicShare: boolean) {
  return isPublicShare ? VIEW_AS_PUBLIC_STORAGE_KEY : VIEW_AS_STORAGE_KEY;
}

/** Clear View As from sessionStorage (logout / demo switch). */
export function clearViewAsStorage() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(VIEW_AS_STORAGE_KEY);
    sessionStorage.removeItem(VIEW_AS_PUBLIC_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
