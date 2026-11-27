"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { APP_VERSION } from "@/lib/version";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useData } from "@/lib/data/store";
import {
  readUserViewPrefs,
  resolveDefaultStartPage,
} from "@/lib/user-view-prefs";
import { workspacePath } from "@/lib/paths";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim() || null;
  const approval = searchParams.get("approval") === "1";
  const {
    ready,
    isAuthenticated,
    isPlatformOnly,
    state,
    profile,
    canManage,
  } = useData();
  const router = useRouter();

  useDocumentTitle("Confirm your email");

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
      router.replace("/auth/continue");
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

  return (
    <div className="w-full max-w-md text-center">
      <BrandLockup
        stacked
        className="w-full"
        logoClassName="h-32"
        wordmarkClassName="text-3xl"
      />
      <h1 className="mt-8 text-lg font-semibold">Check your email</h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {email ? (
          <>
            We sent a confirmation link to{" "}
            <span className="text-[var(--text)]">{email}</span>. Open it, then
            sign in.
          </>
        ) : (
          <>We sent a confirmation link. Open it, then sign in.</>
        )}
      </p>
      <p className="mt-3 text-sm text-[var(--text-muted)]">
        Your workspace will be created on first login
        {approval ? " and may require approval" : ""}.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-flex h-10 w-full items-center justify-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)] hover:opacity-90"
      >
        Sign in
      </Link>
      <p className="mt-4 text-xs text-[var(--text-muted)]">
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
