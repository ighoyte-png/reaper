"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useData } from "@/lib/data/store";
import { inputClass } from "@/components/ui/form";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { APP_VERSION } from "@/lib/version";

function LoginForm() {
  const {
    loginDemo,
    login,
    signup,
    requestPasswordReset,
    isAuthenticated,
    ready,
    mode,
    authError,
  } = useData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

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
  }, [searchParams]);

  useEffect(() => {
    if (ready && isAuthenticated) router.replace("/schedule");
  }, [ready, isAuthenticated, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    try {
      if (tab === "login") {
        await login(email.trim(), password);
      } else {
        const result = await signup(
          email.trim(),
          password,
          fullName.trim() || email.split("@")[0],
          orgName.trim() || "My workspace",
        );
        if (result.needsConfirmation) {
          setTab("login");
        }
      }
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
              router.push("/schedule");
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
          <div className="mt-8 flex rounded-md border border-[var(--border)] p-0.5 text-sm">
            <button
              type="button"
              className={`h-8 flex-1 rounded ${tab === "login" ? "bg-[var(--bg-elevated)] font-medium" : "text-[var(--text-muted)]"}`}
              onClick={() => setTab("login")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`h-8 flex-1 rounded ${tab === "signup" ? "bg-[var(--bg-elevated)] font-medium" : "text-[var(--text-muted)]"}`}
              onClick={() => setTab("signup")}
            >
              Create workspace
            </button>
          </div>

          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            {tab === "signup" && (
              <>
                <label className="block text-xs text-[var(--text-muted)]">
                  Full name
                  <input
                    className={inputClass}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                  />
                </label>
                <label className="block text-xs text-[var(--text-muted)]">
                  Organization name
                  <input
                    className={inputClass}
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Northwind Studio"
                  />
                </label>
              </>
            )}
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
                autoComplete={
                  tab === "login" ? "current-password" : "new-password"
                }
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
              {busy
                ? "Working…"
                : tab === "login"
                  ? "Sign in"
                  : "Create workspace"}
            </button>
          </form>

          {tab === "login" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onForgotPassword()}
              className="mt-3 w-full text-center text-xs text-[var(--text-muted)] underline-offset-2 hover:underline disabled:opacity-60"
            >
              Forgot password?
            </button>
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
    <div className="flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
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
