import type { OrganizationMembership } from "@/lib/types";

/** Prefer active org slug, else first membership. */
export function homeWorkspaceSlug(
  memberships: OrganizationMembership[],
  activeOrganizationId?: string | null,
): string | null {
  if (memberships.length === 0) return null;
  if (activeOrganizationId) {
    const active = memberships.find(
      (m) => m.organization_id === activeOrganizationId,
    );
    if (active) return active.org.slug;
  }
  return memberships[0]?.org.slug ?? null;
}

/** True when the URL slug is one of the user's memberships. */
export function isMembershipSlug(
  memberships: OrganizationMembership[],
  slug: string,
): boolean {
  return memberships.some((m) => m.org.slug === slug);
}

/**
 * Preserve path suffix when switching workspace prefixes.
 * `/acme/projects/x` + `beta` → `/beta/projects/x`
 */
export function workspacePathAfterSwitch(
  pathname: string,
  fromSlug: string,
  toSlug: string,
): string {
  const prefix = `/${fromSlug}`;
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    const suffix = pathname.slice(prefix.length) || "/dashboard";
    return `/${toSlug}${suffix.startsWith("/") ? suffix : `/${suffix}`}`;
  }
  return `/${toSlug}/dashboard`;
}
