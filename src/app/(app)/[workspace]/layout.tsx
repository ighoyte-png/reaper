"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useData } from "@/lib/data/store";
import {
  homeWorkspaceSlug,
  isMembershipSlug,
  workspacePathAfterSwitch,
} from "@/lib/domain/workspace-memberships";

/**
 * URL workspace slug is the source of truth for the active org.
 * Membership slugs activate that org; unknown slugs redirect home.
 */
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ workspace: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const {
    ready,
    state,
    isAuthenticated,
    isPublicShare,
    switchWorkspace,
  } = useData();
  const orgSlug = state.organization.slug;
  const memberships = state.memberships;
  const [activating, setActivating] = useState(false);
  const activatingSlugRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || isPublicShare || !isAuthenticated) return;
    const slug = params.workspace;
    if (!slug) return;

    if (slug === orgSlug) {
      activatingSlugRef.current = null;
      setActivating(false);
      return;
    }

    if (isMembershipSlug(memberships, slug)) {
      if (activatingSlugRef.current === slug) return;
      activatingSlugRef.current = slug;
      setActivating(true);
      void switchWorkspace(slug, { preservePath: true }).catch(() => {
        activatingSlugRef.current = null;
        setActivating(false);
      });
      return;
    }

    const homeSlug =
      homeWorkspaceSlug(memberships, state.organization.id) || orgSlug;
    if (!homeSlug) return;

    router.replace(workspacePathAfterSwitch(pathname, slug, homeSlug));
  }, [
    ready,
    isPublicShare,
    isAuthenticated,
    orgSlug,
    params.workspace,
    pathname,
    router,
    memberships,
    state.organization.id,
    switchWorkspace,
  ]);

  if (
    ready &&
    !isPublicShare &&
    isAuthenticated &&
    params.workspace &&
    (activating || params.workspace !== orgSlug)
  ) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting…
      </div>
    );
  }

  return children;
}
