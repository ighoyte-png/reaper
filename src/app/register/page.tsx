"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useData } from "@/lib/data/store";
import { inputClass } from "@/components/ui/form";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { APP_VERSION } from "@/lib/version";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import {
  readUserViewPrefs,
  resolveDefaultStartPage,
} from "@/lib/user-view-prefs";
import { workspacePath } from "@/lib/paths";

function RegisterForm() {
  const {
    signup,
    isAuthenticated,
    isPlatformOnly,
    ready,
    mode,
    authError,
    profile,
    canManage,
    state,
  } = useData();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [allowSignup, setAllowSignup] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useDocumentTitle("Register");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/platform/settings");
        if (!res.ok) {
          if (!cancelled) setSettingsLoaded(true);
          return;
        }
        const body = (await res.json()) as {
          allow_workspace_signup?: boolean;
          require_account_approval?: boolean;
        };
        if (cancelled) return;
        setAllowSignup(body.allow_workspace_signup !== false);
        setRequireApproval(Boolean(body.require_account_approval));
      } catch {
        /* defaults */
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    if (isPlatformOnly) {
      router.replace("/admin");
      return;
    }
    const status = state.organization.approval_status ?? "approved";
    if (status === "pending" || status === "rejected") {
      router.replace("/pending-approval");
      return;
    }
    if (!state.organization.slug) return;
    const prefs = readUserViewPrefs(profile?.id);
    router.replace(
      workspacePath(
        state.organization.slug,
        resolveDefaultStartPage(prefs.defaultStartPage, canManage),
      ),
    );
  }, [
    ready,
    isAuthenticated,
    isPlatformOnly,
    profile?.id,
    canManage,
    router,
    state.organization.slug,
    state.organization.approval_status,
  ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setNeedsConfirmation(false);
    if (!allowSignup) {
      setLocalError("Registration is currently closed.");
      return;
    }
    setBusy(true);
    try {
      const result = await signup(
        email.trim(),
        password,
        fullName.trim() || email.split("@")[0],
        orgName.trim() || "My workspace",
      );
      if (result.needsConfirmation) {
        setNeedsConfirmation(true);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <BrandLockup
        stacked
        className="w-full"
        logoClassName="h-32"
        wordmarkClassName="text-3xl"
      />

      {mode === "demo" ? (
        <p className="mt-8 text-sm text-[var(--text-muted)]">
          Registration requires Supabase. Use demo login from the{" "}
          <Link href="/login" className="text-[var(--accent)] underline">
            login page
          </Link>
          .
        </p>
      ) : !settingsLoaded ? (
        <p className="mt-8 text-sm text-[var(--text-muted)]">Loading…</p>
      ) : !allowSignup ? (
        <div className="mt-8 space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            New account registration is currently closed. If you were invited,
            sign in instead.
          </p>
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)]"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <>
          <h1 className="mt-8 text-lg font-semibold">Create your account</h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {requireApproval
              ? "After you register, a platform administrator must approve your account before you can use the workspace."
              : "Create a workspace and start collaborating."}
          </p>

          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <label className="block text-xs text-[var(--text-muted)]">
              Full name
              <input
                className={inputClass}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
            <label className="block text-xs text-[var(--text-muted)]">
              Organization name
              <input
                className={inputClass}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Northwind Studio"
                required
              />
            </label>
            <label className="block text-xs text-[var(--text-muted)]">
              Email
              <input
                type="email"
                required
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="block text-xs text-[var(--text-muted)]">
              Password
              <input
                type="password"
                required
                minLength={6}
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            {(localError || authError) && (
              <p className="text-sm text-[var(--status-over)]">
                {localError || authError}
              </p>
            )}
            {needsConfirmation && (
              <p className="text-sm text-[var(--status-healthy)]">
                Check your email to confirm, then sign in. Your workspace will
                be created on first login
                {requireApproval ? " and may require approval" : ""}.
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="h-10 w-full rounded-md bg-[var(--accent)] text-sm font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Creating…" : "Register"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--accent)] underline">
              Sign in
            </Link>
          </p>
        </>
      )}

      <p className="mt-8 text-center text-[10px] text-[var(--text-muted)]">
        v{APP_VERSION}
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-[var(--page-bg)] px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Suspense
        fallback={
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        }
      >
        <RegisterForm />
      </Suspense>
    </div>
  );
}
