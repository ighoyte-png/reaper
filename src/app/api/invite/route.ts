import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { canManage } from "@/lib/auth/roles";
import { assertAllowedSiteOrigin } from "@/lib/security/request";

async function requireManager(request: Request) {
  if (!isSupabaseConfigured()) {
    return {
      error: NextResponse.json(
        { error: "Supabase is not configured" },
        { status: 400 },
      ),
    };
  }
  if (!isServiceRoleConfigured()) {
    return {
      error: NextResponse.json(
        {
          error:
            "Add SUPABASE_SERVICE_ROLE_KEY to .env (Project Settings → API → secret / service_role).",
        },
        { status: 400 },
      ),
    };
  }

  const originCheck = assertAllowedSiteOrigin(request);
  if (!originCheck.ok) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      error: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }

  const { data: caller, error: callerError } = await supabase
    .from("profiles")
    .select("id, organization_id, role, full_name")
    .eq("id", user.id)
    .single();

  if (callerError || !caller) {
    return {
      error: NextResponse.json({ error: "No profile" }, { status: 403 }),
    };
  }
  if (!canManage(caller.role)) {
    return {
      error: NextResponse.json(
        { error: "Only admins and managers can invite" },
        { status: 403 },
      ),
    };
  }

  return {
    caller,
    admin: createAdminClient(),
    origin: originCheck.origin,
  };
}

/**
 * Email-only invites. Never returns recovery/magic/action links.
 * Body: { personId, email?, fullName?, resend?: boolean }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireManager(request);
    if ("error" in auth && auth.error) return auth.error;
    const { caller, admin, origin } = auth as {
      caller: { organization_id: string };
      admin: ReturnType<typeof createAdminClient>;
      origin: string;
    };

    const body = (await request.json()) as {
      personId?: string;
      email?: string;
      fullName?: string;
      resend?: boolean;
    };
    const personId = body.personId?.trim();
    const resend = Boolean(body.resend);

    if (!personId) {
      return NextResponse.json(
        { error: "personId is required" },
        { status: 400 },
      );
    }

    const { data: person, error: personError } = await admin
      .from("people")
      .select("*")
      .eq("id", personId)
      .eq("organization_id", caller.organization_id)
      .maybeSingle();

    if (personError || !person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const redirectTo = `${origin}/set-password`;

    // --- Resend invite for an already-linked person ---
    if (resend) {
      if (!person.profile_id) {
        return NextResponse.json(
          { error: "This person has no login yet. Use Invite first." },
          { status: 400 },
        );
      }

      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id, email, full_name, organization_id, role")
        .eq("id", person.profile_id)
        .eq("organization_id", caller.organization_id)
        .maybeSingle();

      if (profileError || !profile?.email) {
        return NextResponse.json(
          { error: "Linked profile or email not found" },
          { status: 404 },
        );
      }

      // Do not issue recovery links for admins via manager invite UI.
      if (profile.role === "admin") {
        return NextResponse.json(
          { error: "Ask an admin to reset that account from Auth settings" },
          { status: 403 },
        );
      }

      const email = profile.email.toLowerCase();
      const { error: resetError } = await admin.auth.resetPasswordForEmail(
        email,
        { redirectTo },
      );
      if (resetError) {
        console.error("[invite] resend failed", resetError.message);
        return NextResponse.json(
          { error: "Could not send invite email" },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        resend: true,
        userId: profile.id,
        email,
        emailSent: true,
      });
    }

    // --- First-time invite ---
    const email =
      body.email?.trim().toLowerCase() ||
      (typeof person.email === "string" ? person.email.trim().toLowerCase() : "");
    const fullName = body.fullName?.trim();

    if (!email) {
      return NextResponse.json(
        { error: "personId and email are required" },
        { status: 400 },
      );
    }
    if (person.profile_id) {
      return NextResponse.json(
        {
          error:
            "This person already has a linked login. Use Resend invite instead.",
        },
        { status: 400 },
      );
    }

    const displayName = fullName || person.name;

    const { data: invited, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: displayName },
        redirectTo,
      });

    let userId = invited?.user?.id as string | undefined;
    let linkedExisting = false;

    if (inviteError || !userId) {
      // Existing Auth user: send password reset email only (no action link in JSON).
      const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existing = listed.data.users.find(
        (u) => u.email?.toLowerCase() === email,
      );
      if (!existing) {
        console.error("[invite] create failed", inviteError?.message);
        return NextResponse.json(
          { error: "Could not send invite email" },
          { status: 400 },
        );
      }
      userId = existing.id;
      linkedExisting = true;
      const { error: resetError } = await admin.auth.resetPasswordForEmail(
        email,
        { redirectTo },
      );
      if (resetError) {
        console.error("[invite] existing-user reset failed", resetError.message);
        return NextResponse.json(
          { error: "Could not send invite email" },
          { status: 400 },
        );
      }
    }

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, organization_id")
      .eq("id", userId)
      .maybeSingle();

    if (
      existingProfile &&
      existingProfile.organization_id !== caller.organization_id
    ) {
      return NextResponse.json(
        { error: "That email already belongs to another organization" },
        { status: 400 },
      );
    }

    if (!existingProfile) {
      const { error: profileError } = await admin.from("profiles").insert({
        id: userId,
        organization_id: caller.organization_id,
        email,
        full_name: displayName,
        role: "member",
      });
      if (profileError) {
        return NextResponse.json(
          { error: profileError.message },
          { status: 400 },
        );
      }
    } else {
      linkedExisting = true;
      await admin
        .from("profiles")
        .update({
          email,
          full_name: displayName,
          role: "member",
        })
        .eq("id", userId)
        .eq("organization_id", caller.organization_id);
    }

    const { error: personLinkError } = await admin
      .from("people")
      .update({ profile_id: userId })
      .eq("id", personId)
      .eq("organization_id", caller.organization_id);

    if (personLinkError) {
      return NextResponse.json(
        { error: personLinkError.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      userId,
      linkedExisting,
      resend: false,
      emailSent: true,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invite failed" },
      { status: 500 },
    );
  }
}
