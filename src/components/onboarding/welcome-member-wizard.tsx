"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, Modal } from "@/components/ui/form";
import { useToast } from "@/components/toast/toast-provider";
import { useData } from "@/lib/data/store";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  readOnboardingFlags,
  writeOnboardingFlags,
} from "@/lib/onboarding-prefs";

/**
 * First-login welcome for members (non-managers). Dismissible; stays gone.
 */
export function WelcomeMemberWizard() {
  const { ready, canManage, profile, myPerson, state, mode, refresh } =
    useData();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  const orgId = state.organization.id;
  const profileId = profile?.id;

  useEffect(() => {
    if (!ready || mode !== "supabase" || canManage || !profileId || !orgId) {
      setOpen(false);
      return;
    }
    const approval = state.organization.approval_status ?? "approved";
    if (approval !== "approved" || state.organization.disabled_at) {
      setOpen(false);
      return;
    }
    const flags = readOnboardingFlags(profileId, orgId);
    if (flags.welcomeDismissed) {
      setOpen(false);
      return;
    }
    setDisplayName(
      profile?.full_name?.trim() ||
        myPerson?.name?.trim() ||
        profile?.email?.split("@")[0] ||
        "",
    );
    setOpen(true);
  }, [
    ready,
    mode,
    canManage,
    profileId,
    orgId,
    profile?.full_name,
    profile?.email,
    myPerson?.name,
    state.organization.approval_status,
    state.organization.disabled_at,
  ]);

  function dismiss() {
    if (!profileId || !orgId) return;
    writeOnboardingFlags(profileId, orgId, { welcomeDismissed: true });
    setOpen(false);
  }

  async function finish() {
    const name = displayName.trim();
    if (!name || !profileId) {
      dismiss();
      return;
    }
    setBusy(true);
    try {
      if (
        mode === "supabase" &&
        isSupabaseConfigured() &&
        name !== (profile?.full_name ?? "").trim()
      ) {
        const client = createClient();
        const { error } = await client
          .from("profiles")
          .update({ full_name: name })
          .eq("id", profileId);
        if (error) {
          push(error.message, "warning");
          return;
        }
        if (myPerson?.id) {
          await client
            .from("people")
            .update({ name })
            .eq("id", myPerson.id)
            .eq("organization_id", orgId);
        }
        await refresh();
      }
      dismiss();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const roleLabel =
    profile?.role === "admin"
      ? "Admin"
      : profile?.role === "manager"
        ? "Manager"
        : "Member";

  return (
    <Modal
      title={`Welcome to ${state.organization.name || "Reaper"}`}
      onClose={dismiss}
      className="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          You’re in as a <span className="text-[var(--text)]">{roleLabel}</span>.
          Confirm how your name should appear, then jump in.
        </p>
        <Field label="Display name">
          <input
            className={inputClass}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoFocus
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            className="text-xs text-[var(--text-muted)] underline-offset-2 hover:underline"
            onClick={dismiss}
          >
            Skip
          </button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !displayName.trim()}
            onClick={() => void finish()}
          >
            {busy ? "Saving…" : "Get started"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
