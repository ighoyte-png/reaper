"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data/store";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import {
  readUserViewPrefs,
  resolveDefaultStartPage,
} from "@/lib/user-view-prefs";
import { loginPathWithNext, workspacePath } from "@/lib/paths";

export default function PendingApprovalPage() {
  const {
    ready,
    isAuthenticated,
    isPlatformOnly,
    state,
    logout,
    profile,
    canManage,
  } = useData();
  const router = useRouter();
  const status = state.organization.approval_status ?? "approved";

  useDocumentTitle(
    status === "rejected" ? "Account rejected" : "Pending approval",
  );

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      router.replace(loginPathWithNext("/pending-approval"));
      return;
    }
    if (isPlatformOnly) {
      router.replace("/admin");
      return;
    }

    let cancelled = false;
    void (async () => {
      // Recover invitees who were auto-bootstrapped into a pending org: claim
      // any real workspace invites and switch into that account.
      try {
        const res = await fetch("/api/accounts/invites/claim", {
          method: "POST",
        });
        if (res.ok) {
          const body = (await res.json()) as {
            claimed?: number;
            workspace?: { slug?: string } | null;
          };
          if (!cancelled && (body.claimed ?? 0) > 0 && body.workspace?.slug) {
            window.location.href = `/${body.workspace.slug}/dashboard`;
            return;
          }
        }
      } catch {
        /* ignore */
      }

      if (cancelled) return;
      if (status === "approved" && !state.organization.disabled_at) {
        if (!state.organization.slug) return;
        const prefs = readUserViewPrefs(profile?.id);
        router.replace(
          workspacePath(
            state.organization.slug,
            resolveDefaultStartPage(prefs.defaultStartPage, canManage),
          ),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    ready,
    isAuthenticated,
    isPlatformOnly,
    status,
    state.organization.disabled_at,
    state.organization.slug,
    profile?.id,
    canManage,
    router,
  ]);

  if (!ready || !isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  const rejected = status === "rejected";

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-[var(--page-bg)] px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md text-center">
        <BrandLockup
          stacked
          className="w-full"
          logoClassName="h-24"
          wordmarkClassName="text-2xl"
        />
        <h1 className="mt-8 text-lg font-semibold">
          {rejected ? "Account not approved" : "Pending approval"}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {rejected
            ? state.organization.rejection_reason
              ? `Your account for “${state.organization.name || "this workspace"}” was not approved: ${state.organization.rejection_reason}`
              : `Your account for “${state.organization.name || "this workspace"}” was not approved. Contact the platform administrator.`
            : `Your account for “${state.organization.name || "this workspace"}” is waiting for a platform administrator to approve it. If you were invited to someone else’s workspace, ask them to resend the invite, then sign in again.`}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
          <Link
            href="/login"
            className="rounded-md px-3 py-1.5 text-sm text-[var(--accent)] underline"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
