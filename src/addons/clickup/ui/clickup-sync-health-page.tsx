"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/nav/page-container";
import { PageHeader } from "@/components/nav/page-header";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { useAppHref } from "@/lib/hooks/use-app-href";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { cn } from "@/lib/cn";
import type { ClickUpSyncHealth } from "@/addons/clickup/health";

function statusTone(status: ClickUpSyncHealth["status"]) {
  switch (status) {
    case "ok":
      return "text-[var(--status-healthy)]";
    case "degraded":
      return "text-[var(--status-near)]";
    case "down":
      return "text-[var(--status-over)]";
    default:
      return "text-[var(--text-muted)]";
  }
}

function statusLabel(status: ClickUpSyncHealth["status"]) {
  switch (status) {
    case "ok":
      return "Healthy";
    case "degraded":
      return "Degraded";
    case "down":
      return "Down";
    default:
      return "Off";
  }
}

export function ClickUpSyncHealthPage() {
  const appHref = useAppHref();
  const { push } = useToast();
  useDocumentTitle("ClickUp sync health");
  const [health, setHealth] = useState<ClickUpSyncHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"heal" | "drain" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/addons/clickup/health");
      const json = (await res.json().catch(() => ({}))) as {
        health?: ClickUpSyncHealth;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Could not load health");
        setHealth(null);
        return;
      }
      setHealth(json.health ?? null);
    } catch {
      setError("Could not load health");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: "heal" | "drain") {
    setBusy(action);
    try {
      const res = await fetch("/api/addons/clickup/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        health?: ClickUpSyncHealth;
        processed?: number;
        ignored?: number;
        action?: string;
      };
      if (!res.ok) {
        push(json.error ?? "Action failed", "warning");
        return;
      }
      if (json.health) setHealth(json.health);
      if (action === "heal") {
        push("Webhook healed — try a ClickUp edit to confirm", "success");
      } else {
        push(
          `Drain finished: processed ${json.processed ?? 0}, ignored ${json.ignored ?? 0}`,
          "success",
        );
      }
    } catch {
      push("Action failed", "warning");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageContainer className="overflow-y-auto">
      <PageHeader
        title={
          <Link
            href={appHref("/settings?tab=integrations")}
            className="font-semibold tracking-tight text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            Integrations
          </Link>
        }
        documentTitle="ClickUp sync health"
        onBack={() => {
          window.location.href = appHref("/settings?tab=integrations");
        }}
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={loading || busy != null}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        }
      />

      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            ClickUp sync health
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Two-way webhook status and inbound queue. Use Heal when ClickUp
            stops delivering (suspended / fail_count).
          </p>
        </div>

        {loading && !health ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : null}
        {error ? (
          <p className="text-sm text-[var(--status-over)]">{error}</p>
        ) : null}

        {health ? (
          <>
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    Status
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-base font-semibold",
                      statusTone(health.status),
                    )}
                  >
                    {statusLabel(health.status)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {health.statusReason}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy != null || !health.webhookEnabled}
                    onClick={() => void runAction("heal")}
                  >
                    {busy === "heal" ? "Healing…" : "Heal webhook"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={
                      busy != null ||
                      (health.queue.pending === 0 && health.queue.error === 0)
                    }
                    onClick={() => void runAction("drain")}
                  >
                    {busy === "drain" ? "Draining…" : "Process queue"}
                  </Button>
                </div>
              </div>
            </Panel>

            <Panel>
              <h2 className="text-sm font-semibold">Webhook</h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">
                    Two-way sync
                  </dt>
                  <dd>{health.webhookEnabled ? "On" : "Off"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">
                    Synced projects
                  </dt>
                  <dd>{health.syncedProjectCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">
                    ClickUp health
                  </dt>
                  <dd>
                    {health.webhook.healthStatus ?? "—"}
                    {health.webhook.failCount != null
                      ? ` · fail_count ${health.webhook.failCount}`
                      : ""}
                    {health.webhook.suspended ? " · suspended" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">
                    Last event received
                  </dt>
                  <dd>
                    {health.lastWebhookAt
                      ? new Date(health.lastWebhookAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-[var(--text-muted)]">Endpoint</dt>
                  <dd className="break-all font-mono text-xs">
                    {health.webhook.endpoint ?? "—"}
                  </dd>
                  {health.webhook.endpointMatch === false ? (
                    <p className="mt-1 text-xs text-[var(--status-over)]">
                      Expected {health.webhook.expectedEndpoint}
                    </p>
                  ) : null}
                </div>
                {health.lastWebhookError ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-[var(--text-muted)]">
                      Last error
                    </dt>
                    <dd className="text-xs text-[var(--status-over)]">
                      {health.lastWebhookError}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </Panel>

            <Panel>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Inbound queue</h2>
                <p className="text-xs text-[var(--text-muted)]">
                  {health.queue.pending} pending
                  {health.queue.locked > 0
                    ? ` · ${health.queue.locked} locked`
                    : ""}
                  {health.queue.error > 0
                    ? ` · ${health.queue.error} failed`
                    : ""}
                  {health.queue.oldestPendingAt
                    ? ` · oldest ${new Date(health.queue.oldestPendingAt).toLocaleString()}`
                    : ""}
                </p>
              </div>

              {health.queue.events.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Queue is empty.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-[var(--border)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">When</th>
                        <th className="px-2 py-1.5 font-medium">Event</th>
                        <th className="px-2 py-1.5 font-medium">Status</th>
                        <th className="px-2 py-1.5 font-medium">Task</th>
                        <th className="px-2 py-1.5 font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.queue.events.map((ev) => (
                        <tr
                          key={ev.id}
                          className="border-t border-[var(--border)]"
                        >
                          <td className="whitespace-nowrap px-2 py-1.5 text-[var(--text-muted)]">
                            {new Date(ev.created_at).toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5">
                            {ev.event_name ?? "—"}
                          </td>
                          <td className="px-2 py-1.5">
                            {ev.status}
                            {ev.locked_at ? " · locked" : ""}
                            {ev.attempts > 0 ? ` · ×${ev.attempts}` : ""}
                          </td>
                          <td className="px-2 py-1.5 font-mono">
                            {ev.task_id ?? "—"}
                          </td>
                          <td className="max-w-[14rem] truncate px-2 py-1.5 text-[var(--status-over)]">
                            {ev.last_error ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}
