import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountEntitlements = {
  organizationId: string;
  planKey: string;
  status: string;
  seatLimit: number | null;
  seatUsed: number;
  seatsRemaining: number | null;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export const SEAT_LIMIT_ERROR_CODE = "seat_limit" as const;

export function seatsRemaining(
  seatLimit: number | null,
  seatUsed: number,
): number | null {
  return seatLimit == null ? null : Math.max(0, seatLimit - seatUsed);
}

export function isAtOrOverSeatLimit(ent: AccountEntitlements): boolean {
  return ent.seatLimit != null && ent.seatUsed >= ent.seatLimit;
}

export function seatLimitMessage(ent: AccountEntitlements): string {
  const limit = ent.seatLimit ?? 0;
  const used = ent.seatUsed;
  if (used > limit) {
    return `Over seat limit (${used}/${limit}). Remove a member or revoke a pending invite, or ask a platform administrator to raise the limit.`;
  }
  return `Seat limit reached (${used}/${limit}). Revoke a pending invite or ask a platform administrator to raise the limit.`;
}

export class SeatLimitError extends Error {
  readonly code = SEAT_LIMIT_ERROR_CODE;
  readonly entitlements: AccountEntitlements;

  constructor(entitlements: AccountEntitlements) {
    super(seatLimitMessage(entitlements));
    this.name = "SeatLimitError";
    this.entitlements = entitlements;
  }
}

export async function getAccountEntitlements(
  admin: SupabaseClient,
  organizationId: string,
): Promise<AccountEntitlements> {
  const [{ data: billing }, { count: memberCount }, { count: inviteCount }] =
    await Promise.all([
      admin
        .from("billing_accounts")
        .select(
          "plan_key, status, seat_limit, trial_ends_at, stripe_customer_id, stripe_subscription_id",
        )
        .eq("organization_id", organizationId)
        .maybeSingle(),
      admin
        .from("organization_memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      admin
        .from("organization_invites")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("accepted_at", null)
        .is("revoked_at", null),
    ]);

  const seatLimit =
    typeof billing?.seat_limit === "number" ? billing.seat_limit : null;
  const seatUsed = (memberCount ?? 0) + (inviteCount ?? 0);

  return {
    organizationId,
    planKey: String(billing?.plan_key ?? "free"),
    status: String(billing?.status ?? "none"),
    seatLimit,
    seatUsed,
    seatsRemaining: seatsRemaining(seatLimit, seatUsed),
    trialEndsAt: (billing?.trial_ends_at as string | null) ?? null,
    stripeCustomerId: (billing?.stripe_customer_id as string | null) ?? null,
    stripeSubscriptionId:
      (billing?.stripe_subscription_id as string | null) ?? null,
  };
}

/** Throws SeatLimitError when the org cannot add `needed` more seats. */
export async function assertSeatAvailable(
  admin: SupabaseClient,
  organizationId: string,
  needed = 1,
): Promise<AccountEntitlements> {
  const ent = await getAccountEntitlements(admin, organizationId);
  if (ent.seatLimit == null) return ent;
  if (ent.seatUsed + needed > ent.seatLimit) {
    throw new SeatLimitError(ent);
  }
  return ent;
}
