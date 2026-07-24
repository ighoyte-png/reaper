"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AboutDialog } from "@/components/brand/about-dialog";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Field, Modal, ConfirmDialog, inputClass } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { loginPathWithNext } from "@/lib/paths";
import { cn } from "@/lib/cn";

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  disabled_at: string | null;
  created_at: string | null;
  member_count: number;
  project_count: number;
};

export default function PlatformAdminPage() {
  const { ready, isAuthenticated, logout, state } = useData();
  const router = useRouter();
  const { push } = useToast();
  useDocumentTitle("Platform");

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [allowSignup, setAllowSignup] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<WorkspaceRow | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceRow | null>(null);
  const [deleteSlug, setDeleteSlug] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch("/api/platform/me", { method: "POST" });
      if (meRes.status === 403 || meRes.status === 401) {
        setAllowed(false);
        return;
      }
      if (!meRes.ok) {
        const body = (await meRes.json().catch(() => ({}))) as {
          error?: string;
        };
        push(body.error ?? "Platform admin unavailable", "warning");
        setAllowed(false);
        return;
      }
      setAllowed(true);

      const [settingsRes, listRes] = await Promise.all([
        fetch("/api/platform/settings"),
        fetch("/api/platform/workspaces"),
      ]);
      if (settingsRes.ok) {
        const s = (await settingsRes.json()) as {
          allow_workspace_signup?: boolean;
        };
        setAllowSignup(Boolean(s.allow_workspace_signup));
      }
      if (listRes.ok) {
        const body = (await listRes.json()) as { workspaces?: WorkspaceRow[] };
        setWorkspaces(body.workspaces ?? []);
      } else {
        const body = (await listRes.json().catch(() => ({}))) as {
          error?: string;
        };
        push(body.error ?? "Could not load workspaces", "warning");
      }
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace(loginPathWithNext("/admin"));
      return;
    }
    void load();
  }, [ready, isAuthenticated, router, load]);

  async function toggleSignup(next: boolean) {
    setAllowSignup(next);
    const res = await fetch("/api/platform/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allow_workspace_signup: next }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      push(body.error ?? "Could not update setting", "warning");
      setAllowSignup(!next);
      return;
    }
    push(
      next
        ? "New workspace creation enabled"
        : "New workspace creation disabled",
    );
  }

  async function enterWorkspace(ws: WorkspaceRow) {
    setBusyId(ws.id);
    try {
      const res = await fetch(`/api/platform/workspaces/${ws.id}/enter`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        workspace?: { slug?: string };
      };
      if (!res.ok) {
        push(body.error ?? "Could not enter workspace", "warning");
        return;
      }
      const slug = body.workspace?.slug || ws.slug;
      window.location.href = `/${slug}/dashboard`;
    } finally {
      setBusyId(null);
    }
  }

  async function setDisabled(ws: WorkspaceRow, disabled: boolean) {
    setBusyId(ws.id);
    try {
      const res = await fetch(`/api/platform/workspaces/${ws.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        push(body.error ?? "Could not update workspace", "warning");
        return;
      }
      push(disabled ? "Workspace disabled" : "Workspace enabled");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function saveRename() {
    if (!renameTarget || !renameName.trim()) return;
    setBusyId(renameTarget.id);
    try {
      const res = await fetch(`/api/platform/workspaces/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameName.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        push(body.error ?? "Could not rename", "warning");
        return;
      }
      push("Workspace renamed");
      setRenameTarget(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      const res = await fetch(`/api/platform/workspaces/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmSlug: deleteSlug.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        push(body.error ?? "Could not delete", "warning");
        return;
      }
      push("Workspace deleted");
      setDeleteTarget(null);
      setDeleteSlug("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!ready || allowed === null || (isAuthenticated && loading && allowed === null)) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting…
      </div>
    );
  }

  if (allowed === false) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          You don&apos;t have platform admin access.
        </p>
        <Link
          href={
            state.organization.slug
              ? `/${state.organization.slug}/dashboard`
              : "/login"
          }
          className="text-sm text-[var(--accent)] hover:underline"
        >
          Back
        </Link>
      </div>
    );
  }

  const homeHref = state.organization.slug
    ? `/${state.organization.slug}/dashboard`
    : null;

  return (
    <div className="min-h-dvh bg-[var(--page-bg)] text-[var(--text)]">
      <header className="flex h-11 items-center gap-3 border-b border-[var(--border)] bg-[var(--sidebar)] px-3">
        <button
          type="button"
          className="inline-flex shrink-0 cursor-pointer items-center rounded-md py-1 hover:bg-[var(--row-hover)]"
          aria-label="About Reaper"
          title="About Reaper"
          onClick={() => setAboutOpen(true)}
        >
          <BrandLockup showVersion compact />
        </button>
        <span className="text-sm font-medium">Platform</span>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {homeHref ? (
            <Link
              href={homeHref}
              className="rounded-md px-2.5 py-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            >
              Workspace
            </Link>
          ) : (
            <span className="px-2.5 py-1.5 text-xs text-[var(--text-muted)]">
              Platform-only
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
        <Panel>
          <h1 className="text-sm font-semibold">Workspace creation</h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            When off, the login page hides Create workspace and bootstrap
            refuses new orgs.
          </p>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={allowSignup}
              onChange={(e) => void toggleSignup(e.target.checked)}
            />
            Allow new workspace creation
          </label>
        </Panel>

        <Panel>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Workspaces</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading…</p>
          ) : workspaces.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No workspaces yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-[var(--border)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Slug</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Size</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {workspaces.map((ws) => {
                    const disabled = Boolean(ws.disabled_at);
                    const busy = busyId === ws.id;
                    return (
                      <tr
                        key={ws.id}
                        className="border-t border-[var(--border)]"
                      >
                        <td className="px-3 py-2.5 font-medium">{ws.name}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-[var(--text-muted)]">
                          /{ws.slug}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={cn(
                              "text-xs font-medium",
                              disabled
                                ? "text-[var(--status-over)]"
                                : "text-[var(--status-healthy)]",
                            )}
                          >
                            {disabled ? "Disabled" : "Active"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-[var(--text-muted)]">
                          {ws.member_count} members · {ws.project_count}{" "}
                          projects
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() => void enterWorkspace(ws)}
                            >
                              Enter
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                setRenameTarget(ws);
                                setRenameName(ws.name);
                              }}
                            >
                              Rename
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void setDisabled(ws, !disabled)
                              }
                            >
                              {disabled ? "Enable" : "Disable"}
                            </Button>
                            <Button
                              variant="destructiveOutline"
                              size="sm"
                              disabled={busy}
                              onClick={() => {
                                setDeleteTarget(ws);
                                setDeleteSlug("");
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </main>

      {renameTarget ? (
        <Modal
          title="Rename workspace"
          onClose={() => setRenameTarget(null)}
        >
          <div className="space-y-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                maxLength={120}
                autoFocus
              />
            </Field>
            <p className="text-xs text-[var(--text-muted)]">
              Does not change the URL slug.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={
                  !renameName.trim() ||
                  renameName.trim() === renameTarget.name ||
                  busyId === renameTarget.id
                }
                onClick={() => void saveRename()}
              >
                Save
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete workspace?"
          message={`Permanently delete “${deleteTarget.name}” and all of its data. Type the slug “${deleteTarget.slug}” to confirm.`}
          confirmLabel="Delete workspace"
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteSlug("");
          }}
          onConfirm={() => void confirmDelete()}
          confirmDisabled={
            deleteSlug.trim() !== deleteTarget.slug ||
            busyId === deleteTarget.id
          }
        >
          <Field label="Workspace slug" className="mt-3">
            <input
              className={inputClass}
              value={deleteSlug}
              onChange={(e) => setDeleteSlug(e.target.value)}
              placeholder={deleteTarget.slug}
              autoFocus
              spellCheck={false}
            />
          </Field>
        </ConfirmDialog>
      ) : null}
      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
    </div>
  );
}
