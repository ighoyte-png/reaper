import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/roles";
import { requireManagerApiAccess } from "@/lib/api/require-manager";
import { DELETED_USER_LABEL } from "@/lib/domain/people";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Soft-delete a person and remove their Supabase Auth user (when safe).
 * Keeps tasks/comments; authorship falls back to "Deleted user".
 *
 * Guards: cannot delete yourself; cannot delete the last org admin;
 * managers cannot delete admins.
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const auth = await requireManagerApiAccess(request, {
      roleError: "Only admins and managers can delete people",
    });
    if ("error" in auth) return auth.error;
    const { caller, admin } = auth;
    const { id: personId } = await context.params;

    if (!personId?.trim()) {
      return NextResponse.json({ error: "Person id is required" }, { status: 400 });
    }

    const { data: person, error: personError } = await admin
      .from("people")
      .select("id, profile_id, email, name, organization_id, deleted_at")
      .eq("id", personId)
      .eq("organization_id", caller.organization_id)
      .maybeSingle();

    if (personError || !person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    if (person.deleted_at) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }

    const authUserId = await resolveAuthUserId(
      admin,
      person,
      caller.organization_id,
    );

    let profileRole: string | null = null;
    if (authUserId) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id, role, organization_id")
        .eq("id", authUserId)
        .maybeSingle();

      if (profile && profile.organization_id === caller.organization_id) {
        profileRole = profile.role;
      }

      if (authUserId === caller.id) {
        return NextResponse.json(
          { error: "You can’t delete your own account" },
          { status: 403 },
        );
      }

      if (profileRole === "admin" && !isAdmin(caller.role)) {
        return NextResponse.json(
          { error: "Ask an admin to delete that account" },
          { status: 403 },
        );
      }

      if (profileRole === "admin") {
        const { count, error: countError } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", caller.organization_id)
          .eq("role", "admin");
        if (countError) {
          return NextResponse.json(
            { error: countError.message },
            { status: 400 },
          );
        }
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: "Cannot delete the last admin in this workspace" },
            { status: 403 },
          );
        }
      }
    }

    const orgId = caller.organization_id;

    // Unassign open work; keep the tasks themselves.
    const { error: unassignError } = await admin
      .from("tasks")
      .update({ assignee_person_id: null })
      .eq("organization_id", orgId)
      .eq("assignee_person_id", personId);
    if (unassignError) {
      return NextResponse.json({ error: unassignError.message }, { status: 400 });
    }

    // Remove schedule / membership linkages (not created content).
    const cleanupOps = await Promise.all([
      admin
        .from("assignments")
        .delete()
        .eq("organization_id", orgId)
        .eq("person_id", personId),
      admin
        .from("leave_days")
        .delete()
        .eq("organization_id", orgId)
        .eq("person_id", personId),
      admin
        .from("pod_members")
        .delete()
        .eq("organization_id", orgId)
        .eq("person_id", personId),
      admin
        .from("project_members")
        .delete()
        .eq("organization_id", orgId)
        .eq("person_id", personId),
      admin
        .from("pods")
        .update({ manager_person_id: null })
        .eq("organization_id", orgId)
        .eq("manager_person_id", personId),
      admin
        .from("projects")
        .update({ manager_person_id: null })
        .eq("organization_id", orgId)
        .eq("manager_person_id", personId),
    ]);
    for (const op of cleanupOps) {
      if (op.error) {
        return NextResponse.json({ error: op.error.message }, { status: 400 });
      }
    }

    const deletedAt = new Date().toISOString();
    const { error: softDeleteError } = await admin
      .from("people")
      .update({
        deleted_at: deletedAt,
        profile_id: null,
        name: DELETED_USER_LABEL,
        email: "",
        avatar_url: null,
        avatar_attachment_id: null,
        hide_from_schedule: true,
        hide_from_utilization: true,
      })
      .eq("id", personId)
      .eq("organization_id", orgId);
    if (softDeleteError) {
      return NextResponse.json(
        { error: softDeleteError.message },
        { status: 400 },
      );
    }

    let authDeleted = false;
    if (authUserId) {
      const { error: authDeleteError } =
        await admin.auth.admin.deleteUser(authUserId);
      if (authDeleteError) {
        console.error(
          "[people.delete] auth delete failed",
          authDeleteError.message,
        );
        return NextResponse.json(
          {
            error:
              "Person removed from the workspace, but could not delete their login. Remove them from Auth manually.",
            personDeleted: true,
            authDeleted: false,
            authUserId,
          },
          { status: 502 },
        );
      }
      authDeleted = true;
    }

    return NextResponse.json({
      ok: true,
      personDeleted: true,
      authDeleted,
      authUserId: authUserId ?? null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 },
    );
  }
}

type AdminClient = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

async function resolveAuthUserId(
  admin: AdminClient,
  person: {
    profile_id: string | null;
    email: string | null;
  },
  organizationId: string,
): Promise<string | null> {
  if (person.profile_id) {
    const { data: linked } = await admin
      .from("profiles")
      .select("id")
      .eq("id", person.profile_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (linked?.id) return linked.id;
  }

  const email =
    typeof person.email === "string" ? person.email.trim().toLowerCase() : "";
  if (!email) return null;

  const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = listed.data.users.find(
    (u) => u.email?.toLowerCase() === email,
  );
  if (!user) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return user.id;
  if (profile.organization_id !== organizationId) return null;
  return user.id;
}
