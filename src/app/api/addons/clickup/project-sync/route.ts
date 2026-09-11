import { NextResponse } from "next/server";
import { requireClickUpManagerApi } from "@/addons/clickup/api-auth";
import { loadSettings } from "@/addons/clickup/db";
import { reconcileProject, processOutbox } from "@/addons/clickup/sync";
import type { ReconcileSummary } from "@/addons/clickup/types";

export async function GET(request: Request) {
  try {
    const auth = await requireClickUpManagerApi(request);
    if ("error" in auth) return auth.error;
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    const { data } = await auth.admin
      .from("addon_clickup_project_sync")
      .select("*")
      .eq("organization_id", auth.caller.organization_id)
      .eq("project_id", projectId)
      .maybeSingle();
    return NextResponse.json({
      sync: data ?? {
        organization_id: auth.caller.organization_id,
        project_id: projectId,
        enabled: false,
        link_mode: null,
        reconciling: false,
        last_reconcile_summary: null,
        last_error: null,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireClickUpManagerApi(request);
    if ("error" in auth) return auth.error;
    const body = (await request.json()) as {
      projectId?: string;
      enabled?: boolean;
      link_mode?: "link" | "create";
      link_clickup_folder_id?: string | null;
      resync?: boolean;
    };
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    const settings = await loadSettings(
      auth.admin,
      auth.caller.organization_id,
    );
    if (!settings?.enabled) {
      return NextResponse.json(
        { error: "Enable the ClickUp addon in Settings → Admin first" },
        { status: 400 },
      );
    }

    const { data: project } = await auth.admin
      .from("projects")
      .select("id, sandbox_mode")
      .eq("id", projectId)
      .eq("organization_id", auth.caller.organization_id)
      .maybeSingle();
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    if (project.sandbox_mode && body.enabled) {
      return NextResponse.json(
        { error: "Sandbox projects cannot sync to ClickUp" },
        { status: 400 },
      );
    }

    const enabling = body.enabled === true;
    const resync = body.resync === true;
    const linkMode = body.link_mode ?? "create";

    if (enabling || resync) {
      await auth.admin.from("addon_clickup_project_sync").upsert({
        organization_id: auth.caller.organization_id,
        project_id: projectId,
        enabled: true,
        link_mode: linkMode,
        reconciling: true,
        last_error: null,
        updated_at: new Date().toISOString(),
      });

      let summary: ReconcileSummary;
      try {
        summary = await reconcileProject({
          admin: auth.admin,
          orgId: auth.caller.organization_id,
          projectId,
          linkMode,
          linkClickUpFolderId: body.link_clickup_folder_id,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await auth.admin.from("addon_clickup_project_sync").upsert({
          organization_id: auth.caller.organization_id,
          project_id: projectId,
          enabled: true,
          link_mode: linkMode,
          reconciling: false,
          last_error: msg,
          updated_at: new Date().toISOString(),
        });
        return NextResponse.json({ error: msg }, { status: 500 });
      }

      await auth.admin.from("addon_clickup_project_sync").upsert({
        organization_id: auth.caller.organization_id,
        project_id: projectId,
        enabled: true,
        link_mode: linkMode,
        reconciling: false,
        last_reconcile_summary: summary,
        last_error: summary.errors[0] ?? null,
        updated_at: new Date().toISOString(),
      });

      // Drain any outbox that queued while reconciling was on
      void processOutbox(auth.admin, auth.caller.organization_id, 50);

      const { data } = await auth.admin
        .from("addon_clickup_project_sync")
        .select("*")
        .eq("organization_id", auth.caller.organization_id)
        .eq("project_id", projectId)
        .maybeSingle();

      return NextResponse.json({ sync: data, summary });
    }

    // Disable
    await auth.admin.from("addon_clickup_project_sync").upsert({
      organization_id: auth.caller.organization_id,
      project_id: projectId,
      enabled: false,
      reconciling: false,
      updated_at: new Date().toISOString(),
    });
    const { data } = await auth.admin
      .from("addon_clickup_project_sync")
      .select("*")
      .eq("organization_id", auth.caller.organization_id)
      .eq("project_id", projectId)
      .maybeSingle();
    return NextResponse.json({ sync: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
