/**
 * ClickUp internal URLs.
 * @see https://help.clickup.com/hc/en-us/articles/41521317138455
 *
 * Folder Overview (`/v/o/f/{folderId}`) is the documented folder deep link.
 * ClickUp does not publish a stable URL to open a folder with a specific
 * Views-bar tab (e.g. List) preselected — that requires a view id.
 */

/** Folder Overview URL. */
export function clickUpFolderUrl(
  teamId: string | null | undefined,
  folderId: string | null | undefined,
): string | null {
  const team = String(teamId ?? "").trim();
  const folder = String(folderId ?? "").trim();
  if (!team || !folder) return null;
  return `https://app.clickup.com/${encodeURIComponent(team)}/v/o/f/${encodeURIComponent(folder)}`;
}

/** List view URL (a ClickUp List, not a folder tab). */
export function clickUpListUrl(
  teamId: string | null | undefined,
  listId: string | null | undefined,
): string | null {
  const team = String(teamId ?? "").trim();
  const list = String(listId ?? "").trim();
  if (!team || !list) return null;
  return `https://app.clickup.com/${encodeURIComponent(team)}/v/li/${encodeURIComponent(list)}`;
}
