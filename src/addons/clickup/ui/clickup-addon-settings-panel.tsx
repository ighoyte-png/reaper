"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import type {
  AddonClickupSettingsPublic,
  ClickUpStatusMap,
} from "@/addons/clickup/types";
import { emptyStatusMap } from "@/addons/clickup/types";

type Team = { id: string; name: string };
type Space = { id: string; name: string; statuses: string[] };

export function ClickUpAddonSettingsPanel() {
  const { push } = useToast();
  const { state } = useData();
  const people = state.people.filter((p) => !p.deleted_at);

  const [settings, setSettings] = useState<AddonClickupSettingsPublic | null>(
    null,
  );
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [legacyTokenInput, setLegacyTokenInput] = useState("");
  const [showLegacyPat, setShowLegacyPat] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [teamId, setTeamId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [newSpaceName, setNewSpaceName] = useState("");
  const [statusMap, setStatusMap] = useState<ClickUpStatusMap>(emptyStatusMap());
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [cuMembers, setCuMembers] = useState<
    { id: string; email: string | null; username: string | null }[]
  >([]);
  const [userMaps, setUserMaps] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/addons/clickup/settings");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load settings");
    const s = json.settings as AddonClickupSettingsPublic;
    setSettings(s);
    setEnabled(s.enabled);
    setTeamId(s.clickup_team_id ?? "");
    setSpaceId(s.space_id ?? "");
    setStatusMap(s.status_map ?? emptyStatusMap());
  }, []);

  useEffect(() => {
    void load().catch((e) =>
      push(
        e instanceof Error ? e.message : "Failed to load ClickUp settings",
        "warning",
      ),
    );
  }, [load, push]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("clickup") === "service_connected") {
      push("ClickUp service account connected", "success");
      void load();
    } else if (params.get("clickup") === "error") {
      push(
        params.get("message") || "ClickUp connection failed",
        "warning",
      );
    }
  }, [load, push]);

  async function saveOAuthApp() {
    setBusy(true);
    try {
      const res = await fetch("/api/addons/clickup/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oauth_client_id: clientIdInput.trim() || undefined,
          oauth_client_secret: clientSecretInput.trim() || undefined,
          enabled: false,
          clickup_team_id: teamId || null,
          space_id: spaceId || null,
          status_map: statusMap,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSettings(json.settings);
      setClientIdInput("");
      setClientSecretInput("");
      push("OAuth app saved", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function loadTeams() {
    setBusy(true);
    try {
      const tRes = await fetch("/api/addons/clickup/spaces");
      const tJson = await tRes.json();
      if (!tRes.ok) throw new Error(tJson.error ?? "Failed to list workspaces");
      setTeams(tJson.teams ?? []);
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function loadSpacesForTeam(id: string) {
    if (!id) {
      setSpaces([]);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/addons/clickup/spaces?teamId=${encodeURIComponent(id)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to list spaces");
      setSpaces(json.spaces ?? []);
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "warning");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (teamId) void loadSpacesForTeam(teamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    const space = spaces.find((s) => s.id === spaceId);
    if (space?.statuses?.length) {
      setStatusOptions(space.statuses);
    }
  }, [spaceId, spaces]);

  async function createSpace() {
    if (!teamId || !newSpaceName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/addons/clickup/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, name: newSpaceName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Create space failed");
      await loadSpacesForTeam(teamId);
      setSpaceId(json.space.id);
      setStatusOptions(json.space.statuses ?? []);
      setNewSpaceName("");
      push("Space created", "success");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function saveAndEnable() {
    setBusy(true);
    try {
      const space = spaces.find((s) => s.id === spaceId);
      const res = await fetch("/api/addons/clickup/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          oauth_client_id: clientIdInput.trim() || undefined,
          oauth_client_secret: clientSecretInput.trim() || undefined,
          personal_api_token: legacyTokenInput.trim() || undefined,
          clickup_team_id: teamId || null,
          space_id: spaceId || null,
          space_name: space?.name ?? settings?.space_name ?? null,
          status_map: statusMap,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSettings(json.settings);
      setClientIdInput("");
      setClientSecretInput("");
      setLegacyTokenInput("");
      push(
        enabled ? "ClickUp addon enabled" : "ClickUp settings saved",
        "success",
      );
      if (enabled) void loadUserMaps();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "warning");
    } finally {
      setBusy(false);
    }
  }

  async function loadUserMaps() {
    try {
      const res = await fetch("/api/addons/clickup/users");
      const json = await res.json();
      if (!res.ok) return;
      setCuMembers(json.members ?? []);
      const maps: Record<string, string> = {};
      for (const m of json.maps ?? []) {
        maps[m.person_id] = m.clickup_user_id;
      }
      setUserMaps(maps);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (settings?.enabled) void loadUserMaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.enabled]);

  const statusSelectOptions = [
    { value: "", label: "Select status…" },
    ...Array.from(
      new Set([
        ...statusOptions,
        statusMap.upcoming,
        statusMap.active,
        statusMap.complete,
      ]),
    )
      .filter(Boolean)
      .map((s) => ({ value: s, label: s })),
  ];

  return (
    <div className="mt-8 border-t border-[var(--border)] pt-6">
      <h3 className="text-sm font-semibold">Addons · ClickUp</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Sync Reaper ↔ ClickUp with per-user OAuth so creates and comments appear
        as the real actor. Configure the OAuth app once, connect a service
        account for backfill, enable the addon, then optionally turn on two-way
        webhooks. Each teammate connects under Account.
      </p>

      <div className="mt-4 space-y-3">
        <p className="text-xs font-medium text-[var(--text)]">
          1. ClickUp OAuth app
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          In ClickUp → Settings → Apps → Create an App. Set the redirect URL to
          the URI below.
        </p>
        {settings?.oauth_redirect_uri ? (
          <Field label="Redirect URL (copy into ClickUp)">
            <input
              className={inputClass}
              readOnly
              value={settings.oauth_redirect_uri}
              onFocus={(e) => e.target.select()}
            />
          </Field>
        ) : null}
        <Field label="Client ID">
          <input
            className={inputClass}
            autoComplete="off"
            placeholder={
              settings?.has_oauth_app
                ? `Saved: ${settings.oauth_client_id_masked ?? "…"}`
                : "Client ID"
            }
            value={clientIdInput}
            onChange={(e) => setClientIdInput(e.target.value)}
          />
        </Field>
        <Field label="Client secret">
          <input
            className={inputClass}
            type="password"
            autoComplete="off"
            placeholder={
              settings?.has_oauth_app ? "Saved (leave blank to keep)" : "Secret"
            }
            value={clientSecretInput}
            onChange={(e) => setClientSecretInput(e.target.value)}
          />
        </Field>
        <Button
          type="button"
          size="sm"
          disabled={
            busy ||
            (!clientIdInput.trim() &&
              !clientSecretInput.trim() &&
              !settings?.has_oauth_app)
          }
          onClick={() => void saveOAuthApp()}
        >
          Save OAuth app
        </Button>

        <p className="pt-2 text-xs font-medium text-[var(--text)]">
          2. Service account (for reconcile / users without Connect)
        </p>
        {settings?.has_service_connection ? (
          <p className="text-xs text-[var(--status-under)]">
            Service account connected
            {settings.service_profile_id
              ? ` (profile ${settings.service_profile_id.slice(0, 8)}…)`
              : ""}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            Not connected yet. Use an admin ClickUp account with edit access to
            the target Space.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy || !settings?.has_oauth_app}
            onClick={() => {
              window.location.href =
                "/api/addons/clickup/oauth/start?purpose=service";
            }}
          >
            {settings?.has_service_connection
              ? "Reconnect service account"
              : "Connect service account"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || !settings?.has_service_connection}
            onClick={() => void loadTeams()}
          >
            Load workspaces
          </Button>
        </div>

        <Field label="ClickUp workspace">
          <Select
            value={teamId}
            onChange={(v) => {
              setTeamId(v);
              setSpaceId("");
            }}
            options={[
              { value: "", label: "Select workspace…" },
              ...teams.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </Field>

        <Field label="Space">
          <Select
            value={spaceId}
            onChange={(v) => setSpaceId(v)}
            options={[
              { value: "", label: "Select space…" },
              ...spaces.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Or create a new Space">
            <input
              className={inputClass}
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              placeholder="Reaper mirror"
            />
          </Field>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || !teamId || !newSpaceName.trim()}
            onClick={() => void createSpace()}
          >
            Create Space
          </Button>
        </div>

        <p className="text-xs font-medium text-[var(--text)]">Status mapping</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Active (upcoming)">
            <Select
              value={statusMap.upcoming}
              onChange={(v) =>
                setStatusMap((m) => ({ ...m, upcoming: v }))
              }
              options={statusSelectOptions}
            />
          </Field>
          <Field label="In Review (active)">
            <Select
              value={statusMap.active}
              onChange={(v) => setStatusMap((m) => ({ ...m, active: v }))}
              options={statusSelectOptions}
            />
          </Field>
          <Field label="Complete">
            <Select
              value={statusMap.complete}
              onChange={(v) =>
                setStatusMap((m) => ({ ...m, complete: v }))
              }
              options={statusSelectOptions}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void saveAndEnable()}
          >
            Save ClickUp settings
          </Button>
          <span className="text-xs text-[var(--text-muted)]">
            Saves Space, status mapping, and whether the addon is enabled.
          </span>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable ClickUp addon for this workspace
        </label>

        {settings?.enabled ? (
          <div className="space-y-2 rounded-md border border-[var(--border)] p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={Boolean(settings.webhook_enabled)}
                disabled={busy}
                onChange={(e) => {
                  void (async () => {
                    setBusy(true);
                    try {
                      const res = await fetch("/api/addons/clickup/settings", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          enabled: true,
                          webhook_enabled: e.target.checked,
                          clickup_team_id: teamId || null,
                          space_id: spaceId || null,
                          space_name:
                            spaces.find((s) => s.id === spaceId)?.name ??
                            settings.space_name,
                          status_map: statusMap,
                        }),
                      });
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error ?? "Failed");
                      setSettings(json.settings);
                      push(
                        e.target.checked
                          ? "Two-way sync enabled (webhook registered)"
                          : "Two-way sync disabled",
                        "success",
                      );
                    } catch (err) {
                      push(
                        err instanceof Error ? err.message : "Failed",
                        "warning",
                      );
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />
              Two-way sync (ClickUp → Reaper)
            </label>
            <p className="text-xs text-[var(--text-muted)]">
              Registers a Space webhook so edits and new tasks in linked lists
              flow into sync-enabled projects. Last-write-wins; Re-sync still
              overwrites ClickUp.
            </p>
            {settings.webhook_endpoint ? (
              <Field label="Webhook endpoint">
                <input
                  className={inputClass}
                  readOnly
                  value={settings.webhook_endpoint}
                  onFocus={(ev) => ev.target.select()}
                />
              </Field>
            ) : null}
            <p className="text-xs text-[var(--text-muted)]">
              {settings.has_webhook ? "Webhook registered" : "No webhook yet"}
              {settings.last_webhook_at
                ? ` · last event ${new Date(settings.last_webhook_at).toLocaleString()}`
                : ""}
            </p>
            {settings.last_webhook_error ? (
              <p className="text-xs text-[var(--status-over)]">
                Webhook error: {settings.last_webhook_error}
              </p>
            ) : null}
          </div>
        ) : null}

        {settings?.last_error ? (
          <p className="text-xs text-[var(--status-over)]">
            Last error: {settings.last_error}
          </p>
        ) : null}

        <button
          type="button"
          className="text-xs text-[var(--text-muted)] underline"
          onClick={() => setShowLegacyPat((v) => !v)}
        >
          {showLegacyPat ? "Hide" : "Show"} legacy personal token option
        </button>
        {showLegacyPat ? (
          <Field label="Legacy personal API token (fallback only)">
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              placeholder={
                settings?.token_masked
                  ? `Saved: ${settings.token_masked}`
                  : "pk_…"
              }
              value={legacyTokenInput}
              onChange={(e) => setLegacyTokenInput(e.target.value)}
            />
          </Field>
        ) : null}

        {settings?.enabled ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium">Assignee map (optional)</p>
            <p className="text-xs text-[var(--text-muted)]">
              Users who Connect ClickUp are auto-mapped. Override below if
              needed.
            </p>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {people.slice(0, 40).map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <span className="min-w-[8rem]">{p.name}</span>
                  <Select
                    value={userMaps[p.id] ?? ""}
                    onChange={(v) => {
                      setUserMaps((m) => ({ ...m, [p.id]: v }));
                      void fetch("/api/addons/clickup/users", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          person_id: p.id,
                          clickup_user_id: v || null,
                        }),
                      });
                    }}
                    options={[
                      { value: "", label: "—" },
                      ...cuMembers.map((m) => ({
                        value: m.id,
                        label: m.username || m.email || m.id,
                      })),
                    ]}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
