"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/data/store";
import { loginPathWithNext } from "@/lib/paths";

function AcceptInviteInner() {
  const params = useSearchParams();
  const token = params.get("token")?.trim() ?? "";
  const router = useRouter();
  const { ready, isAuthenticated, refresh } = useData();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Auth invite redirectTo may land here with tokens in the hash.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const { isSupabaseConfigured } = await import("@/lib/supabase/config");
        if (!isSupabaseConfigured()) {
          if (!cancelled) setSessionReady(true);
          return;
        }
        const client = createClient();
        const hashParams = new URLSearchParams(
          window.location.hash.replace(/^#/, ""),
        );
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        if (access_token && refresh_token) {
          await client.auth.setSession({ access_token, refresh_token });
          const url = new URL(window.location.href);
          url.hash = "";
          window.history.replaceState({}, "", url.pathname + url.search);
          await refresh();
        }
      } catch {
        /* fall through to auth gate */
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!ready || !sessionReady || !token) return;
    if (!isAuthenticated) {
      router.replace(
        loginPathWithNext(`/invite/accept?token=${encodeURIComponent(token)}`),
      );
      return;
    }
    let cancelled = false;
    setBusy(true);
    void (async () => {
      try {
        const res = await fetch("/api/accounts/invites/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          workspace?: { slug?: string };
        };
        if (!res.ok) {
          if (!cancelled) setError(body.error ?? "Could not accept invite");
          return;
        }
        const slug = body.workspace?.slug;
        window.location.href = slug ? `/${slug}/dashboard` : "/";
      } catch {
        if (!cancelled) setError("Could not accept invite");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, sessionReady, isAuthenticated, token, router]);

  if (!token) {
    return (
      <p className="text-sm text-[var(--text-muted)]">Missing invite token.</p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {busy || (!error && isAuthenticated) ? (
        <p className="text-sm text-[var(--text-muted)]">Accepting invite…</p>
      ) : null}
      {error ? (
        <>
          <p className="text-sm text-[var(--status-over)]">{error}</p>
          <Link href="/login" className="text-sm text-[var(--accent)]">
            Sign in
          </Link>
        </>
      ) : null}
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--page-bg)] p-6 text-[var(--text)]">
      <BrandLockup />
      <Suspense
        fallback={
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        }
      >
        <AcceptInviteInner />
      </Suspense>
      <Button
        type="button"
        variant="ghost"
        className="text-sm text-[var(--text-muted)]"
        onClick={() => {
          window.location.href = "/login";
        }}
      >
        Back to login
      </Button>
    </div>
  );
}
