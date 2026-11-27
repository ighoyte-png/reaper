"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Modal, inputClass } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { isAdmin } from "@/lib/auth/roles";
import { useSeatEntitlements } from "@/lib/hooks/use-seat-entitlements";
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
  const {
    entitlements,
    atLimit,
    overLimit,
    limited,
    refresh: refreshSeats,
  } = useSeatEntitlements();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const [seatModalOpen, setSeatModalOpen] = useState(false);

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
    await refreshSeats();
  }, [refreshSeats]);

  useEffect(() => {
    if (!canManage) return;
    void refresh();
  }, [canManage, refresh]);

  if (!canManage) return null;

  async function invite() {
    if (atLimit) {
      setSeatModalOpen(true);
      return;
    }
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
        code?: string;
        actionLink?: string;
      };
      if (!res.ok) {
        if (body.code === "seat_limit") {
          setSeatModalOpen(true);
          await refreshSeats();
        }
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
      {limited && entitlements ? (
        <p
          className={
            atLimit
              ? "mt-2 text-xs font-medium text-[var(--status-over)]"
              : "mt-2 text-xs text-[var(--text-muted)]"
          }
        >
          Seats: {entitlements.seatUsed}/{entitlements.seatLimit}
          {overLimit
            ? " — over limit"
            : atLimit
              ? " — full"
              : entitlements.seatsRemaining != null
                ? ` · ${entitlements.seatsRemaining} remaining`
                : ""}
          . Pending invites count toward the limit.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Email">
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            disabled={atLimit}
          />
        </Field>
        <Field label="Name (optional)">
          <input
            className={inputClass}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={atLimit}
          />
        </Field>
        <Field label="Role">
          <Select
            value={role}
            onChange={(v) => setRole(v as Role)}
            options={roleOptions}
            disabled={atLimit}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Button
          variant="primary"
          size="sm"
          disabled={busy || !email.includes("@") || atLimit}
          onClick={() => void invite()}
        >
          Send invite
        </Button>
        {atLimit ? (
          <button
            type="button"
            className="ml-3 text-xs font-medium text-[var(--status-over)] underline-offset-2 hover:underline"
            onClick={() => setSeatModalOpen(true)}
          >
            Why can’t I invite?
          </button>
        ) : null}
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

      {seatModalOpen ? (
        <Modal title="Seat limit reached" onClose={() => setSeatModalOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              This workspace
              {entitlements?.seatLimit != null
                ? ` is using ${entitlements.seatUsed} of ${entitlements.seatLimit} seats`
                : " has no seats left"}
              . Members and pending invites both count.
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              Free a seat by revoking a pending invite or removing a member, or
              ask a platform administrator to raise the limit.
            </p>
            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => setSeatModalOpen(false)}
              >
                Got it
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Panel>
  );
}
