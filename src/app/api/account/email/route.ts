import { NextResponse } from "next/server";
import { requireManagerApiAccess } from "@/lib/api/require-manager";
import { isAdmin } from "@/lib/auth/roles";

/**
 * Sync a linked person's login email to Supabase Auth and profiles.
 * Body: { personId, email }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireManagerApiAccess(request, {
      roleError: "Only admins and managers can change login emails",
    });
    if ("error" in auth) return auth.error;
    const { caller, admin } = auth;

    const body = (await request.json()) as {
      personId?: string;
      email?: string;
    };
    const personId = body.personId?.trim();
    const email = body.email?.trim().toLowerCase() ?? "";

    if (!personId || !email) {
      return NextResponse.json(
        { error: "personId and email are required" },
        { status: 400 },
      );
    }

    const { data: person, error: personError } = await admin
      .from("people")
      .select("id, profile_id, email")
      .eq("id", personId)
      .eq("organization_id", caller.organization_id)
      .maybeSingle();

    if (personError || !person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    if (!person.profile_id) {
      return NextResponse.json(
        { error: "This person has no login yet. Invite them first." },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, email, role, organization_id")
      .eq("id", person.profile_id)
      .eq("organization_id", caller.organization_id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Linked profile not found" },
        { status: 404 },
      );
    }

    if (profile.email?.toLowerCase() === email) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    if (profile.role === "admin" && !isAdmin(caller.role)) {
      return NextResponse.json(
        { error: "Ask an admin to change that account email" },
        { status: 403 },
      );
    }

    const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = listed.data.users.find(
      (user: { id: string; email?: string | null }) =>
        user.email?.toLowerCase() === email && user.id !== person.profile_id,
    );
    if (existing) {
      return NextResponse.json(
        { error: "That email is already used by another account" },
        { status: 400 },
      );
    }

    const { error: authError } = await admin.auth.admin.updateUserById(
      person.profile_id,
      { email },
    );
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const { error: profileUpdateError } = await admin
      .from("profiles")
      .update({ email })
      .eq("id", person.profile_id)
      .eq("organization_id", caller.organization_id);
    if (profileUpdateError) {
      return NextResponse.json(
        { error: profileUpdateError.message },
        { status: 400 },
      );
    }

    await admin
      .from("people")
      .update({ email })
      .eq("id", personId)
      .eq("organization_id", caller.organization_id);

    return NextResponse.json({ ok: true, email });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update email" },
      { status: 500 },
    );
  }
}
