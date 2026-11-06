"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Select, type SelectOption } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/toast/toast-provider";
import type { AddonClickupProjectSyncRow, ReconcileSummary } from "@/addons/clickup/types";

type FolderOption = {
  id: string;
  name: string;
  parent_folder?: string | null;
};

/** Depth-first tree order with path labels for nested ClickUp folders. */
function folderSelectOptions(folders: FolderOption[]): SelectOption[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const children = new Map<string | null, FolderOption[]>();
  for (const f of folders) {
    const parentId =
      f.parent_folder && byId.has(f.parent_folder) ? f.parent_folder : null;
    const list = children.get(parentId) ?? [];
    list.push(f);
    children.set(parentId, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const out: SelectOption[] = [];
  const walk = (parentId: string | null, depth: number, path: string[]) => {
    for (const f of children.get(parentId) ?? []) {
      const nextPath = [...path, f.name];
      out.push({
        value: f.id,
        // Closed trigger shows full path so duplicate leaf names stay clear.
        label: nextPath.join(" › "),
        menuLabel: f.name,
        depth,
      });
      walk(f.id, depth + 1, nextPath);
    }
  };
  walk(null, 0, []);
  return out;
}

export function ClickUpProjectSyncToggle({
  projectId,
  sandboxMode,
}: {
  projectId: string;
  sandboxMode?: boolean;
}) {
  const { push } = useToast();
  const [addonEnabled, setAddonEnabled] = useState(false);
  const [twoWayOn, setTwoWayOn] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [sync, setSync] = useState<AddonClickupProjectSyncRow | null>(null);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [linkedFolder, setLinkedFolder] = useState<{
    id: string;
    name: string;
    path: string;
  } | null>(null);
  const [linkMode, setLinkMode] = useState<"create" | "link">("create");
  const [folderId, setFolderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ReconcileSummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  const folderOptions = useMemo(
    () => [
      { value: "", label: "Select folder…" },
      ...folderSelectOptions(folders),
    ],
    [folders],
  );

  const refresh = useCallback(async () => {
    const sRes = await fetch("/api/addons/clickup/settings");
    const sJson = await sRes.json();
    if (!sRes.ok) {
      setAddonEnabled(false);
      setLoaded(true);
      return;
    }
    const enabled = Boolean(sJson.settings?.enabled);
    setAddonEnabled(enabled);
    setTwoWayOn(Boolean(sJson.settings?.webhook_enabled));
    setWebhookError(sJson.settings?.last_webhook_error ?? null);
    if (!enabled) {
      setLoaded(true);
      return;
    }
    const pRes = await fetch(
      `/api/addons/clickup/project-sync?projectId=${encodeURIComponent(projectId)}`,
    );
    const pJson = await pRes.json();
    if (pRes.ok) {
      setSync(pJson.sync);
      setSummary(pJson.sync?.last_reconcile_summary ?? null);
      setLinkedFolder(pJson.clickup_folder ?? null);
      if (pJson.sync?.link_mode === "link") setLinkMode("link");
    }
    const fRes = await fetch("/api/addons/clickup/folders");
    const fJson = await fRes.json();
    if (fRes.ok) setFolders(fJson.folders ?? []);
    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    void refresh().catch(() => setLoaded(true));
  }, [refresh]);

  if (!loaded || !addonEnabled || sandboxMode) return null;

  async function enableSync() {
    if (linkMode === "link" && !folderId) {
      push("Select a ClickUp folder to link", "warning");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/addons/clickup/project-sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          enabled: true,
          link_mode: linkMode,
          link_clickup_folder_id:
            linkMode === "link" ? folderId || null : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      setSync(json.sync);
      setSummary(json.summary ?? null);
      setLinkedFolder(json.clickup_folder ?? null);
      push("ClickUp sync enabled — reconcile finished", "success");
      void fetch("/api/addons/clickup/process-outbox", { method: "POST" });
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function disableSync() {
    setBusy(true);
    try {
      const res = await fetch("/api/addons/clickup/project-sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, enabled: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setSync(json.sync);
      setLinkedFolder(null);
      push("ClickUp sync turned off for this project", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function resync() {
    setBusy(true);
    try {
      const res = await fetch("/api/addons/clickup/project-sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          enabled: true,
          resync: true,
          link_mode: sync?.link_mode ?? linkMode,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Re-sync failed");
      setSync(json.sync);
      setSummary(json.summary ?? null);
      setLinkedFolder(json.clickup_folder ?? null);
      push("Re-sync complete", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "warning");
    } finally {
      setBusy(false);
    }
  }

  const on = Boolean(sync?.enabled);

  return (
    <div className="mt-4 rounded-md border border-[var(--border)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={on}
            disabled={busy || sync?.reconciling}
            onChange={(e) => {
              if (e.target.checked) void enableSync();
              else void disableSync();
            }}
          />
          Sync to ClickUp
        </label>
        {sync?.reconciling ? (
          <span className="text-xs text-[var(--text-muted)]">Reconciling…</span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Default off. Turning on links or creates this project in ClickUp and
        runs a full reconcile (Reaper wins). With workspace two-way sync on,
        ClickUp edits and new tasks in linked lists also flow into this project.
        Gantt-enabled lists stay Reaper-authoritative: ClickUp cannot change
        dates, move/delete those tasks, or create into those lists.
      </p>

      {!on ? (
        <div className="mt-3 space-y-2">
          <Field label="When enabling">
            <Select
              value={linkMode}
              onChange={(v) =>
                setLinkMode(v === "link" ? "link" : "create")
              }
              options={[
                { value: "create", label: "Create new folder in ClickUp" },
                { value: "link", label: "Link to existing ClickUp folder" },
              ]}
            />
          </Field>
          {linkMode === "link" ? (
            <Field label="ClickUp folder">
              <Select
                value={folderId}
                onChange={(v) => setFolderId(v)}
                searchable
                options={folderOptions}
              />
            </Field>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-[var(--text)]">
            <span className="text-[var(--text-muted)]">Synced folder: </span>
            {linkedFolder?.path ?? "Not linked yet"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void resync()}
            >
              Re-sync now
            </Button>
          </div>
        </div>
      )}

      {summary ? (
        <div className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
          <p>
            Last reconcile: created {summary.created}, updated{" "}
            {summary.updated}, in sync {summary.in_sync}, ClickUp orphans{" "}
            {summary.orphans}
            {summary.errors?.length
              ? ` · ${summary.errors.length} error(s)`
              : ""}
          </p>
          {summary.errors?.length ? (
            <ul className="list-inside list-disc text-[var(--status-over)]">
              {summary.errors.slice(0, 5).map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {sync?.last_error ? (
        <p className="mt-1 text-xs text-[var(--status-over)]">{sync.last_error}</p>
      ) : null}
      {twoWayOn && webhookError ? (
        <p className="mt-1 text-xs text-[var(--status-over)]">
          Inbound webhook: {webhookError}
        </p>
      ) : null}
    </div>
  );
}
