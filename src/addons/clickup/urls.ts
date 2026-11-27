/**
 * Internal ClickUp folder overview URL.
 * @see https://help.clickup.com/hc/en-us/articles/41521317138455
 */
export function clickUpFolderUrl(
  teamId: string | null | undefined,
  folderId: string | null | undefined,
): string | null {
  const team = String(teamId ?? "").trim();
  const folder = String(folderId ?? "").trim();
  if (!team || !folder) return null;
  return `https://app.clickup.com/${encodeURIComponent(team)}/v/o/f/${encodeURIComponent(folder)}`;
}
