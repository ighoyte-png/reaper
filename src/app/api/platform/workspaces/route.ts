import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";

export async function GET() {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, slug, disabled_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (orgs ?? []).map((o) => o.id as string);
  const profileCounts = new Map<string, number>();
  const projectCounts = new Map<string, number>();

  if (ids.length > 0) {
    const [{ data: profiles }, { data: projects }] = await Promise.all([
      admin.from("profiles").select("organization_id").in("organization_id", ids),
      admin.from("projects").select("organization_id").in("organization_id", ids),
    ]);
    for (const row of profiles ?? []) {
      const oid = String(row.organization_id);
      profileCounts.set(oid, (profileCounts.get(oid) ?? 0) + 1);
    }
    for (const row of projects ?? []) {
      const oid = String(row.organization_id);
      projectCounts.set(oid, (projectCounts.get(oid) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    workspaces: (orgs ?? []).map((o) => ({
      id: o.id as string,
      name: String(o.name),
      slug: String(o.slug ?? ""),
      disabled_at: (o.disabled_at as string | null) ?? null,
      created_at: (o.created_at as string | null) ?? null,
      member_count: profileCounts.get(o.id as string) ?? 0,
      project_count: projectCounts.get(o.id as string) ?? 0,
    })),
  });
}
