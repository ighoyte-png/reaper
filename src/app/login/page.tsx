"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { safeAuthNextPath, workspacePath } from "@/lib/paths";

function LoginForm() {
  const {
    loginDemo,
    login,
    loginWithGoogle,
    requestPasswordReset,
    isAuthenticated,
    isPlatformOnly,
    isPlatformAdmin,
    ready,
    mode,
    authError,
    profile,
    canManage,
    state,
  } = useData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmedNotice, setConfirmedNotice] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [allowWorkspaceSignup, setAllowWorkspaceSignup] = useState(true);

  useDocumentTitle("Log in");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/platform/settings");
        if (!res.ok) return;
        const body = (await res.json()) as {
          allow_workspace_signup?: boolean;
        };
        if (cancelled) return;
        const allow = body.allow_workspace_signup !== false;
        setAllowWorkspaceSignup(allow);
      } catch {
        /* default allow */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (
      hash.includes("type=invite") ||
      hash.includes("type=recovery") ||
      hash.includes("type=magiclink")
    ) {
      router.replace(`/set-password${hash}`);
    }
  }, [router]);

  useEffect(() => {
    const err = searchParams.get("error");
    if (err) setLocalError(err);
    if (searchParams.get("confirmed") === "1") setConfirmedNotice(true);
  }, [searchParams]);

  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    if (isPlatformOnly || isPlatformAdmin) {
      router.replace("/admin");
      return;
    }
    const approval = state.organization.approval_status ?? "approved";
    if (approval === "pending" || approval === "rejected") {
      router.replace("/pending-approval");
      return;
    }
    if (!state.organization.slug) {
      router.replace("/auth/continue");
      return;
    }
    const next = safeAuthNextPath(searchParams.get("next"));
    if (next) {
      router.replace(next);
      return;
    }
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
    isPlatformAdmin,
    profile?.id,
    canManage,
    router,
    state.organization.slug,
    state.organization.approval_status,
    searchParams,
  ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  async function onForgotPassword() {
    setLocalError(null);
    setResetSent(false);
    if (!email.trim()) {
      setLocalError("Enter your email first, then click Forgot password.");
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setResetSent(true);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Could not send reset email",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setLocalError(null);
    setGoogleBusy(true);
    try {
      await loginWithGoogle({
        intent: "login",
        next: searchParams.get("next"),
      });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : "Google sign-in failed",
      );
      setGoogleBusy(false);
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
        <>
          <button
            type="button"
            onClick={() => {
              loginDemo();
            }}
            className="mt-8 h-10 w-full rounded-md bg-[var(--accent)] text-sm font-medium text-[var(--accent-fg)] hover:opacity-90"
          >
            Enter demo workspace
          </button>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Local demo mode. Add Supabase env vars to use real auth + database.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-8 text-lg font-semibold">Sign in</h1>
          {confirmedNotice && (
            <p className="mt-2 text-sm text-[var(--status-healthy)]">
              Email confirmed. Sign in with your password to continue.
            </p>
          )}

          <div className="mt-4 space-y-3">
            <GoogleSignInButton
              label="Continue with Google"
              busy={googleBusy}
              disabled={busy}
              onClick={() => void onGoogle()}
            />
            <p className="text-center text-[11px] text-[var(--text-muted)]">
              Invited? Use the same Google account email as the invite.
            </p>
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]" />
              </div>
              <div className="relative flex justify-center text-[11px]">
                <span className="bg-[var(--page-bg)] px-2 text-[var(--text-muted)]">
                  or email
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-1 space-y-3">
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
                autoComplete="current-password"
              />
            </label>

            {(localError || authError) && (
              <p className="text-sm text-[var(--status-over)]">
                {localError || authError}
              </p>
            )}
            {resetSent && (
              <p className="text-sm text-[var(--status-healthy)]">
                If an account exists for that email, a reset link was sent. Open
                it in this same browser. Allow{" "}
                <code className="text-xs">/set-password</code> under Auth →
                URL configuration.
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="h-10 w-full rounded-md bg-[var(--accent)] text-sm font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Working…" : "Sign in"}
            </button>
          </form>

          <button
            type="button"
            disabled={busy}
            onClick={() => void onForgotPassword()}
            className="mt-3 w-full text-center text-xs text-[var(--text-muted)] underline-offset-2 hover:underline disabled:opacity-60"
          >
            Forgot password?
          </button>

          {allowWorkspaceSignup ? (
            <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
              New here?{" "}
              <Link href="/register" className="text-[var(--accent)] underline">
                Create an account
              </Link>
            </p>
          ) : (
            <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
              New account registration is currently closed. Sign in to an
              existing account or use an invite.
            </p>
          )}
        </>
      )}
      <p className="mt-6 text-center text-[10px] font-medium tracking-wide text-[var(--text-muted)] opacity-50">
        v{APP_VERSION}
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex h-dvh flex-col overflow-y-auto bg-[var(--page-bg)] text-[var(--text)]">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <Suspense fallback={<p className="text-sm text-[var(--text-muted)]">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
