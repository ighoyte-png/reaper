import { NextResponse } from "next/server";
import { requireManagerApiAccess } from "@/lib/api/require-manager";

/**
 * Invite / resend for managers.
 * Uses generateLink so managers always get a one-time actionLink to copy
 * (needed under Auth email rate limits). Does not call inviteUserByEmail /
 * resetPasswordForEmail afterward — those mint a new token and invalidate
 * the returned link. Never logs actionLink.
 *
 * Body: { personId, email?, fullName?, resend?: boolean }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireManagerApiAccess(request, {
      roleError: "Only admins and managers can invite",
    });
    if ("error" in auth) return auth.error;
    const { caller, admin, origin } = auth;

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
      const { data: linkData, error: linkError } =
        await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo },
        });
      const actionLink = linkData?.properties?.action_link ?? null;
      if (linkError || !actionLink) {
        console.error(
          "[invite] resend generateLink failed",
          linkError?.message,
        );
        return NextResponse.json(
          { error: "Could not create invite link" },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        resend: true,
        userId: profile.id,
        email,
        emailSent: false,
        actionLink,
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

    let userId: string | undefined;
    let actionLink: string | null = null;
    let linkedExisting = false;

    const { data: inviteLink, error: inviteLinkError } =
      await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          data: { full_name: displayName },
          redirectTo,
        },
      });

    if (!inviteLinkError && inviteLink?.user?.id) {
      userId = inviteLink.user.id;
      actionLink = inviteLink.properties?.action_link ?? null;
    } else {
      // Existing Auth user: issue recovery link instead.
      const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existing = listed.data.users.find(
        (u) => u.email?.toLowerCase() === email,
      );
      if (!existing) {
        console.error(
          "[invite] generateLink failed",
          inviteLinkError?.message,
        );
        return NextResponse.json(
          { error: "Could not create invite link" },
          { status: 400 },
        );
      }
      userId = existing.id;
      linkedExisting = true;
      const { data: recoveryLink, error: recoveryError } =
        await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo },
        });
      actionLink = recoveryLink?.properties?.action_link ?? null;
      if (recoveryError || !actionLink) {
        console.error(
          "[invite] recovery generateLink failed",
          recoveryError?.message,
        );
        return NextResponse.json(
          { error: "Could not create invite link" },
          { status: 400 },
        );
      }
    }

    if (!userId || !actionLink) {
      return NextResponse.json(
        { error: "Could not create invite link" },
        { status: 400 },
      );
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
      emailSent: false,
      actionLink,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invite failed" },
      { status: 500 },
    );
  }
}
