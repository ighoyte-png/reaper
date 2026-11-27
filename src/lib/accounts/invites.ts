import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/types";
import { sendRecoveryEmail } from "@/lib/accounts/auth-mail";
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
} from "@/lib/accounts/tokens";

export type InviteDelivery = "email" | "link";

export type CreateInviteInput = {
  organizationId: string;
  email: string;
  role?: Role;
  fullName?: string | null;
  personId?: string | null;
  invitedBy: string;
  delivery?: InviteDelivery;
  origin: string;
};

export type CreateInviteResult = {
  inviteId: string;
  email: string;
  role: Role;
  delivery: InviteDelivery;
  emailSent: boolean;
  actionLink?: string;
  acceptPath: string;
};

function acceptRedirect(origin: string, rawToken: string): string {
  return `${origin}/invite/accept?token=${encodeURIComponent(rawToken)}`;
}

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string } | null> {
  const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
  const found = listed.data.users.find(
    (u) => u.email?.toLowerCase() === email,
  );
  return found ? { id: found.id } : null;
}

/**
 * Create a pending org invite. Membership is created on accept, not here.
 */
export async function createOrganizationInvite(
  admin: SupabaseClient,
  input: CreateInviteInput,
): Promise<CreateInviteResult> {
  const email = input.email.trim().toLowerCase();
  const role: Role =
    input.role === "admin" || input.role === "manager" ? input.role : "member";
  const fullName = input.fullName?.trim() || null;
  const delivery: InviteDelivery =
    input.delivery === "link" ? "link" : "email";

  if (!email.includes("@")) throw new Error("Valid email is required");

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", email);
  const profileIds = new Set((profiles ?? []).map((p) => String(p.id)));
  if (profileIds.size > 0) {
    const { data: mem } = await admin
      .from("organization_memberships")
      .select("user_id")
      .eq("organization_id", input.organizationId)
      .in("user_id", [...profileIds]);
    if ((mem ?? []).length > 0) {
      throw new Error("That email already has access to this account");
    }
  }

  // Revoke prior pending invite for same email.
  await admin
    .from("organization_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("organization_id", input.organizationId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const { raw, hash } = generateInviteToken();
  const { data: invite, error } = await admin
    .from("organization_invites")
    .insert({
      organization_id: input.organizationId,
      email,
      role,
      full_name: fullName,
      person_id: input.personId ?? null,
      invited_by: input.invitedBy,
      token_hash: hash,
      expires_at: inviteExpiresAt(14),
    })
    .select("id")
    .single();
  if (error || !invite) {
    throw new Error(error?.message ?? "Could not create invite");
  }

  const redirectTo = acceptRedirect(input.origin, raw);
  let actionLink: string | undefined;
  let emailSent = false;

  // Prefers Auth invite so the user exists; accept link still required for membership.
  if (delivery === "link") {
    const { data: inviteLink, error: inviteLinkError } =
      await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          data: { full_name: fullName ?? email },
          redirectTo,
        },
      });
    if (!inviteLinkError && inviteLink?.properties?.action_link) {
      actionLink = inviteLink.properties.action_link;
    } else {
      const existing = await findAuthUserByEmail(admin, email);
      if (!existing) {
        throw new Error(
          inviteLinkError?.message ?? "Could not create invite link",
        );
      }
      const { data: recoveryLink, error: recoveryError } =
        await admin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo },
        });
      actionLink = recoveryLink?.properties?.action_link ?? undefined;
      if (recoveryError || !actionLink) {
        // Fall back to our accept URL as copyable link.
        actionLink = redirectTo;
      }
    }
  } else {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name: fullName ?? email },
        redirectTo,
      },
    );
    if (inviteError) {
      const existing = await findAuthUserByEmail(admin, email);
      if (!existing) {
        throw new Error(
          inviteError.message ||
            "Could not send invite email. Check Auth SMTP settings.",
        );
      }
      const sent = await sendRecoveryEmail(email, redirectTo);
      if (!sent.ok) throw new Error(sent.error);
    }
    emailSent = true;
    actionLink = redirectTo;
  }

  return {
    inviteId: invite.id as string,
    email,
    role,
    delivery,
    emailSent,
    actionLink,
    acceptPath: `/invite/accept?token=${encodeURIComponent(raw)}`,
  };
}

export async function revokeOrganizationInvite(
  admin: SupabaseClient,
  inviteId: string,
  organizationId: string,
): Promise<void> {
  const { error } = await admin
    .from("organization_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("organization_id", organizationId)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}

export async function resendOrganizationInvite(
  admin: SupabaseClient,
  inviteId: string,
  organizationId: string,
  invitedBy: string,
  origin: string,
  delivery: InviteDelivery = "email",
): Promise<CreateInviteResult> {
  const { data: row, error } = await admin
    .from("organization_invites")
    .select("*")
    .eq("id", inviteId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !row) throw new Error("Invite not found");
  if (row.accepted_at) throw new Error("Invite already accepted");
  if (row.revoked_at) throw new Error("Invite was revoked");

  await revokeOrganizationInvite(admin, inviteId, organizationId);
  return createOrganizationInvite(admin, {
    organizationId,
    email: String(row.email),
    role: row.role as Role,
    fullName: (row.full_name as string | null) ?? null,
    personId: (row.person_id as string | null) ?? null,
    invitedBy,
    delivery,
    origin,
  });
}

export async function acceptOrganizationInvite(
  admin: SupabaseClient,
  rawToken: string,
  userId: string,
  userEmail: string,
): Promise<{ organizationId: string; role: Role }> {
  const hash = hashInviteToken(rawToken);
  const { data: invite, error } = await admin
    .from("organization_invites")
    .select("*")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !invite) throw new Error("Invalid or expired invite");
  if (invite.revoked_at) throw new Error("Invite was revoked");
  if (invite.accepted_at) {
    return {
      organizationId: invite.organization_id as string,
      role: invite.role as Role,
    };
  }
  if (new Date(String(invite.expires_at)).getTime() < Date.now()) {
    throw new Error("Invite expired");
  }

  const inviteEmail = String(invite.email).toLowerCase();
  if (userEmail.trim().toLowerCase() !== inviteEmail) {
    throw new Error("Sign in with the invited email address");
  }

  const orgId = invite.organization_id as string;
  const role = invite.role as Role;
  const fullName =
    (invite.full_name as string | null)?.trim() ||
    inviteEmail.split("@")[0] ||
    "Member";

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!existingProfile) {
    const { error: profileError } = await admin.from("profiles").insert({
      id: userId,
      organization_id: orgId,
      email: inviteEmail,
      full_name: fullName,
      role,
    });
    if (profileError) throw new Error(profileError.message);
  } else {
    await admin
      .from("profiles")
      .update({
        email: inviteEmail,
        full_name: fullName,
      })
      .eq("id", userId);
  }

  const { error: memError } = await admin
    .from("organization_memberships")
    .upsert(
      {
        user_id: userId,
        organization_id: orgId,
        role,
        is_owner: false,
      },
      { onConflict: "user_id,organization_id" },
    );
  if (memError) throw new Error(memError.message);

  const { data: active } = await admin
    .from("user_active_organization")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!active) {
    await admin.from("user_active_organization").upsert({
      user_id: userId,
      organization_id: orgId,
      updated_at: new Date().toISOString(),
    });
  } else {
    await admin
      .from("user_active_organization")
      .update({
        organization_id: orgId,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  // Mirror active org onto profile.
  await admin
    .from("profiles")
    .update({ organization_id: orgId, role })
    .eq("id", userId);

  const personId = invite.person_id as string | null;
  if (personId) {
    await admin
      .from("people")
      .update({ profile_id: userId, email: inviteEmail })
      .eq("id", personId)
      .eq("organization_id", orgId);
  } else {
    const { data: existingPerson } = await admin
      .from("people")
      .select("id")
      .eq("organization_id", orgId)
      .eq("profile_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existingPerson) {
      await admin.from("people").insert({
        organization_id: orgId,
        profile_id: userId,
        name: fullName,
        email: inviteEmail,
      });
    }
  }

  await admin
    .from("organization_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return { organizationId: orgId, role };
}
