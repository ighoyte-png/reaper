/**
 * ClickUp internal URLs.
 * @see https://help.clickup.com/hc/en-us/articles/41521317138455
 */

/** Folder Overview — can render blank after white-label session refresh. */
export function clickUpFolderUrl(
  teamId: string | null | undefined,
  folderId: string | null | undefined,
): string | null {
  const team = String(teamId ?? "").trim();
  const folder = String(folderId ?? "").trim();
  if (!team || !folder) return null;
  return `https://app.clickup.com/${encodeURIComponent(team)}/v/o/f/${encodeURIComponent(folder)}`;
}

/** List view — reliable landing page with task content. */
export function clickUpListUrl(
  teamId: string | null | undefined,
  listId: string | null | undefined,
): string | null {
  const team = String(teamId ?? "").trim();
  const list = String(listId ?? "").trim();
  if (!team || !list) return null;
  return `https://app.clickup.com/${encodeURIComponent(team)}/v/li/${encodeURIComponent(list)}`;
}
