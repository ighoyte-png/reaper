"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, Modal } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { isAdmin } from "@/lib/auth/roles";
import {
  readOnboardingFlags,
  writeOnboardingFlags,
} from "@/lib/onboarding-prefs";
import type { Role } from "@/lib/types";

type Draft = { email: string; name: string; role: Role };

/**
 * Shown to admins/managers after login until they dismiss or finish inviting.
 */
export function InviteTeamWizard() {
  const { ready, canManage, profile, state, mode } = useData();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);

  const orgId = state.organization.id;
  const profileId = profile?.id;

  useEffect(() => {
    if (!ready || mode !== "supabase" || !canManage || !profileId || !orgId) {
      setOpen(false);
      return;
    }
    const approval = state.organization.approval_status ?? "approved";
    if (approval !== "approved" || state.organization.disabled_at) {
      setOpen(false);
      return;
    }
    const flags = readOnboardingFlags(profileId, orgId);
    setOpen(!flags.inviteTeamDismissed);
  }, [
    ready,
    mode,
    canManage,
    profileId,
    orgId,
    state.organization.approval_status,
    state.organization.disabled_at,
  ]);

  function dismiss() {
    if (!profileId || !orgId) return;
    writeOnboardingFlags(profileId, orgId, { inviteTeamDismissed: true });
    setOpen(false);
  }

  function addDraft() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      push("Enter a valid email", "warning");
      return;
    }
    if (drafts.some((d) => d.email === trimmed)) {
      push("Already in the list", "warning");
      return;
    }
    setDrafts((prev) => [
      ...prev,
      { email: trimmed, name: name.trim(), role },
    ]);
    setEmail("");
    setName("");
    setRole("member");
  }

  async function sendAll() {
    if (drafts.length === 0) {
      push("Add at least one email", "warning");
      return;
    }
    setBusy(true);
    let ok = 0;
    try {
      for (const draft of drafts) {
        const res = await fetch("/api/accounts/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: draft.email,
            fullName: draft.name || undefined,
            role: draft.role,
            delivery: "email",
          }),
        });
        if (res.ok) ok += 1;
        else {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          push(body.error ?? `Could not invite ${draft.email}`, "warning");
        }
      }
      if (ok > 0) {
        setSent((n) => n + ok);
        setDrafts([]);
        push(ok === 1 ? "Invite sent" : `${ok} invites sent`);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const roleOptions = [
    { value: "member", label: "Member" },
    { value: "manager", label: "Manager" },
    ...(isAdmin(profile?.role)
      ? [{ value: "admin", label: "Admin" }]
      : []),
  ];

  return (
    <Modal
      title="Invite your team"
      onClose={dismiss}
      className="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          Add people to{" "}
          <span className="font-medium text-[var(--text)]">
            {state.organization.name || "your workspace"}
          </span>
          . They’ll get an email to join.
        </p>

        <div className="grid gap-2">
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDraft();
                }
              }}
              placeholder="name@company.com"
              autoFocus
            />
          </Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Name (optional)">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
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
          <Button
            variant="secondary"
            size="sm"
            disabled={!email.includes("@")}
            onClick={addDraft}
          >
            Add to list
          </Button>
        </div>

        {drafts.length > 0 ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-[var(--border)] p-2 text-sm">
            {drafts.map((d) => (
              <li
                key={d.email}
                className="flex items-center justify-between gap-2 py-1"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.email}</div>
                  <div className="text-xs capitalize text-[var(--text-muted)]">
                    {d.role}
                    {d.name ? ` · ${d.name}` : ""}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDrafts((prev) => prev.filter((x) => x.email !== d.email))
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {sent > 0 ? (
          <p className="text-xs text-[var(--status-healthy)]">
            {sent} invite{sent === 1 ? "" : "s"} sent this session.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            className="text-xs text-[var(--text-muted)] underline-offset-2 hover:underline"
            onClick={dismiss}
          >
            Not now
          </button>
          <div className="flex gap-2">
            {sent > 0 || drafts.length === 0 ? (
              <Button variant="secondary" size="sm" onClick={dismiss}>
                Done
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="sm"
              disabled={busy || drafts.length === 0}
              onClick={() => void sendAll()}
            >
              {busy
                ? "Sending…"
                : drafts.length <= 1
                  ? "Send invite"
                  : `Send ${drafts.length} invites`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
