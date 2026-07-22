"use client";

import { useEffect } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useData } from "@/lib/data/store";

/**
 * Ensures the URL workspace segment matches the signed-in org slug.
 * Mismatch redirects to the same path under the correct workspace prefix.
 */
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ workspace: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { ready, state, isAuthenticated, isPublicShare } = useData();
  const orgSlug = state.organization.slug;

  useEffect(() => {
    if (!ready || isPublicShare || !isAuthenticated) return;
    if (!orgSlug || !params.workspace) return;
    if (params.workspace === orgSlug) return;

    const suffix = pathname.startsWith(`/${params.workspace}`)
      ? pathname.slice(`/${params.workspace}`.length) || "/dashboard"
      : "/dashboard";
    router.replace(`/${orgSlug}${suffix.startsWith("/") ? suffix : `/${suffix}`}`);
  }, [
    ready,
    isPublicShare,
    isAuthenticated,
    orgSlug,
    params.workspace,
    pathname,
    router,
  ]);

  if (
    ready &&
    !isPublicShare &&
    isAuthenticated &&
    orgSlug &&
    params.workspace &&
    params.workspace !== orgSlug
  ) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting…
      </div>
    );
  }

  return children;
}
