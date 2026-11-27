import type { SupabaseClient } from "@supabase/supabase-js";
import { uniqueSlug } from "@/lib/slug";
import { sendRecoveryEmail } from "@/lib/accounts/auth-mail";
import { writePlatformAudit } from "@/lib/accounts/audit";

export type ProvisionAccountInput = {
  name: string;
  slug?: string | null;
  ownerEmail: string;
  ownerName?: string | null;
  delivery?: "email" | "link";
  origin: string;
  actorUserId: string;
  actorEmail: string;
};

export type ProvisionAccountResult = {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  ownerUserId: string;
  delivery: "email" | "link";
  emailSent: boolean;
  actionLink?: string;
  linkedExisting: boolean;
};

async function allocateSlug(
  admin: SupabaseClient,
  name: string,
  preferred?: string | null,
): Promise<string> {
  const { data } = await admin.from("organizations").select("slug");
  const existing = (data ?? []).map((r) => String(r.slug ?? ""));
  return uniqueSlug(name, existing, { preferred: preferred ?? null });
}

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<{ id: string; email?: string } | null> {
  const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
  const found = listed.data.users.find(
    (u) => u.email?.toLowerCase() === email,
  );
  return found ? { id: found.id, email: found.email } : null;
}

/**
 * Platform-operator provision: create org + owner membership + person + invite/recovery.
 */
export async function provisionAccount(
  admin: SupabaseClient,
  input: ProvisionAccountInput,
): Promise<ProvisionAccountResult> {
  const name = input.name.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const ownerName =
    input.ownerName?.trim() ||
    ownerEmail.split("@")[0] ||
    "Owner";
  const delivery = input.delivery === "link" ? "link" : "email";
  const redirectTo = `${input.origin}/set-password`;

  if (!name) throw new Error("Account name is required");
  if (!ownerEmail || !ownerEmail.includes("@")) {
    throw new Error("Owner email is required");
  }

  const slug = await allocateSlug(admin, name, input.slug);

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name, slug })
    .select("id, name, slug")
    .single();
  if (orgError || !org) {
    throw new Error(orgError?.message ?? "Could not create account");
  }
  const orgId = org.id as string;

  await admin
    .from("organization_settings")
    .upsert({ organization_id: orgId }, { onConflict: "organization_id" });

  let userId: string | undefined;
  let linkedExisting = false;
  let actionLink: string | undefined;
  let emailSent = false;

  if (delivery === "link") {
    const { data: inviteLink, error: inviteLinkError } =
      await admin.auth.admin.generateLink({
        type: "invite",
        email: ownerEmail,
        options: {
          data: { full_name: ownerName },
          redirectTo,
        },
      });
    if (!inviteLinkError && inviteLink?.user?.id) {
      userId = inviteLink.user.id;
      actionLink = inviteLink.properties?.action_link ?? undefined;
    } else {
      const existing = await findAuthUserByEmail(admin, ownerEmail);
      if (!existing) {
        throw new Error(
          inviteLinkError?.message ?? "Could not create invite link",
        );
      }
      userId = existing.id;
      linkedExisting = true;
      const { data: recoveryLink, error: recoveryError } =
        await admin.auth.admin.generateLink({
          type: "recovery",
          email: ownerEmail,
          options: { redirectTo },
        });
      actionLink = recoveryLink?.properties?.action_link ?? undefined;
      if (recoveryError || !actionLink) {
        throw new Error(
          recoveryError?.message ?? "Could not create invite link",
        );
      }
    }
  } else {
    const { data: invited, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(ownerEmail, {
        data: { full_name: ownerName },
        redirectTo,
      });
    if (!inviteError && invited?.user?.id) {
      userId = invited.user.id;
      emailSent = true;
    } else {
      const existing = await findAuthUserByEmail(admin, ownerEmail);
      if (!existing) {
        throw new Error(
          inviteError?.message ??
            "Could not send invite email. Check Auth SMTP settings.",
        );
      }
      userId = existing.id;
      linkedExisting = true;
      const sent = await sendRecoveryEmail(ownerEmail, redirectTo);
      if (!sent.ok) throw new Error(sent.error);
      emailSent = true;
    }
  }

  if (!userId) throw new Error("Could not resolve owner user");

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!existingProfile) {
    const { error } = await admin.from("profiles").insert({
      id: userId,
      organization_id: orgId,
      email: ownerEmail,
      full_name: ownerName,
      role: "admin",
    });
    if (error) throw new Error(error.message);
  } else {
    linkedExisting = true;
    await admin
      .from("profiles")
      .update({
        email: ownerEmail,
        full_name: ownerName,
        organization_id: orgId,
        role: "admin",
      })
      .eq("id", userId);
  }

  const { error: memError } = await admin
    .from("organization_memberships")
    .upsert(
      {
        user_id: userId,
        organization_id: orgId,
        role: "admin",
        is_owner: true,
      },
      { onConflict: "user_id,organization_id" },
    );
  if (memError) throw new Error(memError.message);

  await admin
    .from("organizations")
    .update({ owner_user_id: userId })
    .eq("id", orgId);

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
  }

  const { data: existingPerson } = await admin
    .from("people")
    .select("id")
    .eq("organization_id", orgId)
    .eq("profile_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existingPerson) {
    const { error: personError } = await admin.from("people").insert({
      organization_id: orgId,
      profile_id: userId,
      name: ownerName,
      email: ownerEmail,
      role_title: "Owner",
    });
    if (personError) throw new Error(personError.message);
  }

  await writePlatformAudit(admin, {
    actorUserId: input.actorUserId,
    actorEmail: input.actorEmail,
    action: "account.provision",
    organizationId: orgId,
    targetType: "organization",
    targetId: orgId,
    meta: { ownerEmail, ownerUserId: userId, delivery, linkedExisting },
  });

  return {
    organization: {
      id: orgId,
      name: String(org.name),
      slug: String(org.slug),
    },
    ownerUserId: userId,
    delivery,
    emailSent,
    actionLink,
    linkedExisting,
  };
}
