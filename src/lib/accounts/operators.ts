import type { SupabaseClient } from "@supabase/supabase-js";
import { writePlatformAudit } from "@/lib/accounts/audit";

export async function listPlatformOperators(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("platform_operators")
    .select("user_id, email, granted_by, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function isPlatformOperatorUser(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("platform_operators")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.user_id);
}

export async function grantPlatformOperator(
  admin: SupabaseClient,
  args: {
    email: string;
    grantedByUserId: string;
    grantedByEmail: string;
  },
): Promise<{ userId: string; email: string }> {
  const email = args.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Valid email is required");

  const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = listed.data.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    throw new Error(
      "No Auth user with that email. They must sign in or be invited first.",
    );
  }

  const meta = {
    ...(user.app_metadata ?? {}),
    platform_admin: true,
  };
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: meta,
  });
  if (metaError) throw new Error(metaError.message);

  const { error } = await admin.from("platform_operators").upsert(
    {
      user_id: user.id,
      email,
      granted_by: args.grantedByUserId,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);

  await writePlatformAudit(admin, {
    actorUserId: args.grantedByUserId,
    actorEmail: args.grantedByEmail,
    action: "platform.operator.grant",
    targetType: "user",
    targetId: user.id,
    meta: { email },
  });

  return { userId: user.id, email };
}

export async function revokePlatformOperator(
  admin: SupabaseClient,
  args: {
    userId: string;
    actorUserId: string;
    actorEmail: string;
  },
): Promise<void> {
  if (args.userId === args.actorUserId) {
    throw new Error("Cannot revoke your own platform operator access");
  }

  const { data: userData } = await admin.auth.admin.getUserById(args.userId);
  if (userData.user) {
    const meta = { ...(userData.user.app_metadata ?? {}) };
    delete meta.platform_admin;
    if (meta.role === "platform_admin") delete meta.role;
    await admin.auth.admin.updateUserById(args.userId, { app_metadata: meta });
  }

  const { error } = await admin
    .from("platform_operators")
    .delete()
    .eq("user_id", args.userId);
  if (error) throw new Error(error.message);

  await writePlatformAudit(admin, {
    actorUserId: args.actorUserId,
    actorEmail: args.actorEmail,
    action: "platform.operator.revoke",
    targetType: "user",
    targetId: args.userId,
  });
}
