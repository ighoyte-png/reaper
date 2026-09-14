"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/toast/toast-provider";
import type { AddonClickupOAuthConnectionPublic } from "@/addons/clickup/types";

/** Per-user Connect ClickUp (Account settings). */
export function ClickUpUserConnectPanel() {
  const { push } = useToast();
  const [connection, setConnection] =
    useState<AddonClickupOAuthConnectionPublic | null>(null);
  const [hasOAuthApp, setHasOAuthApp] = useState(false);
  const [addonEnabled, setAddonEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/addons/clickup/oauth/connection");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Failed to load connection");
    setConnection(json.connection);
    setHasOAuthApp(Boolean(json.has_oauth_app));
    setAddonEnabled(Boolean(json.addon_enabled));
  }, []);

  useEffect(() => {
    void load().catch(() => {
      /* addon may be unavailable */
    });
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("clickup");
    if (status === "connected") {
      push("ClickUp connected — stays linked across sessions", "success");
      void load();
    } else if (status === "error" && params.get("tab") !== "admin") {
      push(params.get("message") || "ClickUp connection failed", "warning");
    }
  }, [load, push]);

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/addons/clickup/oauth/connection", {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Disconnect failed");
      push("ClickUp disconnected");
      await load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "warning");
    } finally {
      setBusy(false);
    }
  }

  if (!hasOAuthApp && !addonEnabled && !connection?.connected) {
    return null;
  }

  return (
    <Panel>
      <h2 className="text-sm font-semibold">ClickUp</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Connect so your creates, edits, and comments show as you in ClickUp when
        your account can write there. If you skip this, sync still works via the
        workspace service account.
      </p>
      {connection?.connected ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-[var(--status-under)]">
            Connected
            {connection.clickup_user_id
              ? ` · ClickUp user ${connection.clickup_user_id}`
              : ""}
            {connection.is_service_account ? " · service account" : ""}
          </p>
          {connection.needs_reauth ? (
            <p className="text-xs text-[var(--status-over)]">
              Reconnect required — ClickUp rejected the saved token.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {connection.needs_reauth ? (
              <Button
                type="button"
                size="sm"
                disabled={busy || !hasOAuthApp}
                onClick={() => {
                  window.location.href =
                    "/api/addons/clickup/oauth/start?purpose=user";
                }}
              >
                Reconnect ClickUp
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {!hasOAuthApp ? (
            <p className="text-xs text-[var(--text-muted)]">
              Ask a workspace admin to configure the ClickUp OAuth app first.
            </p>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => {
                window.location.href =
                  "/api/addons/clickup/oauth/start?purpose=user";
              }}
            >
              Connect ClickUp
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}
