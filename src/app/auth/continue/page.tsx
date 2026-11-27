"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form";
import { useData } from "@/lib/data/store";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import {
  readUserViewPrefs,
  resolveDefaultStartPage,
} from "@/lib/user-view-prefs";
import { workspacePath } from "@/lib/paths";

/**
 * Post-OAuth landing: claim invites, enter workspace, or finish public
 * registration (org name) when signup is open.
 */
function AuthContinueInner() {
  const {
    ready,
    isAuthenticated,
    awaitingWorkspaceSetup,
    isPlatformOnly,
    mode,
    profile,
    sessionEmail,
    canManage,
    state,
    refresh,
    completeOAuthRegistration,
    logout,
  } = useData();
  const router = useRouter();
  const params = useSearchParams();
  const intent = params.get("intent") === "register" ? "register" : "login";

  const [phase, setPhase] = useState<"loading" | "register" | "blocked">(
    "loading",
  );
  const [allowSignup, setAllowSignup] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailLabel, setEmailLabel] = useState<string | null>(null);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const startedRef = useRef(false);

  useDocumentTitle("Continue");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/platform/settings");
        if (!res.ok) return;
        const body = (await res.json()) as {
          allow_workspace_signup?: boolean;
          require_account_approval?: boolean;
        };
        if (cancelled) return;
        setAllowSignup(body.allow_workspace_signup !== false);
        setRequireApproval(Boolean(body.require_account_approval));
      } catch {
        /* defaults: allow signup */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve OAuth session once. Do not depend on `refresh` identity — store
  // updates recreate it and would cancel this effect before phase advances.
  useEffect(() => {
    if (!ready) return;
    if (mode === "demo") {
      router.replace("/login");
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          const code = url.searchParams.get("code");
          if (code) {
            const { createClient } = await import("@/lib/supabase/client");
            const client = createClient();
            const { error } = await client.auth.exchangeCodeForSession(code);
            if (error) {
              router.replace(
                "/login?error=" +
                  encodeURIComponent("Google sign-in expired. Try again."),
              );
              return;
            }
            url.searchParams.delete("code");
            window.history.replaceState({}, "", url.pathname + url.search);
          }
        }

        const { createClient } = await import("@/lib/supabase/client");
        const client = createClient();
        const {
          data: { user },
        } = await client.auth.getUser();
        if (!user) {
          router.replace(
            "/login?error=" +
              encodeURIComponent("Sign in was cancelled or expired"),
          );
          return;
        }

        setEmailLabel(user.email?.trim() || null);
        const metaName =
          (typeof user.user_metadata?.full_name === "string" &&
            user.user_metadata.full_name.trim()) ||
          (typeof user.user_metadata?.name === "string" &&
            user.user_metadata.name.trim()) ||
          "";
        if (metaName) setFullName((prev) => prev || metaName);

        // Claim invites / load workspace in background — do not block the form.
        void refreshRef.current().catch(() => undefined);

        const { data: membership } = await client
          .from("organization_memberships")
          .select("organization_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (membership?.organization_id) {
          // Stay on loading until the store org-route effect navigates.
          return;
        }

        // No workspace yet — show name form immediately (login path may
        // flip to blocked once platform settings load).
        setPhase("register");
      } catch (err) {
        if (!cancelled) {
          router.replace(
            "/login?error=" +
              encodeURIComponent(
                err instanceof Error ? err.message : "Sign-in failed",
              ),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, mode, router, intent]);

  // If login intent and public signup is closed, swap register → blocked.
  useEffect(() => {
    if (phase !== "register") return;
    if (intent === "register") return;
    if (!allowSignup) setPhase("blocked");
  }, [phase, intent, allowSignup]);

  // Route into workspace once store has org (after claim / completeOAuthRegistration).
  useEffect(() => {
    if (!ready) return;
    if (isPlatformOnly) {
      router.replace("/admin");
      return;
    }
    if (!isAuthenticated && !awaitingWorkspaceSetup) return;

    const slug = state.organization.slug;
    const hasOrg = Boolean(state.organization.id && slug);
    if (!hasOrg) return;

    const approval = state.organization.approval_status ?? "approved";
    if (approval === "pending" || approval === "rejected") {
      router.replace("/pending-approval");
      return;
    }
    const prefs = readUserViewPrefs(profile?.id);
    router.replace(
      workspacePath(
        slug,
        resolveDefaultStartPage(prefs.defaultStartPage, canManage),
      ),
    );
  }, [
    ready,
    isAuthenticated,
    awaitingWorkspaceSetup,
    isPlatformOnly,
    state.organization.id,
    state.organization.slug,
    state.organization.approval_status,
    profile?.id,
    canManage,
    router,
  ]);

  async function onCompleteRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const name = orgName.trim();
    if (!name) {
      setError("Organization name is required");
      return;
    }
    setBusy(true);
    try {
      await completeOAuthRegistration(
        name,
        fullName.trim() ||
          profile?.full_name ||
          sessionEmail ||
          emailLabel ||
          profile?.email ||
          "Owner",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || phase === "loading") {
    return (
      <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
        Finishing sign-in…
      </p>
    );
  }

  const shownEmail = emailLabel || sessionEmail || profile?.email || null;

  if (phase === "blocked") {
    return (
      <div className="mt-8 space-y-4 text-center">
        <h1 className="text-lg font-semibold">No workspace yet</h1>
        <p className="text-sm text-[var(--text-muted)]">
          This Google account isn’t on a Reaper workspace. Use the same email
          you were invited with, or ask an admin to send an invite.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
          <Link href="/login" className="text-sm text-[var(--accent)] underline">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <h1 className="text-lg font-semibold">Name your workspace</h1>
      <p className="text-xs text-[var(--text-muted)]">
        Signed in with Google
        {shownEmail ? ` as ${shownEmail}` : ""}.
        {requireApproval
          ? " Your account may need platform approval before you can use it."
          : ""}
      </p>
      <form onSubmit={onCompleteRegister} className="space-y-3">
        <Field label="Your name">
          <input
            className={inputClass}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
          />
        </Field>
        <Field label="Organization name">
          <input
            className={inputClass}
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Northwind Studio"
            required
            autoFocus
          />
        </Field>
        {error ? (
          <p className="text-sm text-[var(--status-over)]">{error}</p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          className="h-10 w-full"
          disabled={busy || !orgName.trim()}
        >
          {busy ? "Creating…" : "Create workspace"}
        </Button>
      </form>
      <button
        type="button"
        className="w-full text-center text-xs text-[var(--text-muted)] underline-offset-2 hover:underline"
        onClick={async () => {
          await logout();
          router.push("/login");
        }}
      >
        Cancel and sign out
      </button>
    </div>
  );
}

export default function AuthContinuePage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-[var(--page-bg)] px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <BrandLockup
          stacked
          className="w-full"
          logoClassName="h-24"
          wordmarkClassName="text-2xl"
        />
        <Suspense
          fallback={
            <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
              Loading…
            </p>
          }
        >
          <AuthContinueInner />
        </Suspense>
      </div>
    </div>
  );
}
