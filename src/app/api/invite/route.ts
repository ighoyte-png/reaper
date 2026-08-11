import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireManagerApiAccess } from "@/lib/api/require-manager";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type InviteDelivery = "email" | "link";

/**
 * Invite / resend for managers.
 *
 * delivery: "email" (default) — Auth sends via dashboard Custom SMTP
 *   (inviteUserByEmail / resetPasswordForEmail).
 * delivery: "link" — mint generateLink only; return actionLink to copy.
 *   Do not mix: sending after generateLink invalidates the returned link.
 *
 * Body: { personId, email?, fullName?, resend?: boolean, delivery?: "email" | "link" }
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
      delivery?: string;
    };
    const personId = body.personId?.trim();
    const resend = Boolean(body.resend);
    const delivery: InviteDelivery =
      body.delivery === "link" ? "link" : "email";

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

      const { data: membership, error: membershipError } = await admin
        .from("organization_memberships")
        .select("role")
        .eq("user_id", person.profile_id)
        .eq("organization_id", caller.organization_id)
        .maybeSingle();

      if (membershipError || !membership) {
        return NextResponse.json(
          { error: "Linked profile or membership not found" },
          { status: 404 },
        );
      }

      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", person.profile_id)
        .maybeSingle();

      if (profileError || !profile?.email) {
        return NextResponse.json(
          { error: "Linked profile or email not found" },
          { status: 404 },
        );
      }

      if (membership.role === "admin") {
        return NextResponse.json(
          { error: "Ask an admin to reset that account from Auth settings" },
          { status: 403 },
        );
      }

      const email = profile.email.toLowerCase();

      if (delivery === "link") {
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
          delivery: "link",
          emailSent: false,
          actionLink,
        });
      }

      const sent = await sendRecoveryEmail(email, redirectTo);
      if (!sent.ok) {
        console.error("[invite] resend recovery email failed", sent.error);
        return NextResponse.json(
          { error: sent.error || "Could not send invite email" },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        resend: true,
        userId: profile.id,
        email,
        delivery: "email",
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

    let userId: string | undefined;
    let linkedExisting = false;
    let actionLink: string | null = null;
    let emailSent = false;

    if (delivery === "link") {
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
    } else {
      const { data: invited, error: inviteError } =
        await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: displayName },
          redirectTo,
        });

      if (!inviteError && invited?.user?.id) {
        userId = invited.user.id;
        emailSent = true;
      } else {
        const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
        const existing = listed.data.users.find(
          (u) => u.email?.toLowerCase() === email,
        );
        if (!existing) {
          console.error(
            "[invite] inviteUserByEmail failed",
            inviteError?.message,
          );
          return NextResponse.json(
            {
              error:
                inviteError?.message ||
                "Could not send invite email. Check Auth SMTP settings.",
            },
            { status: 400 },
          );
        }
        userId = existing.id;
        linkedExisting = true;
        const sent = await sendRecoveryEmail(email, redirectTo);
        if (!sent.ok) {
          console.error("[invite] recovery email failed", sent.error);
          return NextResponse.json(
            { error: sent.error || "Could not send invite email" },
            { status: 400 },
          );
        }
        emailSent = true;
      }

      if (!userId) {
        return NextResponse.json(
          { error: "Could not send invite email" },
          { status: 400 },
        );
      }
    }

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", userId)
      .maybeSingle();

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
      // Do not overwrite role/organization_id on profiles — memberships own those.
      await admin
        .from("profiles")
        .update({
          email: existingProfile.email || email,
          full_name: existingProfile.full_name || displayName,
        })
        .eq("id", userId);
    }

    const { error: membershipError } = await admin
      .from("organization_memberships")
      .upsert(
        {
          user_id: userId,
          organization_id: caller.organization_id,
          role: "member",
        },
        { onConflict: "user_id,organization_id" },
      );
    if (membershipError) {
      return NextResponse.json(
        { error: membershipError.message },
        { status: 400 },
      );
    }

    // Ensure invitee has an active org if none yet.
    const { data: active } = await admin
      .from("user_active_organization")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!active) {
      await admin.from("user_active_organization").upsert({
        user_id: userId,
        organization_id: caller.organization_id,
        updated_at: new Date().toISOString(),
      });
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
      delivery,
      emailSent,
      ...(actionLink ? { actionLink } : {}),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invite failed" },
      { status: 500 },
    );
  }
}

/** Triggers Auth recovery email (uses dashboard Custom SMTP). */
async function sendRecoveryEmail(
  email: string,
  redirectTo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Supabase is not configured" };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, error: "Supabase is not configured" };
  }
  const mailer = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await mailer.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
