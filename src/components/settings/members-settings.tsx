"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { isAdmin } from "@/lib/auth/roles";
import type { Role } from "@/lib/types";

type PendingInvite = {
  id: string;
  email: string;
  role: Role;
  full_name: string | null;
  expires_at: string;
  created_at: string;
};

export function MembersSettings() {
  const { profile, canManage } = useData();
  const { push } = useToast();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/accounts/invites");
      if (!res.ok) {
        setInvites([]);
        return;
      }
      const body = (await res.json()) as { invites?: PendingInvite[] };
      setInvites(body.invites ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage) return;
    void refresh();
  }, [canManage, refresh]);

  if (!canManage) return null;

  async function invite() {
    setBusy(true);
    try {
      const res = await fetch("/api/accounts/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim() || undefined,
          role,
          delivery: "email",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        actionLink?: string;
      };
      if (!res.ok) {
        push(body.error ?? "Invite failed", "warning");
        return;
      }
      push("Invite sent");
      setEmail("");
      setFullName("");
      setRole("member");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resend(id: string) {
    const res = await fetch(`/api/accounts/invites/${id}/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delivery: "email" }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      push(body.error ?? "Resend failed", "warning");
      return;
    }
    push("Invite resent");
    await refresh();
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/accounts/invites/${id}/revoke`, {
      method: "POST",
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      push(body.error ?? "Revoke failed", "warning");
      return;
    }
    push("Invite revoked");
    await refresh();
  }

  const roleOptions = [
    { value: "member", label: "Member" },
    { value: "manager", label: "Manager" },
    ...(isAdmin(profile?.role)
      ? [{ value: "admin", label: "Admin" }]
      : []),
  ];

  return (
    <Panel>
      <h2 className="text-sm font-semibold">Members & invites</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Invite by email — they join after accepting. The login invite wizard
        covers the same flow; manage pending invites here anytime.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Email">
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
        </Field>
        <Field label="Name (optional)">
          <input
            className={inputClass}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </Field>
        <Field label="Role">
          <Select
            value={role}
            onChange={(v) => setRole(v as Role)}
            options={roleOptions}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !email.includes("@")}
          onClick={() => void invite()}
        >
          Send invite
        </Button>
      </div>

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Pending
      </h3>
      {loading ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">Loading…</p>
      ) : invites.length === 0 ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">No pending invites</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {invites.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] py-2 text-sm last:border-b-0"
            >
              <div>
                <div className="font-medium">{inv.email}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {inv.role}
                  {inv.full_name ? ` · ${inv.full_name}` : ""} · expires{" "}
                  {new Date(inv.expires_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void resend(inv.id)}
                >
                  Resend
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void revoke(inv.id)}
                >
                  Revoke
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
