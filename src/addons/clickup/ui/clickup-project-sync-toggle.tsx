"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/toast/toast-provider";
import type { AddonClickupProjectSyncRow, ReconcileSummary } from "@/addons/clickup/types";

export function ClickUpProjectSyncToggle({
  projectId,
  sandboxMode,
}: {
  projectId: string;
  sandboxMode?: boolean;
}) {
  const { push } = useToast();
  const [addonEnabled, setAddonEnabled] = useState(false);
  const [sync, setSync] = useState<AddonClickupProjectSyncRow | null>(null);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [linkMode, setLinkMode] = useState<"create" | "link">("create");
  const [folderId, setFolderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ReconcileSummary | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  // Poll outbox while sync is on
  useEffect(() => {
    if (!sync?.enabled) return;
    const id = window.setInterval(() => {
      void fetch("/api/addons/clickup/process-outbox", { method: "POST" });
    }, 4000);
    return () => window.clearInterval(id);
  }, [sync?.enabled]);

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
      push("ClickUp sync enabled — reconcile finished", "success");
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
        runs a full reconcile (Reaper wins).
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
                options={[
                  { value: "", label: "Select folder…" },
                  ...folders.map((f) => ({ value: f.id, label: f.name })),
                ]}
              />
            </Field>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
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
    </div>
  );
}
