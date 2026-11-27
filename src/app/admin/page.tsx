"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AboutDialog } from "@/components/brand/about-dialog";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Modal, ConfirmDialog, inputClass } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { loginPathWithNext } from "@/lib/paths";
import { cn } from "@/lib/cn";

type AdminTab = "accounts" | "registration" | "operators" | "uploads";

function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "muted";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize",
        tone === "ok" &&
          "bg-[color-mix(in_srgb,var(--status-healthy)_16%,transparent)] text-[var(--status-healthy)]",
        tone === "warn" &&
          "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]",
        tone === "bad" &&
          "bg-[color-mix(in_srgb,var(--status-over)_16%,transparent)] text-[var(--status-over)]",
        tone === "muted" && "bg-[var(--row-hover)] text-[var(--text-muted)]",
      )}
    >
      {children}
    </span>
  );
}

type AccountRow = {
  id: string;
  name: string;
  slug: string;
  disabled_at: string | null;
  created_at: string | null;
  member_count: number;
  project_count: number;
  plan_key: string;
  billing_status: string;
  seat_limit: number | null;
  approval_status?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
};

type OperatorRow = {
  user_id: string;
  email: string;
  created_at: string;
};

type AddonRow = { addon_key: string; allowed: boolean };

type AccountDetail = {
  account: AccountRow & { owner_user_id?: string | null };
  entitlements: {
    planKey: string;
    status: string;
    seatLimit: number | null;
    seatUsed: number;
  };
  addons?: AddonRow[];
  members: {
    user_id: string;
    email: string;
    full_name: string;
    role: string;
    is_owner: boolean;
  }[];
  invites: {
    id: string;
    email: string;
    role: string;
    accepted_at: string | null;
    revoked_at: string | null;
    expires_at: string;
  }[];
  audit: {
    id: string;
    actor_email: string | null;
    action: string;
    created_at: string;
  }[];
};

export default function PlatformAdminPage() {
  const { ready, isAuthenticated, logout, state } = useData();
  const router = useRouter();
  const { push } = useToast();
  useDocumentTitle("Platform");

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [denyReason, setDenyReason] = useState<string | null>(null);
  const [allowSignup, setAllowSignup] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  const [defaultAddons, setDefaultAddons] = useState<string[]>([]);
  const [maxImageMb, setMaxImageMb] = useState(10);
  const [maxDocumentMb, setMaxDocumentMb] = useState(25);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<AccountRow | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null);
  const [deleteSlug, setDeleteSlug] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createOwnerEmail, setCreateOwnerEmail] = useState("");
  const [createOwnerName, setCreateOwnerName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [operatorEmail, setOperatorEmail] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [detailAddons, setDetailAddons] = useState<AddonRow[]>([]);
  const [planKey, setPlanKey] = useState("free");
  const [billingStatus, setBillingStatus] = useState("none");
  const [seatLimit, setSeatLimit] = useState("");
  const [rejectTarget, setRejectTarget] = useState<AccountRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [tab, setTab] = useState<AdminTab>("accounts");
  const pendingCount = accounts.filter(
    (a) => a.approval_status === "pending",
  ).length;

  const tabs: { id: AdminTab; label: string; badge?: number }[] = [
    {
      id: "accounts",
      label: "Accounts",
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    { id: "registration", label: "Registration" },
    { id: "operators", label: "Operators" },
    { id: "uploads", label: "Uploads" },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch("/api/platform/me", { method: "POST" });
      if (meRes.status === 403 || meRes.status === 401) {
        const body = (await meRes.json().catch(() => ({}))) as {
          error?: string;
        };
        setDenyReason(body.error ?? "You don't have platform admin access.");
        setAllowed(false);
        return;
      }
      if (!meRes.ok) {
        const body = (await meRes.json().catch(() => ({}))) as {
          error?: string;
        };
        push(body.error ?? "Platform admin unavailable", "warning");
        setDenyReason(body.error ?? "Platform admin unavailable");
        setAllowed(false);
        return;
      }
      setDenyReason(null);
      setAllowed(true);

      const [settingsRes, listRes, opsRes] = await Promise.all([
        fetch("/api/platform/settings"),
        fetch("/api/platform/accounts"),
        fetch("/api/platform/operators"),
      ]);
      if (settingsRes.ok) {
        const s = (await settingsRes.json()) as {
          allow_workspace_signup?: boolean;
          require_account_approval?: boolean;
          default_allowed_addons?: string[];
          max_image_bytes?: number;
          max_document_bytes?: number;
        };
        setAllowSignup(Boolean(s.allow_workspace_signup));
        setRequireApproval(Boolean(s.require_account_approval));
        setDefaultAddons(
          Array.isArray(s.default_allowed_addons)
            ? s.default_allowed_addons
            : [],
        );
        if (typeof s.max_image_bytes === "number" && s.max_image_bytes > 0) {
          setMaxImageMb(Math.round(s.max_image_bytes / (1024 * 1024)));
        }
        if (
          typeof s.max_document_bytes === "number" &&
          s.max_document_bytes > 0
        ) {
          setMaxDocumentMb(Math.round(s.max_document_bytes / (1024 * 1024)));
        }
      }
      if (listRes.ok) {
        const body = (await listRes.json()) as { accounts?: AccountRow[] };
        setAccounts(body.accounts ?? []);
      } else {
        const body = (await listRes.json().catch(() => ({}))) as {
          error?: string;
        };
        push(body.error ?? "Could not load accounts", "warning");
      }
      if (opsRes.ok) {
        const body = (await opsRes.json()) as { operators?: OperatorRow[] };
        setOperators(body.operators ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [push]);

  const loadDetail = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/platform/accounts/${id}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        push(body.error ?? "Could not load account", "warning");
        return;
      }
      const body = (await res.json()) as AccountDetail;
      setDetail(body);
      setDetailAddons(body.addons ?? [{ addon_key: "clickup", allowed: false }]);
      setPlanKey(body.entitlements.planKey);
      setBillingStatus(body.entitlements.status);
      setSeatLimit(
        body.entitlements.seatLimit == null
          ? ""
          : String(body.entitlements.seatLimit),
      );
    },
    [push],
  );

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace(loginPathWithNext("/admin"));
      return;
    }
    void load();
  }, [ready, isAuthenticated, router, load]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    void loadDetail(detailId);
  }, [detailId, loadDetail]);

  async function saveStorageLimits() {
    const res = await fetch("/api/platform/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        max_image_bytes: Math.round(maxImageMb * 1024 * 1024),
        max_document_bytes: Math.round(maxDocumentMb * 1024 * 1024),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      push(body.error ?? "Could not update storage limits", "warning");
      return;
    }
    push("Storage limits updated");
  }

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
        ? "Public registration enabled"
        : "Public registration disabled",
    );
  }

  async function toggleRequireApproval(next: boolean) {
    setRequireApproval(next);
    const res = await fetch("/api/platform/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ require_account_approval: next }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      push(body.error ?? "Could not update setting", "warning");
      setRequireApproval(!next);
      return;
    }
    push(next ? "Account approval required" : "Accounts auto-approved");
  }

  async function toggleDefaultAddon(key: string, next: boolean) {
    const updated = next
      ? [...new Set([...defaultAddons, key])]
      : defaultAddons.filter((k) => k !== key);
    setDefaultAddons(updated);
    const res = await fetch("/api/platform/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_allowed_addons: updated }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      push(body.error ?? "Could not update default addons", "warning");
      setDefaultAddons(defaultAddons);
      return;
    }
    push("Default addons updated");
  }

  async function approveAccountRow(row: AccountRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/platform/accounts/${row.id}/approve`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        push(body.error ?? "Approve failed", "warning");
        return;
      }
      push(`Approved ${row.name}`);
      await load();
      if (detailId === row.id) await loadDetail(row.id);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    try {
      const res = await fetch(
        `/api/platform/accounts/${rejectTarget.id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        push(body.error ?? "Reject failed", "warning");
        return;
      }
      push(`Rejected ${rejectTarget.name}`);
      setRejectTarget(null);
      setRejectReason("");
      await load();
      if (detailId === rejectTarget.id) await loadDetail(rejectTarget.id);
    } finally {
      setBusyId(null);
    }
  }

  async function saveDetailAddons() {
    if (!detailId) return;
    const res = await fetch(`/api/platform/accounts/${detailId}/addons`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addons: detailAddons }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      push(body.error ?? "Could not update addons", "warning");
      return;
    }
    const body = (await res.json()) as { addons?: AddonRow[] };
    setDetailAddons(body.addons ?? detailAddons);
    push("Addon allowlist saved");
  }

  async function enterAccount(row: AccountRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/platform/accounts/${row.id}/enter`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        account?: { slug?: string };
        workspace?: { slug?: string };
      };
      if (!res.ok) {
        push(body.error ?? "Could not enter account", "warning");
        return;
      }
      const slug = body.account?.slug || body.workspace?.slug || row.slug;
      window.location.href = `/${slug}/dashboard`;
    } finally {
      setBusyId(null);
    }
  }

  async function setDisabled(row: AccountRow, disabled: boolean) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/platform/accounts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        push(body.error ?? "Could not update account", "warning");
        return;
      }
      push(disabled ? "Account disabled" : "Account enabled");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function saveRename() {
    if (!renameTarget || !renameName.trim()) return;
    setBusyId(renameTarget.id);
    try {
      const res = await fetch(`/api/platform/accounts/${renameTarget.id}`, {
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
      push("Account renamed");
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
      const res = await fetch(`/api/platform/accounts/${deleteTarget.id}`, {
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
      push("Account deleted");
      setDeleteTarget(null);
      setDeleteSlug("");
      if (detailId === deleteTarget.id) setDetailId(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function createAccount() {
    setCreateBusy(true);
    try {
      const res = await fetch("/api/platform/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          ownerEmail: createOwnerEmail.trim(),
          ownerName: createOwnerName.trim() || undefined,
          delivery: "email",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        organization?: { name?: string };
      };
      if (!res.ok) {
        push(body.error ?? "Could not create account", "warning");
        return;
      }
      push(`Account “${body.organization?.name ?? createName}” created`);
      setCreateOpen(false);
      setCreateName("");
      setCreateOwnerEmail("");
      setCreateOwnerName("");
      await load();
    } finally {
      setCreateBusy(false);
    }
  }

  async function grantOperator() {
    const res = await fetch("/api/platform/operators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: operatorEmail.trim() }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      push(body.error ?? "Could not grant operator", "warning");
      return;
    }
    push("Platform operator granted");
    setOperatorEmail("");
    await load();
  }

  async function revokeOperator(userId: string) {
    const res = await fetch("/api/platform/operators", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      push(body.error ?? "Could not revoke", "warning");
      return;
    }
    push("Operator revoked");
    await load();
  }

  async function saveBilling() {
    if (!detailId) return;
    const res = await fetch(`/api/platform/accounts/${detailId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_key: planKey.trim() || "free",
        billing_status: billingStatus,
        seat_limit: seatLimit.trim() === "" ? null : Number(seatLimit),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      push(body.error ?? "Could not update billing fields", "warning");
      return;
    }
    push("Billing fields updated");
    await loadDetail(detailId);
    await load();
  }

  if (!ready || allowed === null) {
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
        {denyReason ? (
          <p className="max-w-md text-xs leading-relaxed text-[var(--text-muted)]">
            {denyReason}
          </p>
        ) : null}
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
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--page-bg)] text-[var(--text)]">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-3">
        <button
          type="button"
          className="inline-flex shrink-0 cursor-pointer items-center rounded-md py-1 hover:bg-[var(--row-hover)]"
          aria-label="About Reaper"
          title="About Reaper"
          onClick={() => setAboutOpen(true)}
        >
          <BrandLockup showVersion compact />
        </button>
        <span className="text-sm font-semibold tracking-tight">Platform</span>
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-3 sm:flex-row sm:items-start sm:gap-0 sm:py-5">
          <nav
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border)] pb-2 sm:w-44 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3"
            aria-label="Platform sections"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "cursor-pointer rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors",
                  tab === item.id
                    ? "bg-[var(--row-hover)] font-medium text-[var(--text)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
                )}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => {
                  setTab(item.id);
                  if (item.id !== "accounts") setDetailId(null);
                }}
              >
                <span className="inline-flex items-center gap-2">
                  {item.label}
                  {item.badge != null ? (
                    <span className="rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-fg)]">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </nav>

          <main className="min-w-0 flex-1 space-y-4 sm:pl-5">
            {tab === "registration" ? (
              <Panel>
                <h2 className="text-sm font-semibold">Public registration</h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Controls <code className="text-[10px]">/register</code>. You
                  can still provision accounts from Accounts when registration
                  is off.
                </p>
                <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={allowSignup}
                    onChange={(e) => void toggleSignup(e.target.checked)}
                  />
                  Allow public registration
                </label>
                <label className="mt-2.5 flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={requireApproval}
                    onChange={(e) =>
                      void toggleRequireApproval(e.target.checked)
                    }
                  />
                  Require account approval
                </label>
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Default allowed addons
                  </h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Applied on approve and platform provision.
                  </p>
                  <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm">
                    <Checkbox
                      checked={defaultAddons.includes("clickup")}
                      onChange={(e) =>
                        void toggleDefaultAddon("clickup", e.target.checked)
                      }
                    />
                    ClickUp
                  </label>
                </div>
              </Panel>
            ) : null}

            {tab === "uploads" ? (
              <Panel>
                <h2 className="text-sm font-semibold">Upload size limits</h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Applies to avatar and document uploads across all accounts.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Max image size (MB)">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      className={inputClass}
                      value={maxImageMb}
                      onChange={(e) =>
                        setMaxImageMb(Number(e.target.value) || 1)
                      }
                    />
                  </Field>
                  <Field label="Max document size (MB)">
                    <input
                      type="number"
                      min={1}
                      max={200}
                      className={inputClass}
                      value={maxDocumentMb}
                      onChange={(e) =>
                        setMaxDocumentMb(Number(e.target.value) || 1)
                      }
                    />
                  </Field>
                </div>
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void saveStorageLimits()}
                  >
                    Save limits
                  </Button>
                </div>
              </Panel>
            ) : null}

            {tab === "operators" ? (
              <Panel>
                <h2 className="text-sm font-semibold">Platform operators</h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Grant console access in-app (sets Auth app_metadata). Env{" "}
                  <code className="text-[10px]">PLATFORM_ADMIN_EMAILS</code>{" "}
                  remains break-glass.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <input
                    className={cn(inputClass, "max-w-xs")}
                    placeholder="ops@example.com"
                    value={operatorEmail}
                    onChange={(e) => setOperatorEmail(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!operatorEmail.includes("@")}
                    onClick={() => void grantOperator()}
                  >
                    Grant
                  </Button>
                </div>
                {operators.length > 0 ? (
                  <ul className="mt-4 divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
                    {operators.map((op) => (
                      <li
                        key={op.user_id}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                      >
                        <span>{op.email}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void revokeOperator(op.user_id)}
                        >
                          Revoke
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    No in-app operators yet.
                  </p>
                )}
              </Panel>
            ) : null}

            {tab === "accounts" ? (
              <>
                {pendingCount > 0 ? (
                  <Panel>
                    <h2 className="text-sm font-semibold">Pending approval</h2>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Public registrations waiting for review.
                    </p>
                    <ul className="mt-3 space-y-2">
                      {accounts
                        .filter((a) => a.approval_status === "pending")
                        .map((row) => (
                          <li
                            key={row.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2.5 text-sm"
                          >
                            <div className="min-w-0">
                              <button
                                type="button"
                                className="font-medium hover:underline"
                                onClick={() => setDetailId(row.id)}
                              >
                                {row.name}
                              </button>
                              <div className="font-mono text-xs text-[var(--text-muted)]">
                                /{row.slug}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={busyId === row.id}
                                onClick={() => void approveAccountRow(row)}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="destructiveOutline"
                                size="sm"
                                disabled={busyId === row.id}
                                onClick={() => {
                                  setRejectTarget(row);
                                  setRejectReason("");
                                }}
                              >
                                Reject
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busyId === row.id}
                                onClick={() => void enterAccount(row)}
                              >
                                Enter
                              </Button>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </Panel>
                ) : null}

                <Panel padded={false}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold">Accounts</h2>
                      <p className="text-xs text-[var(--text-muted)]">
                        {loading
                          ? "Loading…"
                          : `${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void load()}
                        disabled={loading}
                      >
                        Refresh
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setCreateOpen(true)}
                      >
                        Create account
                      </Button>
                    </div>
                  </div>

                  {loading ? (
                    <p className="px-4 py-6 text-sm text-[var(--text-muted)]">
                      Loading…
                    </p>
                  ) : accounts.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-[var(--text-muted)]">
                      No accounts yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs text-[var(--text-muted)]">
                          <tr className="border-b border-[var(--border)]">
                            <th className="px-4 py-2 font-medium">Name</th>
                            <th className="px-4 py-2 font-medium">Plan</th>
                            <th className="px-4 py-2 font-medium">Status</th>
                            <th className="px-4 py-2 font-medium">Size</th>
                            <th className="px-4 py-2 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accounts.map((row) => {
                            const disabled = Boolean(row.disabled_at);
                            const busy = busyId === row.id;
                            const approval = row.approval_status ?? "approved";
                            const selected = detailId === row.id;
                            return (
                              <tr
                                key={row.id}
                                className={cn(
                                  "border-b border-[var(--border)] last:border-b-0",
                                  selected && "bg-[var(--row-hover)]",
                                )}
                              >
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    className="cursor-pointer text-left font-medium hover:underline"
                                    onClick={() => setDetailId(row.id)}
                                  >
                                    {row.name}
                                  </button>
                                  <div className="font-mono text-xs text-[var(--text-muted)]">
                                    /{row.slug}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                                  {row.plan_key} · {row.billing_status}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-1">
                                    <StatusPill
                                      tone={disabled ? "bad" : "ok"}
                                    >
                                      {disabled ? "Disabled" : "Active"}
                                    </StatusPill>
                                    {approval !== "approved" ? (
                                      <StatusPill
                                        tone={
                                          approval === "pending"
                                            ? "warn"
                                            : "bad"
                                        }
                                      >
                                        {approval}
                                      </StatusPill>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                                  {row.member_count} members ·{" "}
                                  {row.project_count} projects
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-1">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => void enterAccount(row)}
                                    >
                                      Enter
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => setDetailId(row.id)}
                                    >
                                      Detail
                                    </Button>
                                    {approval === "pending" ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={busy}
                                        onClick={() =>
                                          void approveAccountRow(row)
                                        }
                                      >
                                        Approve
                                      </Button>
                                    ) : null}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => {
                                        setRenameTarget(row);
                                        setRenameName(row.name);
                                      }}
                                    >
                                      Rename
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() =>
                                        void setDisabled(row, !disabled)
                                      }
                                    >
                                      {disabled ? "Enable" : "Disable"}
                                    </Button>
                                    <Button
                                      variant="destructiveOutline"
                                      size="sm"
                                      disabled={busy}
                                      onClick={() => {
                                        setDeleteTarget(row);
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

                {detail && detailId ? (
                  <Panel>
                    <div className="mb-4 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold">
                          {detail.account.name}
                        </h2>
                        <p className="font-mono text-xs text-[var(--text-muted)]">
                          /{detail.account.slug}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <StatusPill
                            tone={
                              (detail.account.approval_status ??
                                "approved") === "approved"
                                ? "ok"
                                : (detail.account.approval_status ??
                                      "approved") === "pending"
                                  ? "warn"
                                  : "bad"
                            }
                          >
                            {detail.account.approval_status ?? "approved"}
                          </StatusPill>
                          {detail.account.rejection_reason ? (
                            <span className="text-xs text-[var(--text-muted)]">
                              {detail.account.rejection_reason}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailId(null)}
                      >
                        Close
                      </Button>
                    </div>

                    {(detail.account.approval_status ?? "approved") ===
                    "pending" ? (
                      <div className="mb-4 flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={busyId === detail.account.id}
                          onClick={() => void approveAccountRow(detail.account)}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="destructiveOutline"
                          size="sm"
                          disabled={busyId === detail.account.id}
                          onClick={() => {
                            setRejectTarget(detail.account);
                            setRejectReason("");
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          Allowed addons
                        </h3>
                        <div className="mt-2 space-y-2">
                          {detailAddons.map((addon) => (
                            <label
                              key={addon.addon_key}
                              className="flex cursor-pointer items-center gap-2.5 text-sm"
                            >
                              <Checkbox
                                checked={addon.allowed}
                                onChange={(e) =>
                                  setDetailAddons((prev) =>
                                    prev.map((a) =>
                                      a.addon_key === addon.addon_key
                                        ? {
                                            ...a,
                                            allowed: e.target.checked,
                                          }
                                        : a,
                                    ),
                                  )
                                }
                              />
                              <span className="capitalize">
                                {addon.addon_key}
                              </span>
                            </label>
                          ))}
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-3"
                          onClick={() => void saveDetailAddons()}
                        >
                          Save addons
                        </Button>
                      </div>

                      <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] p-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          Billing
                        </h3>
                        <div className="mt-2 grid gap-3">
                          <Field label="Plan key">
                            <input
                              className={inputClass}
                              value={planKey}
                              onChange={(e) => setPlanKey(e.target.value)}
                            />
                          </Field>
                          <Field label="Billing status">
                            <select
                              className={inputClass}
                              value={billingStatus}
                              onChange={(e) => setBillingStatus(e.target.value)}
                            >
                              <option value="none">none</option>
                              <option value="trialing">trialing</option>
                              <option value="active">active</option>
                              <option value="past_due">past_due</option>
                              <option value="canceled">canceled</option>
                            </select>
                          </Field>
                          <Field label="Seat limit (blank = unlimited)">
                            <input
                              className={inputClass}
                              inputMode="numeric"
                              value={seatLimit}
                              onChange={(e) => setSeatLimit(e.target.value)}
                            />
                          </Field>
                        </div>
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          Seats used: {detail.entitlements.seatUsed}
                          {detail.entitlements.seatLimit != null
                            ? ` / ${detail.entitlements.seatLimit}`
                            : " (unlimited)"}
                          . Counts active members + pending invites. At the
                          limit, the workspace shows a top banner and blocks new
                          invites.
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-3"
                          onClick={() => void saveBilling()}
                        >
                          Save billing fields
                        </Button>
                      </div>
                    </div>

                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Members
                    </h3>
                    <ul className="mt-2 divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
                      {detail.members.map((m) => (
                        <li key={m.user_id} className="px-3 py-2 text-sm">
                          {m.full_name || m.email}{" "}
                          <span className="text-xs text-[var(--text-muted)]">
                            {m.email} · {m.role}
                            {m.is_owner ? " · owner" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Pending invites
                    </h3>
                    {detail.invites.filter(
                      (i) => !i.accepted_at && !i.revoked_at,
                    ).length === 0 ? (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        None
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm">
                        {detail.invites
                          .filter((i) => !i.accepted_at && !i.revoked_at)
                          .map((i) => (
                            <li key={i.id}>
                              {i.email} · {i.role}
                            </li>
                          ))}
                      </ul>
                    )}

                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Recent audit
                    </h3>
                    {detail.audit.length === 0 ? (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        None
                      </p>
                    ) : (
                      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] p-2 text-xs text-[var(--text-muted)]">
                        {detail.audit.map((a) => (
                          <li key={a.id}>
                            {new Date(a.created_at).toLocaleString()} —{" "}
                            {a.action}
                            {a.actor_email ? ` (${a.actor_email})` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                ) : null}
              </>
            ) : null}
          </main>
        </div>
      </div>

      {createOpen ? (
        <Modal title="Create account" onClose={() => setCreateOpen(false)}>
          <div className="space-y-3">
            <Field label="Account name">
              <input
                className={inputClass}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Owner email">
              <input
                className={inputClass}
                type="email"
                value={createOwnerEmail}
                onChange={(e) => setCreateOwnerEmail(e.target.value)}
              />
            </Field>
            <Field label="Owner name (optional)">
              <input
                className={inputClass}
                value={createOwnerName}
                onChange={(e) => setCreateOwnerName(e.target.value)}
              />
            </Field>
            <p className="text-xs text-[var(--text-muted)]">
              Creates the organization, owner membership, People row, and sends
              an Auth invite email.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={
                  createBusy ||
                  !createName.trim() ||
                  !createOwnerEmail.includes("@")
                }
                onClick={() => void createAccount()}
              >
                Create
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {rejectTarget ? (
        <Modal
          title="Reject account?"
          onClose={() => {
            setRejectTarget(null);
            setRejectReason("");
          }}
        >
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              Reject “{rejectTarget.name}”. The owner will see a rejected
              screen.
            </p>
            <Field label="Reason (optional)">
              <input
                className={inputClass}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                autoFocus
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructiveOutline"
                disabled={busyId === rejectTarget.id}
                onClick={() => void confirmReject()}
              >
                Reject
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {renameTarget ? (
        <Modal title="Rename account" onClose={() => setRenameTarget(null)}>
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
          title="Delete account?"
          message={`Permanently delete “${deleteTarget.name}” and all of its data. Type the slug “${deleteTarget.slug}” to confirm.`}
          confirmLabel="Delete account"
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
          <Field label="Account slug" className="mt-3">
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
