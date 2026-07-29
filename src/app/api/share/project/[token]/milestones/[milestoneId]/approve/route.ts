import { NextResponse } from "next/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  mapBulletin,
  mapMilestone,
  seedBulletinUnreadRows,
  upsertBulletinRow,
  upsertMilestoneRow,
} from "@/lib/supabase/api";
import {
  approvalContactsMatch,
  milestoneApprovalBulletinTitle,
} from "@/lib/domain/milestones";
import type { Bulletin, Milestone } from "@/lib/types";

type Params = {
  params: Promise<{ token: string; milestoneId: string }>;
};

function notFound() {
  return NextResponse.json(
    { error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function badRequest(message: string) {
  return NextResponse.json(
    { error: message },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

/** Client portal milestone approval (anonymous share token). */
export async function POST(request: Request, { params }: Params) {
  try {
    const { token, milestoneId } = await params;
    const shareToken = token?.trim();
    const msId = milestoneId?.trim();
    if (!shareToken || shareToken.length < 8 || !msId) {
      return notFound();
    }

    let body: { name?: string; email?: string; verifyOnly?: boolean };
    try {
      body = (await request.json()) as {
        name?: string;
        email?: string;
        verifyOnly?: boolean;
      };
    } catch {
      return badRequest("Invalid JSON");
    }
    const name = String(body.name ?? "");
    const email = String(body.email ?? "");
    const verifyOnly = Boolean(body.verifyOnly);
    if (!name.trim() || !email.trim()) {
      return badRequest("Name and email are required");
    }

    if (!isSupabaseConfigured() || !isServiceRoleConfigured()) {
      return NextResponse.json(
        { error: "Public project share requires Supabase" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const admin = createAdminClient();
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select(
        "id, organization_id, name, client_id, manager_person_id, share_enabled, share_token",
      )
      .eq("share_token", shareToken)
      .maybeSingle();

    if (projectError || !project || !project.share_enabled) {
      return notFound();
    }

    const { data: org } = await admin
      .from("organizations")
      .select("disabled_at")
      .eq("id", project.organization_id)
      .maybeSingle();
    if (org?.disabled_at) return notFound();

    const { data: milestoneRow, error: msError } = await admin
      .from("milestones")
      .select("*")
      .eq("id", msId)
      .eq("project_id", project.id)
      .maybeSingle();

    if (msError || !milestoneRow) return notFound();

    const milestone = mapMilestone(milestoneRow as Record<string, unknown>);
    if (!milestone.approval_enabled) {
      return badRequest("Milestone is not ready for approval");
    }
    if (milestone.approved_by_client || milestone.client_approved) {
      return badRequest("Milestone is already approved");
    }
    if (
      !approvalContactsMatch(
        milestone.approval_name,
        milestone.approval_email,
        name,
        email,
      )
    ) {
      if (verifyOnly) {
        return NextResponse.json(
          { match: false },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        { error: "Name and email do not match" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (verifyOnly) {
      return NextResponse.json(
        { match: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const approvedAt = new Date().toISOString();
    const approvedName = name.trim().replace(/\s+/g, " ");
    const updated: Milestone = {
      ...milestone,
      client_approved: true,
      approved_by_client: true,
      approved_by_name: approvedName,
      approved_at: approvedAt,
    };

    await upsertMilestoneRow(admin, updated);

    const { data: clientRow } = project.client_id
      ? await admin
          .from("clients")
          .select("name")
          .eq("id", project.client_id)
          .maybeSingle()
      : { data: null };

    const title = milestoneApprovalBulletinTitle({
      milestoneName: milestone.name,
      clientName: clientRow?.name ? String(clientRow.name) : null,
      projectName: String(project.name),
    });

    const [
      { data: members },
      { data: assignments },
      { data: tasks },
      { data: people },
    ] = await Promise.all([
      admin
        .from("project_members")
        .select("person_id")
        .eq("project_id", project.id),
      admin
        .from("assignments")
        .select("person_id")
        .eq("project_id", project.id),
      admin
        .from("tasks")
        .select("assignee_person_id")
        .eq("project_id", project.id),
      admin
        .from("people")
        .select("id, profile_id")
        .eq("organization_id", project.organization_id),
    ]);

    const teamIds = new Set<string>();
    for (const m of members ?? []) {
      if (m.person_id) teamIds.add(String(m.person_id));
    }
    for (const a of assignments ?? []) {
      if (a.person_id) teamIds.add(String(a.person_id));
    }
    for (const t of tasks ?? []) {
      if (t.assignee_person_id) teamIds.add(String(t.assignee_person_id));
    }
    if (project.manager_person_id) {
      teamIds.add(String(project.manager_person_id));
    }

    const profileIds = (people ?? [])
      .filter(
        (p) =>
          teamIds.has(String(p.id)) &&
          p.profile_id != null &&
          String(p.profile_id).length > 0,
      )
      .map((p) => String(p.profile_id));

    const bulletinId = crypto.randomUUID();
    const bulletin: Bulletin = {
      id: bulletinId,
      organization_id: String(project.organization_id),
      project_id: String(project.id),
      title,
      body: "",
      pinned: false,
      audience: "people",
      audience_person_ids: [...teamIds],
      audience_pod_ids: [],
      tone: "success",
      created_by_profile_id: null,
      created_at: approvedAt,
    };

    await upsertBulletinRow(admin, bulletin);
    await seedBulletinUnreadRows(
      admin,
      profileIds.map((profile_id) => ({
        bulletin_id: bulletinId,
        profile_id,
        organization_id: String(project.organization_id),
      })),
    );

    return NextResponse.json(
      {
        milestone: {
          id: updated.id,
          client_approved: true,
          approved_by_client: true,
          approved_by_name: approvedName,
          approved_at: approvedAt,
        },
        bulletin: mapBulletin(bulletin as unknown as Record<string, unknown>),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Unable to approve milestone" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
