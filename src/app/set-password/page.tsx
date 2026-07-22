"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { type EmailOtpType } from "@supabase/supabase-js";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ReaperLogo } from "@/components/brand/reaper-logo";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import {
  readUserViewPrefs,
  resolveDefaultStartPage,
} from "@/lib/user-view-prefs";

export default function SetPasswordPage() {
  const { mode, updatePassword, refresh, profile, canManage } = useData();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useDocumentTitle("Set password");

  useEffect(() => {
    if (!isSupabaseConfigured() || mode === "demo") {
      setChecking(false);
      return;
    }

    const client = createClient();
    let cancelled = false;

    async function syncSession() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const token_hash = params.get("token_hash");
      const type = params.get("type") as EmailOtpType | null;

      // generateLink / invite action_link uses implicit tokens in the hash.
      // @supabase/ssr defaults to PKCE, so detectSessionInUrl won't pick these up.
      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");

      if (access_token && refresh_token) {
        const { error: sessionError } = await client.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessionError && !cancelled) {
          setError(sessionError.message);
          setChecking(false);
          return;
        }
        window.history.replaceState({}, "", "/set-password");
      } else if (token_hash && type) {
        // Preferred SSR path (custom email templates): no PKCE verifier needed.
        const { error: otpError } = await client.auth.verifyOtp({
          type,
          token_hash,
        });
        if (otpError && !cancelled) {
          setError(otpError.message);
          setChecking(false);
          return;
        }
        window.history.replaceState({}, "", "/set-password");
      } else if (code) {
        // PKCE: must be the same browser that clicked "Forgot password".
        const { error: exchangeError } =
          await client.auth.exchangeCodeForSession(code);
        if (exchangeError && !cancelled) {
          setError(
            /code verifier/i.test(exchangeError.message)
              ? "This reset link must be opened in the same browser where you requested it. Request a new reset from this browser, or ask your admin to update the Recovery email template to use token_hash."
              : exchangeError.message,
          );
          setChecking(false);
          return;
        }
        window.history.replaceState({}, "", "/set-password");
      }

      const { data } = await client.auth.getSession();
      if (!cancelled) {
        setHasSession(Boolean(data.session));
        setChecking(false);
      }
    }

    void syncSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        (event === "INITIAL_SESSION" ||
          event === "SIGNED_IN" ||
          event === "PASSWORD_RECOVERY" ||
          event === "TOKEN_REFRESHED")
      ) {
        setHasSession(true);
        setChecking(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [mode]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      await refresh();
      setDone(true);
      const prefs = readUserViewPrefs(profile?.id);
      router.replace(
        resolveDefaultStartPage(prefs.defaultStartPage, canManage),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set password");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "demo") {
    return (
      <Shell>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Set password
        </h1>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Password login isn’t used in demo mode.
        </p>
        <button
          type="button"
          className="mt-6 h-10 w-full rounded-md border border-[var(--border)] text-sm"
          onClick={() => router.push("/login")}
        >
          Back to login
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <ReaperLogo className="h-12" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Choose a password
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
        You’re almost in. Set a password so you can sign in anytime.
      </p>

      {checking ? (
        <p className="mt-8 text-sm text-[var(--text-muted)]">
          Confirming your link…
        </p>
      ) : !hasSession ? (
        <div className="mt-8 space-y-3">
          <p className="text-sm text-[var(--status-over)]">
            {error ||
              "This invite or reset link is invalid or expired. Request a new one from the login page, or ask an admin to resend from People."}
          </p>
          <button
            type="button"
            className="h-10 w-full rounded-md border border-[var(--border)] text-sm"
            onClick={() => router.push("/login")}
          >
            Go to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-3">
          <label className="block text-xs text-[var(--text-muted)]">
            New password
            <input
              type="password"
              required
              minLength={6}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </label>
          <label className="block text-xs text-[var(--text-muted)]">
            Confirm password
            <input
              type="password"
              required
              minLength={6}
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p className="text-sm text-[var(--status-over)]">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy || done}
            className="h-10 w-full rounded-md bg-[var(--accent)] text-sm font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save password & continue"}
          </button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-y-auto bg-[var(--page-bg)] text-[var(--text)]">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
