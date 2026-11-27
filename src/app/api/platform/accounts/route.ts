import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { provisionAccount } from "@/lib/accounts/provision";
import { assertAllowedSiteOrigin } from "@/lib/security/request";
import { clientSiteOrigin } from "@/lib/share/token";

export async function GET() {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, name, slug, disabled_at, created_at, owner_user_id")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (orgs ?? []).map((o) => o.id as string);
  const memberCounts = new Map<string, number>();
  const projectCounts = new Map<string, number>();
  const billingByOrg = new Map<
    string,
    { plan_key: string; status: string; seat_limit: number | null }
  >();

  if (ids.length > 0) {
    const [{ data: memberships }, { data: projects }, { data: billing }] =
      await Promise.all([
        admin
          .from("organization_memberships")
          .select("organization_id")
          .in("organization_id", ids),
        admin.from("projects").select("organization_id").in("organization_id", ids),
        admin
          .from("billing_accounts")
          .select("organization_id, plan_key, status, seat_limit")
          .in("organization_id", ids),
      ]);
    for (const row of memberships ?? []) {
      const oid = String(row.organization_id);
      memberCounts.set(oid, (memberCounts.get(oid) ?? 0) + 1);
    }
    for (const row of projects ?? []) {
      const oid = String(row.organization_id);
      projectCounts.set(oid, (projectCounts.get(oid) ?? 0) + 1);
    }
    for (const row of billing ?? []) {
      billingByOrg.set(String(row.organization_id), {
        plan_key: String(row.plan_key ?? "free"),
        status: String(row.status ?? "none"),
        seat_limit:
          typeof row.seat_limit === "number" ? row.seat_limit : null,
      });
    }
  }

  return NextResponse.json({
    accounts: (orgs ?? []).map((o) => {
      const id = o.id as string;
      const billing = billingByOrg.get(id);
      return {
        id,
        name: String(o.name),
        slug: String(o.slug ?? ""),
        disabled_at: (o.disabled_at as string | null) ?? null,
        created_at: (o.created_at as string | null) ?? null,
        owner_user_id: (o.owner_user_id as string | null) ?? null,
        member_count: memberCounts.get(id) ?? 0,
        project_count: projectCounts.get(id) ?? 0,
        plan_key: billing?.plan_key ?? "free",
        billing_status: billing?.status ?? "none",
        seat_limit: billing?.seat_limit ?? null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth && auth.error) return auth.error;
  const { admin, user, email } = auth;

  const body = (await request.json()) as {
    name?: string;
    slug?: string;
    ownerEmail?: string;
    ownerName?: string;
    delivery?: string;
  };

  try {
    const originCheck = assertAllowedSiteOrigin(request);
    const origin = originCheck.ok ? originCheck.origin : clientSiteOrigin();
    const result = await provisionAccount(admin, {
      name: body.name ?? "",
      slug: body.slug,
      ownerEmail: body.ownerEmail ?? "",
      ownerName: body.ownerName,
      delivery: body.delivery === "link" ? "link" : "email",
      origin,
      actorUserId: user.id,
      actorEmail: email,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Provision failed" },
      { status: 400 },
    );
  }
}
