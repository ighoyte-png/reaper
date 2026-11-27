"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { inputClass } from "@/components/ui/form";
import { APP_VERSION } from "@/lib/version";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useData } from "@/lib/data/store";
import { createClient } from "@/lib/supabase/client";
import {
  readUserViewPrefs,
  resolveDefaultStartPage,
} from "@/lib/user-view-prefs";
import { workspacePath } from "@/lib/paths";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email")?.trim() || "";
  const approval = searchParams.get("approval") === "1";
  const {
    ready,
    isAuthenticated,
    isPlatformOnly,
    refresh,
    state,
    profile,
    canManage,
  } = useData();
  const router = useRouter();
  const [email, setEmail] = useState(emailFromQuery);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle("Confirm your email");

  useEffect(() => {
    if (emailFromQuery) setEmail(emailFromQuery);
  }, [emailFromQuery]);

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
    if (!state.organization.slug) {
      router.replace("/auth/continue?intent=register");
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
    profile?.id,
    canManage,
    router,
    state.organization.slug,
    state.organization.approval_status,
  ]);

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    const token = otp.replace(/\s/g, "");
    if (!trimmedEmail || token.length < 6) {
      setError("Enter the email and 6-digit code from the message.");
      return;
    }
    setBusy(true);
    try {
      const client = createClient();
      const { error: otpError } = await client.auth.verifyOtp({
        email: trimmedEmail,
        token,
        type: "email",
      });
      if (otpError) {
        setError(otpError.message);
        return;
      }
      await refresh();
      router.replace("/auth/continue?intent=register");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
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
      <h1 className="mt-8 text-center text-lg font-semibold">
        Check your email
      </h1>
      <p className="mt-2 text-center text-sm text-[var(--text-muted)]">
        {emailFromQuery ? (
          <>
            We sent a confirmation link to{" "}
            <span className="text-[var(--text)]">{emailFromQuery}</span>. Open
            it on any device, or enter the code below.
          </>
        ) : (
          <>
            We sent a confirmation link. Open it on any device, or enter the
            code from the email below.
          </>
        )}
      </p>
      <p className="mt-3 text-center text-sm text-[var(--text-muted)]">
        Your workspace will be created on first login
        {approval ? " and may require approval" : ""}.
      </p>

      <form onSubmit={onVerifyOtp} className="mt-6 space-y-3">
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
          Confirmation code
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            required
            className={inputClass}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="6-digit code"
            autoComplete="one-time-code"
          />
        </label>
        {error && (
          <p className="text-sm text-[var(--status-over)]">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="h-10 w-full rounded-md bg-[var(--accent)] text-sm font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Confirming…" : "Confirm email"}
        </button>
      </form>

      <Link
        href="/login"
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md border border-[var(--border)] px-4 text-sm text-[var(--text-muted)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
      >
        Sign in
      </Link>
      <p className="mt-4 text-center text-xs text-[var(--text-muted)]">
        Wrong email?{" "}
        <Link href="/register" className="text-[var(--accent)] underline">
          Register again
        </Link>
      </p>
      <p className="mt-8 text-center text-[10px] text-[var(--text-muted)]">
        v{APP_VERSION}
      </p>
    </div>
  );
}

export default function CheckEmailPage() {
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
        <CheckEmailContent />
      </Suspense>
    </div>
  );
}
