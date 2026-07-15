import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { canManage } from "@/lib/auth/roles";

async function requireManager() {
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

  return { caller, admin: createAdminClient() };
}

export async function POST(request: Request) {
  try {
    const auth = await requireManager();
    if ("error" in auth && auth.error) return auth.error;
    const { caller, admin } = auth as {
      caller: { organization_id: string };
      admin: ReturnType<typeof createAdminClient>;
    };

    const body = (await request.json()) as {
      personId?: string;
      email?: string;
      fullName?: string;
      resend?: boolean;
      /** When true, Supabase sends invite/recovery mail. Default false (link only). */
      sendEmail?: boolean;
    };
    const personId = body.personId?.trim();
    const resend = Boolean(body.resend);
    const sendEmail = Boolean(body.sendEmail);

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

    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";

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
        .select("id, email, full_name, organization_id")
        .eq("id", person.profile_id)
        .eq("organization_id", caller.organization_id)
        .maybeSingle();

      if (profileError || !profile?.email) {
        return NextResponse.json(
          { error: "Linked profile or email not found" },
          { status: 404 },
        );
      }

      const email = profile.email.toLowerCase();
      const redirectTo = `${origin}/set-password`;

      let emailSent = false;
      let emailError: string | null = null;

      // Resend only emails when explicitly requested (same as Add & invite).
      if (sendEmail) {
        const { error: resetError } = await admin.auth.resetPasswordForEmail(
          email,
          { redirectTo },
        );
        if (resetError) {
          emailError = resetError.message;
        } else {
          emailSent = true;
        }
      }

      // Always produce a shareable link for the admin (does not send email).
      let inviteUrl: string | null = null;
      const { data: recovery } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      inviteUrl = recovery?.properties?.action_link ?? null;

      if (!inviteUrl) {
        const { data: magic } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo },
        });
        inviteUrl = magic?.properties?.action_link ?? null;
      }

      if (!inviteUrl && !emailSent) {
        return NextResponse.json(
          {
            error:
              emailError ||
              "Could not generate an invite link",
          },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        resend: true,
        userId: profile.id,
        email,
        inviteUrl,
        emailSent,
        emailError,
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
    const redirectTo = `${origin}/set-password`;
    let linkedExisting = false;
    let inviteUrl: string | null = null;
    let userId: string | undefined;
    let emailSent = false;
    let emailError: string | null = null;

    async function findAuthUserByEmail(addr: string) {
      const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
      return listed.data.users.find((u) => u.email?.toLowerCase() === addr);
    }

    /** Creates / resolves Auth user and returns a shareable link. Never sends mail. */
    async function linkOnlyInvite() {
      const { data: linkData, error: linkError } =
        await admin.auth.admin.generateLink({
          type: "invite",
          email,
          options: {
            data: { full_name: displayName },
            redirectTo,
          },
        });

      if (!linkError && linkData?.user?.id) {
        return {
          userId: linkData.user.id,
          inviteUrl: linkData.properties?.action_link ?? null,
          linkedExisting: false,
          error: null as string | null,
        };
      }

      const existing = await findAuthUserByEmail(email);
      if (!existing) {
        return {
          userId: undefined,
          inviteUrl: null,
          linkedExisting: false,
          error:
            linkError?.message ||
            "Could not create invite. Check Auth → Users / logs in Supabase.",
        };
      }

      const { data: recovery } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo,
        },
      });

      return {
        userId: existing.id,
        inviteUrl: recovery?.properties?.action_link ?? null,
        linkedExisting: true,
        error: linkError?.message ?? null,
      };
    }

    if (sendEmail) {
      // Prefer inviteUserByEmail (creates user + sends mail). On rate limit /
      // mailer failure, still create the user via generateLink so the invite
      // isn't lost — admin gets a copyable URL instead.
      const { data: invited, error: inviteError } =
        await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: displayName },
          redirectTo,
        });

      if (!inviteError && invited?.user?.id) {
        userId = invited.user.id;
        emailSent = true;
        const { data: linkData } = await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: {
            redirectTo,
          },
        });
        inviteUrl = linkData?.properties?.action_link ?? null;
      } else {
        emailError = inviteError?.message ?? "Could not send invite email";
        const fallback = await linkOnlyInvite();
        if (!fallback.userId) {
          return NextResponse.json(
            { error: fallback.error || emailError },
            { status: 400 },
          );
        }
        userId = fallback.userId;
        inviteUrl = fallback.inviteUrl;
        linkedExisting = fallback.linkedExisting;
        // Do not call resetPasswordForEmail here — that also burns the mail quota.
      }
    } else {
      const result = await linkOnlyInvite();
      if (!result.userId) {
        return NextResponse.json(
          {
            error:
              result.error ||
              "Could not create invite link. Check Auth → Users / logs in Supabase.",
          },
          { status: 400 },
        );
      }
      userId = result.userId;
      inviteUrl = result.inviteUrl;
      linkedExisting = result.linkedExisting;
      emailError = result.error;
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Could not resolve invited user id" },
        { status: 500 },
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
        .eq("id", userId);
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
      inviteUrl,
      linkedExisting,
      resend: false,
      emailSent,
      emailError,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invite failed" },
      { status: 500 },
    );
  }
}
