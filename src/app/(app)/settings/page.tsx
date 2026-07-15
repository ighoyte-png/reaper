"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/nav/topbar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useToast } from "@/components/toast/toast-provider";
import { inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";

export default function SettingsPage() {
  const {
    state,
    profile,
    resetDemo,
    logout,
    mode,
    authError,
    canManage,
    switchDemoProfile,
    myPerson,
    changePassword,
  } = useData();
  const { push } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      push("Password updated", "success");
    } catch (err) {
      setPwError(
        err instanceof Error ? err.message : "Could not update password",
      );
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Topbar title="Settings" />
      <div className="mx-auto max-w-2xl space-y-4 p-5">
        <section className="rounded-md border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">Organization</h2>
          <p className="mt-2 text-sm">{state.organization.name || "—"}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Signed in as {profile?.full_name} ({profile?.role})
            {myPerson ? ` · linked to ${myPerson.name}` : ""} ·{" "}
            {mode === "supabase" ? "Supabase" : "Local demo"}
          </p>
        </section>

        {mode === "supabase" && (
          <section className="rounded-md border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold">Password</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Change the password for {profile?.email || "your account"}.
            </p>
            <form onSubmit={onChangePassword} className="mt-3 space-y-3">
              <label className="block text-xs text-[var(--text-muted)]">
                Current password
                <input
                  type="password"
                  required
                  className={inputClass}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                New password
                <input
                  type="password"
                  required
                  minLength={6}
                  className={inputClass}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                Confirm new password
                <input
                  type="password"
                  required
                  minLength={6}
                  className={inputClass}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              {pwError && (
                <p className="text-sm text-[var(--status-over)]">{pwError}</p>
              )}
              <button
                type="submit"
                disabled={pwBusy}
                className="h-9 rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-60"
              >
                {pwBusy ? "Updating…" : "Update password"}
              </button>
            </form>
          </section>
        )}

        <section className="rounded-md border border-[var(--border)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Theme</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Light / dark preference is saved locally.
              </p>
            </div>
            <ThemeToggle />
          </div>
        </section>

        {mode === "demo" && state.profiles.length > 1 && (
          <section className="rounded-md border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold">Switch account (demo)</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              After inviting a person, switch here to see My schedule as that
              member.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {state.profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="h-8 rounded-md border border-[var(--border)] px-3 text-xs hover:bg-[var(--row-hover)]"
                  onClick={() => {
                    switchDemoProfile(p.id);
                    push(`Switched to ${p.full_name} (${p.role})`, "success");
                    router.push("/schedule");
                  }}
                >
                  {p.full_name} · {p.role}
                </button>
              ))}
            </div>
          </section>
        )}

        {canManage && (
          <section className="rounded-md border border-[var(--border)] p-4">
            <h2 className="text-sm font-semibold">Demo data</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {mode === "supabase"
                ? "Clears this organization’s planning data in Supabase and loads the sample schedule narrative."
                : "Reset the local workspace to the seeded schedule narrative."}
            </p>
            <button
              type="button"
              disabled={busy}
              className="mt-3 h-9 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)] disabled:opacity-60"
              onClick={async () => {
                setBusy(true);
                try {
                  await resetDemo();
                  push("Demo data restored", "success");
                } catch (err) {
                  push(
                    err instanceof Error ? err.message : "Failed to load demo",
                    "warning",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Loading…" : "Load demo data"}
            </button>
          </section>
        )}

        <section className="rounded-md border border-[var(--border)] p-4">
          <h2 className="text-sm font-semibold">Backend</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {mode === "supabase"
              ? "Using Supabase. Invites need SUPABASE_SERVICE_ROLE_KEY in .env (server-only)."
              : "Local demo store. Set Supabase env vars for real auth + invites."}
          </p>
          {authError && (
            <p className="mt-2 text-sm text-[var(--status-over)]">{authError}</p>
          )}
        </section>

        <button
          type="button"
          className="h-9 rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
          onClick={async () => {
            await logout();
            router.push("/login");
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
